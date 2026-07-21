import { NextRequest, NextResponse } from 'next/server';
import { getNewslettersDueForGeneration, getNewslettersForForcedGeneration, getNewsletterSources, getCurrentSendWindow, getCurrentPSTDay } from '@/lib/db/newsletters-v2';
import { getRecentContentForSources, getContextContentForSources, groupContentByHandle } from '@/lib/db/content-twitter';
import { getRecentContentForNewsletterSources, getContextContentForNewsletterSources, groupNewsletterContentBySlug } from '@/lib/db/content-newsletter';
import { getNewsletterSubscribers } from '@/lib/db/subscriptions';
import { getSupabase } from '@/lib/db/client';
import { storeRun, storeSkippedRun, updateRunStatus, getRecentDeliveredRuns } from '@/lib/db/newsletter-runs';
import { recordBulkDeliveries } from '@/lib/db/newsletter-deliveries';
import { generateNewsletterV2 } from '@/lib/synthesis/generator-v2';
import { sendNewsletter } from '@/lib/email/sender';
import { sendTelegramNewsletter, sendTelegramAudio } from '@/lib/telegram/client';
import { chargeOwner, chargeSubscriber } from '@/lib/db/credits';
import { calculateOwnerCreditCost, calculateSubscriberCreditCost, DISPATCH_SOURCE_CAP } from '@/lib/pricing';
import { getPromptTemplateById } from '@/lib/db/prompt-templates';
import { NEWSLETTER_SYSTEM_PROMPT } from '@/lib/synthesis/prompts';
import { getWatchlistTickers } from '@/lib/db/watchlists';
import { generateDispatchAudio } from '@/lib/audio/generate';
import { setDispatchAudio } from '@/lib/db/personal-dispatches';
import { postDispatchToDiscord } from '@/lib/discord/post';
import { queueDispatchTweetForRunId } from '@/lib/dispatch-x-crosspost';

export const maxDuration = 300; // 5 minutes

// GET /api/cron/generate-newsletters — generate due newsletters and deliver to subscribers
// Triggered by Vercel cron every 5 minutes
export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[generate] CRON_SECRET is not set — refusing to run');
      return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
    }
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Manual-testing escape hatch: ?force=true bypasses the time-of-day/day
    // gate. Still requires active subscribers. Optional newsletter_id scopes
    // to one newsletter. Auth header is already verified above.
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';
    const forceNewsletterId = url.searchParams.get('newsletter_id') || undefined;

    const dueNewsletters = force
      ? await getNewslettersForForcedGeneration(forceNewsletterId)
      : await getNewslettersDueForGeneration();

    if (dueNewsletters.length === 0) {
      return NextResponse.json({
        success: true,
        message: force ? 'No newsletters with active subscribers' : 'No newsletters due',
        generated: 0,
        forced: force,
      });
    }

    console.log(`[generate] ${dueNewsletters.length} newsletter(s) ${force ? 'forced' : 'due'} for generation`);

    const results: Record<string, { status: string; subscribers?: number; error?: string }> = {};

    // Atomic dedup key for this run: the cron fires 3×/active-hour (:00/:05/:10) and
    // Vercel can double-invoke, so concurrent runs used to both pass the 5h-gap guard
    // and double-generate+deliver. We claim a (newsletter, date, window) lock below.
    const lockSupabase = getSupabase();
    const dispatchDate = new Date().toISOString().split('T')[0];
    const dispatchWindow = getCurrentSendWindow();

    for (const newsletter of dueNewsletters) {
      try {
        console.log(`[generate] Processing: ${newsletter.name} (${newsletter.id})`);

        // 1. Get sources for this newsletter
        const allSources = await getNewsletterSources(newsletter.id);
        if (allSources.length === 0) {
          console.log(`[generate] Skipping ${newsletter.name}: no sources`);
          await storeSkippedRun(newsletter.id, 'skipped', 'No sources configured');
          results[newsletter.name] = { status: 'skipped', error: 'No sources configured' };
          continue;
        }
        // Hard cap sources per dispatch (cost guardrail). Juntos are already
        // capped at 20; this also bounds the direct newsletter_sources path.
        const sources = allSources.slice(0, DISPATCH_SOURCE_CAP);
        if (allSources.length > DISPATCH_SOURCE_CAP) {
          console.warn(`[generate] ${newsletter.name}: ${allSources.length} sources exceeds cap ${DISPATCH_SOURCE_CAP} — using first ${DISPATCH_SOURCE_CAP}`);
        }

        const sourceIds = sources.map((s) => s.id);
        const sourceMap: Record<string, string> = {};
        sources.forEach((s) => { sourceMap[s.id] = s.handle_or_url; });

        // Separate newsletter-type sources from other sources
        const newsletterSourceIds = sources.filter((s) => s.type === 'newsletter').map((s) => s.id);
        const twitterSourceIds = sourceIds.filter((id) => !newsletterSourceIds.includes(id));

        // 2. Fetch recent content (last 48h) and context (last 7d, not 180d)
        // Context is limited to 7 days to avoid stale data polluting the briefing
        const [recentContent, contextContent, recentNewsletterContent, contextNewsletterContent] = await Promise.all([
          getRecentContentForSources(twitterSourceIds, 48),
          getContextContentForSources(twitterSourceIds, 7, 48),
          getRecentContentForNewsletterSources(newsletterSourceIds, 48),
          getContextContentForNewsletterSources(newsletterSourceIds, 7, 48),
        ]);

        if (recentContent.length === 0 && recentNewsletterContent.length === 0) {
          console.log(`[generate] Skipping ${newsletter.name}: no recent content (last 48h)`);
          await storeSkippedRun(newsletter.id, 'skipped', 'No recent content in last 48 hours', {
            source_count: sources.length,
          });
          results[newsletter.name] = { status: 'skipped', error: 'No recent content in last 48 hours' };
          continue;
        }

        // Atomic claim — the unique PK on (newsletter_id, dispatch_date, send_window)
        // means only ONE concurrent invocation wins; the rest skip here instead of
        // generating + delivering (and double-charging credits) a second time.
        // Placed after the content check so a no-content skip never holds the lock.
        if (!force && dispatchWindow) {
          const { error: lockErr } = await lockSupabase
            .from('newsletter_dispatch_locks')
            .insert({ newsletter_id: newsletter.id, dispatch_date: dispatchDate, send_window: dispatchWindow });
          if (lockErr) {
            console.log(`[generate] ${newsletter.name}: ${dispatchWindow} already claimed for ${dispatchDate} — skipping (dedup)`);
            results[newsletter.name] = { status: 'skipped', error: 'Already generated this window (dedup)' };
            continue;
          }
        }

        console.log(
          `[generate] ${newsletter.name}: ${recentContent.length} recent tweets, ${contextContent.length} context tweets (7d)` +
          (recentNewsletterContent.length > 0 ? `, ${recentNewsletterContent.length} recent newsletter issues` : '')
        );

        // 3. Group content by handle for the synthesis pipeline
        const recentGrouped = groupContentByHandle(recentContent, sourceMap);
        const contextGrouped = groupContentByHandle(contextContent, sourceMap);
        const recentNewsletterGrouped = groupNewsletterContentBySlug(recentNewsletterContent, sourceMap);
        const contextNewsletterGrouped = groupNewsletterContentBySlug(contextNewsletterContent, sourceMap);

        // 4. Generate newsletter
        const now = new Date();
        const startDate = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = now.toISOString().split('T')[0];

        console.log(`[generate] Generating ${newsletter.name} from ${recentContent.length} recent tweets...`);

        // Resolve prompt: template > custom > system default
        let resolvedPrompt = NEWSLETTER_SYSTEM_PROMPT;
        if (newsletter.prompt_template_id) {
          const template = await getPromptTemplateById(newsletter.prompt_template_id);
          if (template) resolvedPrompt = template.prompt;
        } else if (newsletter.prompt) {
          resolvedPrompt = newsletter.prompt;
        }

        // Load watchlist tickers if this dispatch has one pinned
        const watchlistTickers = newsletter.watchlist_id
          ? await getWatchlistTickers(newsletter.watchlist_id)
          : undefined;

        if (watchlistTickers?.length) {
          console.log(`[generate] ${newsletter.name}: watchlist tickers — ${watchlistTickers.join(', ')}`);
        }

        // Pull last 3 delivered runs so the LLM can avoid repeating quotes/themes
        const recentDispatches = await getRecentDeliveredRuns(newsletter.id, 3);

        const result = await generateNewsletterV2({
          prompt: resolvedPrompt,
          secondaryPrompt: newsletter.secondary_prompt,
          recentTweets: recentGrouped,
          contextTweets: contextGrouped,
          recentNewsletterContent: recentNewsletterGrouped,
          contextNewsletterContent: contextNewsletterGrouped,
          startDate,
          endDate,
          newsletterName: newsletter.name,
          watchlistTickers,
          recentDispatches,
        });

        // 5. Store the run (status updated after delivery)
        const run = await storeRun({
          newsletter_id: newsletter.id,
          content: result.content,
          subject: result.subject,
          model_used: result.model_used,
          tokens_used: { input_tokens: result.input_tokens, output_tokens: result.output_tokens },
          status: 'generated',
          metadata: {
            source_count: sources.length,
            recent_tweet_count: recentContent.length,
            context_tweet_count: contextContent.length,
            recent_newsletter_count: recentNewsletterContent.length,
            context_newsletter_count: contextNewsletterContent.length,
          },
        });

        console.log(`[generate] Run stored: ${run.id} — "${result.subject}"`);

        // 5b. Mirror the dispatch to its Discord channel, if mapped (migration 074).
        // Best-effort: a Discord failure must never block delivery or billing.
        const discordChannelId = (newsletter as any).discord_channel_id as string | null;
        if (discordChannelId) {
          try {
            await postDispatchToDiscord({
              channelId: discordChannelId,
              subject: result.subject,
              content: result.content,
              generatedAt: (run as any).generated_at,
              subscribeUrl: `${process.env.APP_BASE_URL || 'https://www.myjunto.xyz'}/newsletter/${newsletter.id}`,
            });
            console.log(`[generate] ${newsletter.name}: posted to Discord channel ${discordChannelId}`);
          } catch (discordErr) {
            console.error(`[generate] ${newsletter.name}: Discord post failed`, discordErr);
          }
        }

        // 6. Charge the owner (doubled when voice memo is enabled on the dispatch)
        const audioEnabled = !!(newsletter as any).audio_enabled;
        const ownerCost = calculateOwnerCreditCost(sources.length, audioEnabled);
        const ownerCharged = await chargeOwner(newsletter.admin_user_id, newsletter.name, ownerCost, run.id);
        if (!ownerCharged) {
          const errMsg = `Owner insufficient credits (needs ${ownerCost})`;
          console.log(`[generate] ${newsletter.name}: ${errMsg}`);
          await updateRunStatus(run.id, 'generated_not_delivered', errMsg);
          results[newsletter.name] = { status: 'generated_not_delivered', error: errMsg };
          continue;
        }

        // 6b. Generate audio once per run if the dispatch has voice enabled.
        // Audio gets fanned out alongside text to subscribers who opted in.
        let audioBuffer: Buffer | null = null;
        if (audioEnabled) {
          try {
            const dispatchDate = endDate;
            const dateLabel = new Date(endDate).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            });
            const generated = await generateDispatchAudio({
              subject: result.subject,
              markdown: result.content,
              displayName: newsletter.name,
              dateLabel,
              dispatchDate,
              ownerUserId: newsletter.admin_user_id,
              dispatchId: newsletter.id,
            });
            if (generated) {
              audioBuffer = generated.audio;
              await setDispatchAudio(run.id, {
                url: generated.publicUrl,
                bytes: generated.bytes,
                durationSec: generated.durationSec,
                script: generated.script,
              });
              console.log(`[generate] ${newsletter.name}: audio ready (${generated.bytes} bytes, ${generated.durationSec}s)`);
            }
          } catch (audioErr) {
            console.error(`[generate] ${newsletter.name}: audio pipeline failed`, audioErr);
          }
        }

        // 7. Fan out to subscribers — charge each, send
        // Normally filter to subscribers who want this window AND this day.
        // When force=true, send to every active subscriber regardless.
        // Owner's schedule drives timing — all active subscribers receive every dispatch
        const subscribers = await getNewsletterSubscribers(newsletter.id);

        if (subscribers.length === 0) {
          console.log(`[generate] No subscribers for ${newsletter.name}`);
          await updateRunStatus(run.id, 'generated');
          results[newsletter.name] = { status: 'generated', subscribers: 0 };
          continue;
        }

        const deliveredEmails: string[] = [];
        const deliveredEmailUserIds: string[] = [];
        const telegramTargets: { chatId: string; userId: string; audio: boolean }[] = [];

        for (const sub of subscribers) {
          // Subscriber pays 2x only if BOTH the dispatch has voice on AND they opted in.
          const subAudio = audioEnabled && sub.audio_enabled;
          const subscriberCost = calculateSubscriberCreditCost(subAudio);
          const charged = await chargeSubscriber(
            sub.user_id,
            newsletter.admin_user_id,
            newsletter.name,
            subscriberCost,
            run.id,
          );

          if (!charged) {
            console.log(`[generate] Subscriber ${sub.user_id} skipped — insufficient credits`);
            continue;
          }

          if (sub.delivery_channel === 'telegram' && sub.telegram_chat_id) {
            telegramTargets.push({ chatId: sub.telegram_chat_id, userId: sub.user_id, audio: subAudio });
          } else {
            const email = sub.delivery_email || sub.email;
            if (email) {
              deliveredEmails.push(email);
              deliveredEmailUserIds.push(sub.user_id);
            }
          }
        }

        const totalTargets = deliveredEmails.length + telegramTargets.length;
        if (totalTargets === 0) {
          console.log(`[generate] No payable subscribers for ${newsletter.name}`);
          await updateRunStatus(run.id, 'generated', 'All subscribers had insufficient credits');
          results[newsletter.name] = { status: 'generated', subscribers: 0 };
          continue;
        }

        console.log(
          `[generate] Sending ${newsletter.name} to ${deliveredEmails.length} email, ${telegramTargets.length} telegram...`,
        );

        const deliveryErrors: string[] = [];

        // Email fanout
        if (deliveredEmails.length > 0) {
          try {
            await sendNewsletter({
              to: deliveredEmails,
              subject: result.subject,
              content: result.content,
              newsletterId: newsletter.id,
              newsletterName: newsletter.name,
              recipientUserIds: deliveredEmailUserIds,
            });
            await recordBulkDeliveries(run.id, deliveredEmailUserIds, 'email');
          } catch (emailError) {
            const msg = emailError instanceof Error ? emailError.message : 'Email send failed';
            console.error(`[generate] Email send failed for ${newsletter.name}:`, emailError);
            deliveryErrors.push(`email: ${msg}`);
          }
        }

        // Telegram fanout — one message per chat (TG is per-recipient, no batching)
        const successfulTgUserIds: string[] = [];
        for (const target of telegramTargets) {
          try {
            await sendTelegramNewsletter({
              chatId: target.chatId,
              subject: result.subject,
              contentMarkdown: result.content,
              newsletterId: newsletter.id,
            });
            if (target.audio && audioBuffer) {
              try {
                await sendTelegramAudio({
                  chatId: target.chatId,
                  audio: audioBuffer,
                  title: result.subject,
                  performer: 'Junto',
                  caption: `🎧 <b>${result.subject}</b>`,
                });
              } catch (audioTgErr) {
                console.error(`[generate] Telegram audio send failed for ${newsletter.name} chat ${target.chatId}:`, audioTgErr);
              }
            }
            successfulTgUserIds.push(target.userId);
          } catch (tgError) {
            const msg = tgError instanceof Error ? tgError.message : 'Telegram send failed';
            console.error(`[generate] Telegram send failed for ${newsletter.name} chat ${target.chatId}:`, tgError);
            deliveryErrors.push(`telegram ${target.chatId}: ${msg}`);
          }
        }
        if (successfulTgUserIds.length > 0) {
          await recordBulkDeliveries(run.id, successfulTgUserIds, 'telegram');
        }

        const delivered = deliveredEmailUserIds.length + successfulTgUserIds.length;
        console.log(`[generate] Delivered ${newsletter.name} to ${delivered}/${totalTargets}`);

        const finalStatus = deliveryErrors.length > 0
          ? (delivered > 0 ? 'partial_delivered' : 'generated_not_delivered')
          : 'delivered';

        await updateRunStatus(
          run.id,
          finalStatus,
          deliveryErrors.length > 0 ? deliveryErrors.join('; ') : undefined,
        );

        if ((newsletter as any).is_public && (finalStatus === 'delivered' || finalStatus === 'partial_delivered')) {
          try {
            const queued = await queueDispatchTweetForRunId(run.id);
            if (queued) {
              console.log(`[generate] ${newsletter.name}: queued X cross-post draft for run ${run.id}`);
            }
          } catch (queueErr) {
            console.error(`[generate] ${newsletter.name}: failed to queue X cross-post draft`, queueErr);
          }
        }

        results[newsletter.name] = deliveryErrors.length > 0
          ? { status: finalStatus, subscribers: delivered, error: deliveryErrors.join('; ') }
          : { status: 'delivered', subscribers: delivered };

      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[generate] Error processing ${newsletter.name}:`, error);
        try {
          await storeSkippedRun(newsletter.id, 'error', msg);
        } catch { /* ignore secondary failure */ }
        results[newsletter.name] = { status: 'error', error: msg };
      }
    }

    return NextResponse.json({
      success: true,
      generated: Object.keys(results).length,
      results,
    });
  } catch (error) {
    console.error('[generate] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

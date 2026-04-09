import { NextRequest, NextResponse } from 'next/server';
import { getNewslettersDueForGeneration, getNewsletterSources, getCurrentSendWindow, getCurrentPSTDay } from '@/lib/db/newsletters-v2';
import { getRecentContentForSources, getContextContentForSources, groupContentByHandle } from '@/lib/db/content-twitter';
import { getNewsletterSubscribers } from '@/lib/db/subscriptions';
import { storeRun } from '@/lib/db/newsletter-runs';
import { recordBulkDeliveries } from '@/lib/db/newsletter-deliveries';
import { generateNewsletterV2 } from '@/lib/synthesis/generator-v2';
import { sendNewsletter } from '@/lib/email/sender';
import { chargeOwner, chargeSubscriber } from '@/lib/db/credits';
import { calculateOwnerCreditCost, calculateSubscriberCreditCost } from '@/lib/pricing';
import { getPromptTemplateById } from '@/lib/db/prompt-templates';
import { NEWSLETTER_SYSTEM_PROMPT } from '@/lib/synthesis/prompts';

export const maxDuration = 300; // 5 minutes

// GET /api/cron/generate-newsletters — generate due newsletters and deliver to subscribers
// Triggered by Vercel cron every 5 minutes
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret in production
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dueNewsletters = await getNewslettersDueForGeneration();

    if (dueNewsletters.length === 0) {
      return NextResponse.json({ success: true, message: 'No newsletters due', generated: 0 });
    }

    console.log(`[generate] ${dueNewsletters.length} newsletter(s) due for generation`);

    const results: Record<string, { status: string; subscribers?: number; error?: string }> = {};

    for (const newsletter of dueNewsletters) {
      try {
        console.log(`[generate] Processing: ${newsletter.name} (${newsletter.id})`);

        // 1. Get sources for this newsletter
        const sources = await getNewsletterSources(newsletter.id);
        if (sources.length === 0) {
          console.log(`[generate] Skipping ${newsletter.name}: no sources`);
          results[newsletter.name] = { status: 'skipped', error: 'No sources configured' };
          continue;
        }

        const sourceIds = sources.map((s) => s.id);
        const sourceMap: Record<string, string> = {};
        sources.forEach((s) => { sourceMap[s.id] = s.handle_or_url; });

        // 2. Fetch recent content (last 48h) and context (last 7d, not 180d)
        // Context is limited to 7 days to avoid stale data polluting the briefing
        const [recentContent, contextContent] = await Promise.all([
          getRecentContentForSources(sourceIds, 48),
          getContextContentForSources(sourceIds, 7, 48),
        ]);

        if (recentContent.length === 0) {
          console.log(`[generate] Skipping ${newsletter.name}: no recent content (last 48h)`);
          results[newsletter.name] = { status: 'skipped', error: 'No recent content in last 48 hours' };
          continue;
        }

        console.log(`[generate] ${newsletter.name}: ${recentContent.length} recent tweets, ${contextContent.length} context tweets (7d)`);

        // 3. Group content by handle for the synthesis pipeline
        const recentGrouped = groupContentByHandle(recentContent, sourceMap);
        const contextGrouped = groupContentByHandle(contextContent, sourceMap);

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

        const result = await generateNewsletterV2({
          prompt: resolvedPrompt,
          secondaryPrompt: newsletter.secondary_prompt,
          recentTweets: recentGrouped,
          contextTweets: contextGrouped,
          startDate,
          endDate,
          newsletterName: newsletter.name,
        });

        // 5. Store the run
        const run = await storeRun({
          newsletter_id: newsletter.id,
          content: result.content,
          subject: result.subject,
          model_used: result.model_used,
          tokens_used: { input_tokens: result.input_tokens, output_tokens: result.output_tokens },
          metadata: {
            source_count: sources.length,
            recent_tweet_count: recentContent.length,
            context_tweet_count: contextContent.length,
          },
        });

        console.log(`[generate] Run stored: ${run.id} — "${result.subject}"`);

        // 6. Charge the owner
        const ownerCost = calculateOwnerCreditCost(sources.length);
        const ownerCharged = await chargeOwner(newsletter.admin_user_id, newsletter.name, ownerCost, run.id);
        if (!ownerCharged) {
          console.log(`[generate] Owner has insufficient credits for ${newsletter.name} (needs ${ownerCost})`);
          results[newsletter.name] = { status: 'generated_not_delivered', error: 'Owner insufficient credits' };
          continue;
        }

        // 7. Fan out to subscribers — charge each, send email
        // Filter to subscribers who want this window AND this day
        const allSubscribers = await getNewsletterSubscribers(newsletter.id);
        const currentWindow = getCurrentSendWindow();
        const currentDay = getCurrentPSTDay();
        const subscribers = allSubscribers.filter(sub => {
          const windows = sub.receive_windows || sub.send_windows || ['morning'];
          const days = sub.receive_days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
          return (!currentWindow || windows.includes(currentWindow)) &&
                 (!currentDay || days.includes(currentDay));
        });

        if (subscribers.length === 0) {
          console.log(`[generate] No subscribers for ${newsletter.name}`);
          results[newsletter.name] = { status: 'generated', subscribers: 0 };
          continue;
        }

        const subscriberCost = calculateSubscriberCreditCost();
        const deliveredEmails: string[] = [];
        const deliveredUserIds: string[] = [];

        for (const sub of subscribers) {
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

          const email = sub.delivery_email || sub.email;
          if (email) {
            deliveredEmails.push(email);
            deliveredUserIds.push(sub.user_id);
          }
        }

        if (deliveredEmails.length === 0) {
          console.log(`[generate] No payable subscribers for ${newsletter.name}`);
          results[newsletter.name] = { status: 'generated', subscribers: 0 };
          continue;
        }

        console.log(`[generate] Sending to ${deliveredEmails.length} subscriber(s)...`);

        try {
          await sendNewsletter({
            to: deliveredEmails,
            subject: result.subject,
            content: result.content,
            newsletterId: newsletter.id,
            newsletterName: newsletter.name,
          });

          await recordBulkDeliveries(run.id, deliveredUserIds, 'email');

          console.log(`[generate] Delivered ${newsletter.name} to ${deliveredEmails.length} subscribers`);
          results[newsletter.name] = { status: 'delivered', subscribers: deliveredEmails.length };
        } catch (emailError) {
          console.error(`[generate] Email send failed for ${newsletter.name}:`, emailError);
          results[newsletter.name] = {
            status: 'generated_not_delivered',
            subscribers: deliveredEmails.length,
            error: emailError instanceof Error ? emailError.message : 'Email send failed',
          };
        }
      } catch (error) {
        console.error(`[generate] Error processing ${newsletter.name}:`, error);
        results[newsletter.name] = {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
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

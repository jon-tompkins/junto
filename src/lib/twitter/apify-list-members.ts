// Twitter list-members fetch via the same kaitoeasyapi tweet scraper we already
// use for tweet pulls ($0.25 per 1k tweets, per-result billing).
//
// Strategy: run a search for `list:<id>` and deduplicate authors from the
// returned tweets. We never get inactive members this way, but for a junto's
// purposes "accounts that actually tweet" is the right filter anyway. The user
// can always add inactive accounts manually.
//
// The previous implementation used apidojo/twitter-list-scraper, which is a
// compute-unit actor — a single 15-account list scrape burned through ~$40 of
// Apify credits on retries because each failed run still incurred CU charges.

import { recordCost, apifyCostCents } from '../costs';

const APIFY_BASE_URL = 'https://api.apify.com/v2';
const APIFY_TWEET_ACTOR_ID = 'kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest';

// Pull a fairly deep timeline so we see most members at least once. 300 tweets
// across a 15-50 account list typically surfaces ~80-100% of active members.
const TWEETS_PER_LIST_SCRAPE = 300;

export interface ListMember {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export function parseListId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{6,}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/lists\/(\d+)/);
  return match ? match[1] : null;
}

async function pollUntilDone(runId: string, token: string, maxWaitMs = 240000): Promise<any[]> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const statusRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}?token=${token}`);
    const statusData = await statusRes.json();
    const status = statusData.data?.status;
    if (status === 'SUCCEEDED') {
      const resultsRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}/dataset/items?token=${token}`);
      return await resultsRes.json();
    }
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      const exitCode = statusData.data?.exitCode;
      const statusMsg = statusData.data?.statusMessage;
      throw new Error(
        `Apify list run ${status}` +
          (exitCode != null ? ` (exit ${exitCode})` : '') +
          (statusMsg ? `: ${statusMsg}` : ''),
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Apify list run timed out');
}

export async function fetchListMembers(listId: string): Promise<ListMember[]> {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY not configured');

  const input = {
    searchTerms: [`list:${listId}`],
    tweetsDesired: TWEETS_PER_LIST_SCRAPE,
  };

  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${APIFY_TWEET_ACTOR_ID}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  const runText = await runRes.text();
  if (!runRes.ok) {
    throw new Error(
      `Apify start failed (HTTP ${runRes.status}) for actor "${APIFY_TWEET_ACTOR_ID}": ${runText.slice(0, 300)}`,
    );
  }
  let runData: any;
  try {
    runData = JSON.parse(runText);
  } catch {
    throw new Error(`Apify returned non-JSON on run start: ${runText.slice(0, 300)}`);
  }
  const runId = runData.data?.id;
  if (!runId) {
    throw new Error(`Failed to start Apify list run: ${JSON.stringify(runData).slice(0, 300)}`);
  }

  const items = await pollUntilDone(runId, token);

  // Each item is a tweet from the kaitoeasyapi scraper. Dedup by author.
  const members: ListMember[] = [];
  const seen = new Set<string>();
  for (const it of items as any[]) {
    if (it?.type === 'mock_tweet') continue;
    const author = it.author || it.user || {};
    const handle =
      author.userName ||
      author.username ||
      author.screen_name ||
      it.userName ||
      it.username;
    if (!handle) continue;
    const clean = String(handle).replace('@', '').toLowerCase();
    if (seen.has(clean)) continue;
    seen.add(clean);
    members.push({
      handle: clean,
      displayName: author.name || author.displayName || null,
      avatarUrl: author.profileImageUrl || author.profile_image_url || author.avatar || null,
    });
  }

  recordCost({
    supplier: 'apify',
    operation: 'list_members_scrape',
    cost_cents: apifyCostCents(items.length),
    usage_amount: items.length,
    usage_unit: 'tweets',
    external_id: runId,
    metadata: { list_id: listId, members: members.length, actor: APIFY_TWEET_ACTOR_ID, mode: 'search_list' },
  });

  return members;
}

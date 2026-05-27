// Apify "Twitter list members" scraper wrapper.
// We use the kaitoeasyapi family that we're already paying for tweets.
// If kaitoeasyapi doesn't have a list-members actor, swap APIFY_LIST_ACTOR_ID
// to another actor (e.g. apidojo/twitter-list-scraper) — most accept the same
// listId input shape.
//
// Result is normalized to { handle, displayName, avatarUrl } so the rest of
// the import flow doesn't care which actor we used.

import { recordCost, apifyCostCents } from '../costs';

const APIFY_BASE_URL = 'https://api.apify.com/v2';
const APIFY_LIST_ACTOR_ID =
  process.env.APIFY_LIST_ACTOR_ID || 'apidojo~twitter-list-scraper';

export interface ListMember {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export function parseListId(input: string): string | null {
  const trimmed = input.trim();
  // Pure numeric id
  if (/^\d{6,}$/.test(trimmed)) return trimmed;
  // URL form — x.com/i/lists/<id> or twitter.com/i/lists/<id>
  const match = trimmed.match(/lists\/(\d+)/);
  return match ? match[1] : null;
}

async function pollUntilDone(runId: string, token: string, maxWaitMs = 120000): Promise<any[]> {
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
      let logTail = '';
      try {
        const logRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}/log?token=${token}`);
        const logText = await logRes.text();
        logTail = logText.split('\n').slice(-12).join(' | ').slice(0, 400);
      } catch {}
      throw new Error(
        `Apify list run ${status}` +
          (exitCode != null ? ` (exit ${exitCode})` : '') +
          (statusMsg ? `: ${statusMsg}` : '') +
          (logTail ? ` — log: ${logTail}` : ''),
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Apify list run timed out');
}

export async function fetchListMembers(listId: string): Promise<ListMember[]> {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY not configured');

  // apidojo/twitter-list-scraper wants startUrls (array of {url}) or listIds (plural).
  // Send the common shapes so we work across actor variants without code changes.
  const listUrl = `https://x.com/i/lists/${listId}`;
  const input = {
    listIds: [listId],
    startUrls: [{ url: listUrl }],
    listUrls: [listUrl],
    listId,
  };

  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${APIFY_LIST_ACTOR_ID}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  const runText = await runRes.text();
  if (!runRes.ok) {
    throw new Error(
      `Apify start failed (HTTP ${runRes.status}) for actor "${APIFY_LIST_ACTOR_ID}": ${runText.slice(0, 300)}`,
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

  // Normalize across actor schemas — different actors return slightly different
  // shapes. We probe the most common field names.
  const members: ListMember[] = [];
  const seen = new Set<string>();
  for (const it of items as any[]) {
    const handle =
      it.userName ||
      it.username ||
      it.screen_name ||
      it.handle ||
      it.author?.userName ||
      it.user?.screen_name;
    if (!handle) continue;
    const clean = String(handle).replace('@', '').toLowerCase();
    if (seen.has(clean)) continue;
    seen.add(clean);
    members.push({
      handle: clean,
      displayName: it.name || it.displayName || it.user?.name || null,
      avatarUrl: it.profileImageUrl || it.profile_image_url || it.avatar || it.user?.profile_image_url || null,
    });
  }

  recordCost({
    supplier: 'apify',
    operation: 'list_members_scrape',
    cost_cents: apifyCostCents(items.length),
    usage_amount: items.length,
    usage_unit: 'tweets', // closest existing unit; metadata explains
    external_id: runId,
    metadata: { list_id: listId, members: members.length, actor: APIFY_LIST_ACTOR_ID },
  });

  return members;
}

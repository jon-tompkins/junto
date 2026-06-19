// Post a dispatch to a Discord channel as the bot (@Benji).
//
// Used by the generate-newsletters cron: when a newsletter has a
// discord_channel_id mapped (migration 074), each generated dispatch is
// posted here. Posting is best-effort and must never throw into the
// delivery/billing path — callers wrap this, but we also swallow internally.

const DISCORD_API = 'https://discord.com/api/v10';

// Discord embed limits
const TITLE_MAX = 256;
const DESC_MAX = 4096;
const CHUNK_MAX = 4000; // leave headroom under DESC_MAX for the continuation marker

function chunk(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > size) {
    // Prefer to split on a paragraph/line boundary near the limit.
    let cut = rest.lastIndexOf('\n', size);
    if (cut < size * 0.5) cut = size; // no good boundary — hard split
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) parts.push(rest);
  return parts;
}

async function postMessage(channelId: string, token: string, body: unknown): Promise<void> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      // Discord requires a descriptive User-Agent for API clients.
      'User-Agent': 'myJunto-Dispatch (https://myjunto.xyz, 1.0)',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Discord POST ${res.status}: ${detail.slice(0, 300)}`);
  }
}

export interface DispatchPost {
  channelId: string;
  subject: string;
  content: string;
  generatedAt?: string | null;
}

// Returns true if posted, false if skipped (no token), throws on hard failure.
export async function postDispatchToDiscord(post: DispatchPost): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn('[discord] DISCORD_BOT_TOKEN not set — skipping Discord post');
    return false;
  }

  const pieces = chunk(post.content, CHUNK_MAX);
  const timestamp = post.generatedAt
    ? post.generatedAt.replace('+00:00', 'Z')
    : new Date().toISOString();

  for (let i = 0; i < pieces.length; i++) {
    const isFirst = i === 0;
    const isLast = i === pieces.length - 1;
    const embed: Record<string, unknown> = {
      description: pieces[i].slice(0, DESC_MAX),
      color: 0x2ecc71,
    };
    if (isFirst) embed.title = post.subject.slice(0, TITLE_MAX);
    if (isLast) {
      embed.footer = { text: '🤖 myJunto dispatch' };
      embed.timestamp = timestamp;
    }
    await postMessage(post.channelId, token, { embeds: [embed] });
  }

  return true;
}

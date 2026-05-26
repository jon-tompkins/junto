// Telegram Bot API client. Uses `fetch` directly — no SDK dependency.
// https://core.telegram.org/bots/api

const TG_API = 'https://api.telegram.org';

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  return token;
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function tgCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = getToken();
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as TgResponse<T>;
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.error_code} ${data.description}`);
  }
  return data.result as T;
}

interface TgMessage {
  message_id: number;
  chat: { id: number };
}

// Single message send. Content must be pre-escaped HTML (use `markdownToTelegramHtml`).
export async function sendTelegramMessage(
  chatId: string | number,
  html: string,
  opts: { disablePreview?: boolean } = {},
): Promise<TgMessage> {
  return tgCall<TgMessage>('sendMessage', {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: opts.disablePreview ?? true,
  });
}

// Send an MP3 audio file. Uses sendAudio so Telegram shows playable audio player + duration.
export async function sendTelegramAudio(params: {
  chatId: string | number;
  audio: Buffer;
  title: string;
  performer?: string;
  caption?: string;
  filename?: string;
}): Promise<{ message_id: number }> {
  const token = getToken();
  const form = new FormData();
  form.append('chat_id', String(params.chatId));
  form.append('title', params.title);
  if (params.performer) form.append('performer', params.performer);
  if (params.caption) {
    form.append('caption', params.caption);
    form.append('parse_mode', 'HTML');
  }
  const blob = new Blob([new Uint8Array(params.audio)], { type: 'audio/mpeg' });
  form.append('audio', blob, params.filename || 'dispatch.mp3');

  const res = await fetch(`${TG_API}/bot${token}/sendAudio`, {
    method: 'POST',
    body: form,
  });
  const data = (await res.json()) as TgResponse<{ message_id: number }>;
  if (!data.ok) {
    throw new Error(`Telegram sendAudio failed: ${data.error_code} ${data.description}`);
  }
  return data.result!;
}

// Newsletter delivery. Splits long content across multiple messages (TG caps at 4096 chars).
// First message gets the subject as a bold header.
export async function sendTelegramNewsletter(params: {
  chatId: string | number;
  subject: string;
  contentMarkdown: string;
  newsletterId?: string;
}): Promise<{ messageIds: number[] }> {
  const { chatId, subject, contentMarkdown, newsletterId } = params;
  const body = markdownToTelegramHtml(contentMarkdown);
  const header = `<b>${escapeHtml(subject)}</b>\n\n`;
  const footer = newsletterId
    ? `\n\n<a href="https://www.myjunto.xyz/newsletter/${newsletterId}">View on Junto</a>`
    : '';

  const chunks = splitForTelegram(header + body + footer, 4000);
  const messageIds: number[] = [];
  for (const chunk of chunks) {
    const msg = await sendTelegramMessage(chatId, chunk);
    messageIds.push(msg.message_id);
  }
  return { messageIds };
}

// Split HTML-ish content into <=limit-char chunks, preferring newline breaks.
// Naive: HTML tags may split across chunks. Good enough for our newsletter content
// which uses simple inline tags (b, i, a) — unclosed tags render as text but don't
// corrupt the message.
export function splitForTelegram(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    const lastNewline = slice.lastIndexOf('\n\n');
    const breakAt = lastNewline > limit / 2 ? lastNewline : slice.lastIndexOf('\n');
    const cut = breakAt > 0 ? breakAt : limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, '');
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Convert our newsletter markdown to Telegram-supported HTML.
// TG supported tags: b, strong, i, em, u, ins, s, strike, del, code, pre, a.
// No headings, lists, blockquotes — we approximate with bold + bullet chars.
export function markdownToTelegramHtml(md: string): string {
  // Escape HTML first so real content doesn't collide with our tag insertions
  let out = escapeHtml(md);

  // Horizontal rules → blank line
  out = out.replace(/^---+$/gm, '');

  // Headings → bold, preserve size via emoji-ish weight. TG doesn't support h tags.
  out = out.replace(/^####\s+(.+)$/gm, '<b>$1</b>');
  out = out.replace(/^###\s+(.+)$/gm, '<b>$1</b>');
  out = out.replace(/^##\s+(.+)$/gm, '<b>$1</b>');
  out = out.replace(/^#\s+(.+)$/gm, '<b>$1</b>');

  // Bold + italic combos before single markers
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  out = out.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<i>$1</i>');

  // Links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Bullets: - item → • item
  out = out.replace(/^-\s+/gm, '• ');

  // Blockquotes: > text → indented with bar char
  out = out.replace(/^&gt;\s+(.+)$/gm, '▍ <i>$1</i>');

  // Collapse 3+ consecutive newlines to 2 (TG doesn't need email-style breaks)
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

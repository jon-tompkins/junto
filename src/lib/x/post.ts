// X (Twitter) v2 posting client. OAuth 1.0a user-context signing — required
// because v2 /2/tweets needs user-write scope and our setup uses user access
// tokens, not OAuth 2.0 PKCE.
//
// Env: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
// Get these from developer.x.com → App → Keys and tokens, AFTER setting
// app permissions to Read+Write and regenerating the access token pair.

import crypto from 'crypto';

interface XCreds {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

function getCreds(): XCreds {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error('X credentials not configured (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET)');
  }
  return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
}

// RFC 3986 percent-encoding (stricter than encodeURIComponent — encodes !*'()).
function pct(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function signRequest(
  method: 'GET' | 'POST',
  url: string,
  creds: XCreds,
  // Query params only — JSON body is NOT included in OAuth 1.0a signature base
  // when content-type is application/json (per Twitter's docs).
  queryParams: Record<string, string> = {},
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...queryParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${pct(k)}=${pct(allParams[k])}`)
    .join('&');

  const baseString = [method, pct(url), pct(paramString)].join('&');
  const signingKey = `${pct(creds.consumerSecret)}&${pct(creds.accessTokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;
  return 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map((k) => `${pct(k)}="${pct(oauthParams[k])}"`)
    .join(', ');
}

export interface PostTweetResult {
  id: string;
  text: string;
  url: string;
}

export async function postTweet(
  text: string,
  opts?: { replyToId?: string; mediaIds?: string[]; images?: Array<{ data: Buffer; mimeType: string }> },
): Promise<PostTweetResult> {
  // Auto-tag every agent-posted tweet with 🤖 so the feed makes it obvious
  // which posts came from automation vs. a human at the keyboard. Skipped if
  // the caller already included the emoji.
  const tagged = /🤖/.test(text) ? text : `${text.trimEnd()} 🤖`;
  if (!tagged || tagged.length > 280) throw new Error(`Tweet text must be 1–280 chars (got ${tagged.length})`);
  const creds = getCreds();
  const url = 'https://api.x.com/2/tweets';

  const mediaIds: string[] = [...(opts?.mediaIds || [])];
  if (opts?.images?.length) {
    for (const img of opts.images) {
      mediaIds.push(await uploadMedia(img.data, img.mimeType, creds));
    }
  }
  if (mediaIds.length > 4) throw new Error(`X allows at most 4 media per tweet (got ${mediaIds.length})`);

  const body: Record<string, any> = { text: tagged };
  if (opts?.replyToId) body.reply = { in_reply_to_tweet_id: opts.replyToId };
  if (mediaIds.length) body.media = { media_ids: mediaIds };

  const authHeader = signRequest('POST', url, creds);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`X POST /2/tweets ${res.status}: ${responseText}`);
  }

  const data = JSON.parse(responseText);
  const id = data?.data?.id;
  const returnedText = data?.data?.text || text;
  if (!id) throw new Error(`X returned no tweet id: ${responseText}`);

  // We don't know the screen name from the API response without an extra
  // /users/me call. The /i/web/status/ URL works regardless of handle.
  return { id, text: returnedText, url: `https://x.com/i/web/status/${id}` };
}

// Upload a single image to X via v1.1 media/upload (simple, non-chunked).
// Multipart bodies are NOT included in the OAuth 1.0a signature base string
// per Twitter's spec, so we sign the bare endpoint URL with no query params.
// Returns the media_id_string to attach to a v2 tweet.
async function uploadMedia(data: Buffer, mimeType: string, creds: XCreds): Promise<string> {
  if (data.length > 5 * 1024 * 1024) {
    throw new Error(`Image exceeds 5MB simple-upload limit (got ${data.length} bytes); chunked INIT/APPEND/FINALIZE not implemented`);
  }
  const url = 'https://upload.twitter.com/1.1/media/upload.json';
  const authHeader = signRequest('POST', url, creds);
  const form = new FormData();
  form.append('media', new Blob([new Uint8Array(data)], { type: mimeType }), 'upload');
  const res = await fetch(url, { method: 'POST', headers: { Authorization: authHeader }, body: form });
  const responseText = await res.text();
  if (!res.ok) throw new Error(`X media/upload ${res.status}: ${responseText}`);
  const parsed = JSON.parse(responseText);
  const id = parsed?.media_id_string;
  if (!id) throw new Error(`X media/upload returned no media_id_string: ${responseText}`);
  return id;
}

async function signedGet(url: string, creds: XCreds): Promise<any> {
  const authHeader = signRequest('GET', url, creds);
  const res = await fetch(url, { headers: { Authorization: authHeader } });
  const responseText = await res.text();
  if (!res.ok) throw new Error(`X GET ${url} ${res.status}: ${responseText}`);
  return JSON.parse(responseText);
}

// Cache @myjunto_xyz user id for the lifetime of the lambda — never changes.
let cachedMeId: string | null = null;

export async function getMyUserId(): Promise<string> {
  if (cachedMeId) return cachedMeId;
  const creds = getCreds();
  const data = await signedGet('https://api.x.com/2/users/me', creds);
  const id = data?.data?.id;
  if (!id) throw new Error(`X /users/me returned no id: ${JSON.stringify(data)}`);
  cachedMeId = id;
  return id;
}

export async function lookupUserId(handle: string): Promise<{ id: string; username: string; name: string }> {
  const creds = getCreds();
  const clean = handle.replace(/^@/, '').trim();
  if (!clean) throw new Error('handle required');
  const data = await signedGet(`https://api.x.com/2/users/by/username/${encodeURIComponent(clean)}`, creds);
  const u = data?.data;
  if (!u?.id) throw new Error(`X user @${clean} not found: ${JSON.stringify(data)}`);
  return { id: u.id, username: u.username, name: u.name };
}

export interface FollowResult {
  ok: true;
  target_id: string;
  target_handle: string;
  following: boolean;
  pending: boolean;
}

export async function followUser(handle: string): Promise<FollowResult> {
  const creds = getCreds();
  const [me, target] = await Promise.all([getMyUserId(), lookupUserId(handle)]);
  const url = `https://api.x.com/2/users/${me}/following`;
  const authHeader = signRequest('POST', url, creds);

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_user_id: target.id }),
  });
  const responseText = await res.text();
  if (!res.ok) throw new Error(`X POST /2/users/${me}/following ${res.status}: ${responseText}`);
  const data = JSON.parse(responseText);
  return {
    ok: true,
    target_id: target.id,
    target_handle: target.username,
    following: !!data?.data?.following,
    pending: !!data?.data?.pending_follow,
  };
}

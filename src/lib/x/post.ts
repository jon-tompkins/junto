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
  method: 'GET' | 'POST' | 'DELETE',
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
  opts?: {
    replyToId?: string;
    mediaIds?: string[];
    images?: Array<{ data: Buffer; mimeType: string }>;
    video?: { data: Buffer; mimeType: string };
  },
): Promise<PostTweetResult> {
  // Auto-tag every agent-posted tweet with 🤖 so the feed makes it obvious
  // which posts came from automation vs. a human at the keyboard. Skipped if
  // the caller already included the emoji.
  const tagged = /🤖/.test(text) ? text : `${text.trimEnd()} 🤖`;
  if (!tagged || tagged.length > 280) throw new Error(`Tweet text must be 1–280 chars (got ${tagged.length})`);
  const creds = getCreds();
  const url = 'https://api.x.com/2/tweets';

  // X does not allow mixing a video with images, and permits only one video.
  if (opts?.video && (opts.images?.length || (opts.mediaIds?.length ?? 0) > 0)) {
    throw new Error('X allows a video OR images, not both');
  }

  const mediaIds: string[] = [...(opts?.mediaIds || [])];
  if (opts?.video) {
    mediaIds.push(await uploadVideo(opts.video.data, opts.video.mimeType, creds));
  }
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

export async function deleteTweet(id: string): Promise<{ deleted: boolean }> {
  const creds = getCreds();
  const url = `https://api.x.com/2/tweets/${id}`;
  const authHeader = signRequest('DELETE', url, creds);
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: authHeader } });
  const responseText = await res.text();
  if (!res.ok) throw new Error(`X DELETE /2/tweets/${id} ${res.status}: ${responseText}`);
  const data = JSON.parse(responseText);
  return { deleted: !!data?.data?.deleted };
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

// v2 media endpoint. Media_ids minted by the legacy upload.twitter.com/1.1
// host are rejected by api.x.com/2/tweets ("Your media IDs are invalid"), so
// the chunked flow must run against the v2 graph to produce a compatible id.
const UPLOAD_URL = 'https://api.x.com/2/media/upload';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Upload a video to X via the chunked v1.1 media/upload flow:
// INIT (declare size + tweet_video category) → APPEND (binary chunks) →
// FINALIZE → poll STATUS until async transcoding succeeds. Returns the
// media_id_string to attach to a v2 tweet.
//
// OAuth note: INIT/FINALIZE/STATUS carry their params in the query string, so
// they ARE part of the signature base (passed to signRequest). APPEND is
// multipart/form-data, whose fields are excluded from the base per spec, so it
// signs the bare URL.
async function uploadVideo(data: Buffer, mimeType: string, creds: XCreds, trace?: any[]): Promise<string> {
  const totalBytes = data.length;
  if (totalBytes > 512 * 1024 * 1024) {
    throw new Error(`Video exceeds X's 512MB limit (got ${totalBytes} bytes)`);
  }

  // INIT
  const initParams: Record<string, string> = {
    command: 'INIT',
    total_bytes: String(totalBytes),
    media_type: mimeType,
    media_category: 'tweet_video',
  };
  const initUrl = `${UPLOAD_URL}?${new URLSearchParams(initParams).toString()}`;
  const initRes = await fetch(initUrl, {
    method: 'POST',
    headers: { Authorization: signRequest('POST', UPLOAD_URL, creds, initParams) },
  });
  const initText = await initRes.text();
  trace?.push({ step: 'INIT', status: initRes.status, body: initText.slice(0, 500) });
  if (!initRes.ok) throw new Error(`X media/upload INIT ${initRes.status}: ${initText}`);
  const mediaId = JSON.parse(initText)?.media_id_string;
  if (!mediaId) throw new Error(`X media/upload INIT returned no media_id_string: ${initText}`);

  // APPEND — 4MB chunks
  const chunkSize = 4 * 1024 * 1024;
  let segment = 0;
  for (let offset = 0; offset < totalBytes; offset += chunkSize) {
    const chunk = data.subarray(offset, Math.min(offset + chunkSize, totalBytes));
    const form = new FormData();
    form.append('command', 'APPEND');
    form.append('media_id', mediaId);
    form.append('segment_index', String(segment));
    form.append('media', new Blob([new Uint8Array(chunk)], { type: 'application/octet-stream' }), 'chunk');
    const appendRes = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { Authorization: signRequest('POST', UPLOAD_URL, creds) },
      body: form,
    });
    const appendText = await appendRes.text();
    trace?.push({ step: 'APPEND', segment, status: appendRes.status, body: appendText.slice(0, 300) });
    if (!appendRes.ok) {
      throw new Error(`X media/upload APPEND seg ${segment} ${appendRes.status}: ${appendText}`);
    }
    segment++;
  }

  // FINALIZE
  const finParams: Record<string, string> = { command: 'FINALIZE', media_id: mediaId };
  const finUrl = `${UPLOAD_URL}?${new URLSearchParams(finParams).toString()}`;
  const finRes = await fetch(finUrl, {
    method: 'POST',
    headers: { Authorization: signRequest('POST', UPLOAD_URL, creds, finParams) },
  });
  const finText = await finRes.text();
  trace?.push({ step: 'FINALIZE', status: finRes.status, body: finText.slice(0, 500) });
  if (!finRes.ok) throw new Error(`X media/upload FINALIZE ${finRes.status}: ${finText}`);
  // Video is transcoded asynchronously. FINALIZE *usually* returns
  // processing_info, but we don't trust its shape — always poll STATUS until
  // the media reports `succeeded`, otherwise attaching it to a tweet 400s with
  // "Your media IDs are invalid".
  let info = JSON.parse(finText)?.processing_info || { state: 'pending', check_after_secs: 1 };

  const deadline = Date.now() + 120_000;
  while (info && info.state !== 'succeeded') {
    if (info.state === 'failed') {
      throw new Error(`X video processing failed: ${JSON.stringify(info.error || info)}`);
    }
    if (Date.now() > deadline) throw new Error(`X video processing timed out (last state: ${info.state})`);
    await sleep(Math.max(1, info.check_after_secs || 2) * 1000);
    const stParams: Record<string, string> = { command: 'STATUS', media_id: mediaId };
    const stUrl = `${UPLOAD_URL}?${new URLSearchParams(stParams).toString()}`;
    const stRes = await fetch(stUrl, { headers: { Authorization: signRequest('GET', UPLOAD_URL, creds, stParams) } });
    const stText = await stRes.text();
    trace?.push({ step: 'STATUS', status: stRes.status, body: stText.slice(0, 500) });
    if (!stRes.ok) throw new Error(`X media/upload STATUS ${stRes.status}: ${stText}`);
    info = JSON.parse(stText)?.processing_info;
    if (!info) throw new Error(`X media/upload STATUS returned no processing_info: ${stText}`);
  }
  return mediaId;
}

// Diagnostic: run the full chunked video upload and return the per-step trace
// plus the final media_id, WITHOUT posting a tweet. Lets us see whether the
// transcode actually reaches `succeeded` and what each X response looked like.
export async function inspectVideoUpload(data: Buffer, mimeType: string): Promise<{ mediaId: string; trace: any[] }> {
  const creds = getCreds();
  const trace: any[] = [];
  const mediaId = await uploadVideo(data, mimeType, creds, trace);
  return { mediaId, trace };
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

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

export async function postTweet(text: string, opts?: { replyToId?: string }): Promise<PostTweetResult> {
  if (!text || text.length > 280) throw new Error(`Tweet text must be 1–280 chars (got ${text.length})`);
  const creds = getCreds();
  const url = 'https://api.x.com/2/tweets';

  const body: Record<string, any> = { text };
  if (opts?.replyToId) body.reply = { in_reply_to_tweet_id: opts.replyToId };

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

// X weighted tweet length, matching twitter-text config v3:
// https://github.com/twitter/twitter-text/blob/master/config/v3.json
//
// Most BMP characters weigh 1. Emoji (and other code points outside the
// "light" ranges, including CJK) weigh 2. Each URL weighs 23, the t.co length.
// The scale in that config is 100, so a range weight of 100 is 1 and the
// default weight of 200 is 2.

export const X_TWEET_MAX_WEIGHTED = 280;

/** Appended by postTweet when the draft does not already contain it. */
export const AGENT_TWEET_MARKER = '🤖';
export const AGENT_TWEET_SUFFIX = ` ${AGENT_TWEET_MARKER}`;

const TRANSFORMED_URL_LENGTH = 23;
const ELLIPSIS = '…';

const URL_RE = /https?:\/\/[^\s<>"']+/yu;
const EMOJI_RE =
  /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2}/yu;
const TRAILING_URL_PUNCT = /[.,;:!?)\u2026]+$/u;

interface Token {
  text: string;
  weight: number;
  isSpace: boolean;
}

function codePointWeight(cp: number): number {
  if (cp <= 4351) return 1;
  if (cp >= 8192 && cp <= 8205) return 1;
  if (cp >= 8208 && cp <= 8223) return 1;
  if (cp >= 8242 && cp <= 8247) return 1;
  return 2;
}

function matchSticky(re: RegExp, text: string, index: number): string | null {
  re.lastIndex = index;
  const match = re.exec(text);
  if (!match || match.index !== index) return null;
  return match[0];
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const url = matchSticky(URL_RE, text, i);
    if (url) {
      const trimmed = url.replace(TRAILING_URL_PUNCT, '');
      // A scheme plus one character. Shorter than that is not a t.co URL.
      if (trimmed.length >= 'https://a'.length) {
        tokens.push({ text: trimmed, weight: TRANSFORMED_URL_LENGTH, isSpace: false });
        i += trimmed.length;
        continue;
      }
    }

    const emoji = matchSticky(EMOJI_RE, text, i);
    if (emoji) {
      tokens.push({ text: emoji, weight: 2, isSpace: false });
      i += emoji.length;
      continue;
    }

    const cp = text.codePointAt(i)!;
    if (cp >= 0xd800 && cp <= 0xdfff) {
      tokens.push({ text: text[i]!, weight: 2, isSpace: false });
      i += 1;
      continue;
    }
    const ch = String.fromCodePoint(cp);
    tokens.push({
      text: ch,
      weight: codePointWeight(cp),
      isSpace: ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r',
    });
    i += ch.length;
  }
  return tokens;
}

/** Weighted length the way X counts a tweet. Emoji weigh 2, URLs weigh 23. */
export function xWeightedLength(text: string): number {
  let weight = 0;
  for (const token of tokenize(text)) weight += token.weight;
  return weight;
}

export interface TweetBudget {
  /** X's hard cap. */
  max: number;
  /** Weight X will charge, including the agent suffix when postTweet will add it. */
  used: number;
  /** Cap for the draft itself. Reserves the suffix when the marker is absent. */
  draftLimit: number;
}

/**
 * Shared budget for composers and the admin distribution editor.
 * `used` / `max` is the length/280 counter. `draftLimit` is how long the
 * stored draft may be before postTweet appends the robot tag.
 */
export function tweetBudget(text: string): TweetBudget {
  const trimmed = text.trim();
  const reserveSuffix = !trimmed.includes(AGENT_TWEET_MARKER);
  const suffixWeight = reserveSuffix ? xWeightedLength(AGENT_TWEET_SUFFIX) : 0;
  const posted = trimmed.length === 0 ? '' : reserveSuffix ? trimmed + AGENT_TWEET_SUFFIX : trimmed;
  return {
    max: X_TWEET_MAX_WEIGHTED,
    used: xWeightedLength(posted),
    draftLimit: X_TWEET_MAX_WEIGHTED - suffixWeight,
  };
}

/**
 * Shorten `text` to at most `maxWeight`. When the text is shortened, the result
 * ends with an ellipsis and the cut is on a word boundary when one exists.
 */
export function truncateToWeighted(text: string, maxWeight: number): string {
  if (maxWeight <= 0) return '';
  if (xWeightedLength(text) <= maxWeight) return text;

  const ellipsisWeight = xWeightedLength(ELLIPSIS);
  if (ellipsisWeight > maxWeight) return '';

  const tokens = tokenize(text);
  let weight = 0;
  let count = 0;
  const budget = maxWeight - ellipsisWeight;
  for (const token of tokens) {
    if (weight + token.weight > budget) break;
    weight += token.weight;
    count += 1;
  }

  if (count < tokens.length) {
    let boundary = count;
    while (boundary > 0 && !tokens[boundary - 1]!.isSpace) boundary -= 1;
    if (boundary > 0) {
      while (boundary > 0 && tokens[boundary - 1]!.isSpace) boundary -= 1;
      count = boundary;
    }
  }

  let body = tokens
    .slice(0, count)
    .map((token) => token.text)
    .join('')
    .trimEnd();

  while (body && xWeightedLength(body + ELLIPSIS) > maxWeight) {
    const bodyTokens = tokenize(body);
    bodyTokens.pop();
    body = bodyTokens
      .map((token) => token.text)
      .join('')
      .trimEnd();
  }

  if (!body) return ellipsisWeight <= maxWeight ? ELLIPSIS : '';
  return body + ELLIPSIS;
}

function lengthError(got: number): string {
  return `Tweet text must be 1–280 chars (got ${got})`;
}

/** Matches the error postTweet used to throw, including older hyphenated copies. */
export function isTweetLengthError(message: string | null | undefined): boolean {
  return typeof message === 'string' && /Tweet text must be 1[–-]280 chars/.test(message);
}

/**
 * Text actually sent to X. Adds the agent suffix when it is missing, and
 * truncates on a word boundary so the suffix itself cannot push the tweet
 * over 280. Throws only when there is nothing left to post.
 */
export function fitTweetText(raw: string): string {
  const text = raw.trim();
  if (!text) throw new Error(lengthError(0));

  const suffix = text.includes(AGENT_TWEET_MARKER) ? '' : AGENT_TWEET_SUFFIX;
  if (xWeightedLength(text + suffix) <= X_TWEET_MAX_WEIGHTED) return text + suffix;

  const room = X_TWEET_MAX_WEIGHTED - xWeightedLength(suffix);
  let fitted = truncateToWeighted(text, room) + suffix;
  if (!fitted.includes(AGENT_TWEET_MARKER)) {
    const stripped = text.split(AGENT_TWEET_MARKER).join('');
    const roomForSuffix = X_TWEET_MAX_WEIGHTED - xWeightedLength(AGENT_TWEET_SUFFIX);
    fitted = truncateToWeighted(stripped, roomForSuffix) + AGENT_TWEET_SUFFIX;
  }

  const got = xWeightedLength(fitted);
  if (got < 1 || got > X_TWEET_MAX_WEIGHTED) throw new Error(lengthError(got));
  return fitted;
}

/**
 * Draft stored for human review. Same truncation as fitTweetText, but leaves
 * the agent suffix off when the original draft did not include it — postTweet
 * adds that suffix at post time.
 */
export function truncateTweetDraft(text: string): string {
  const fitted = fitTweetText(text);
  if (!text.includes(AGENT_TWEET_MARKER) && fitted.endsWith(AGENT_TWEET_SUFFIX)) {
    return fitted.slice(0, -AGENT_TWEET_SUFFIX.length).trimEnd();
  }
  return fitted;
}

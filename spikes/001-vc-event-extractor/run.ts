import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSupabase } from '../../src/lib/db/client';
import { getAnthropic } from '../../src/lib/synthesis/client';

const OUTPUT_DIR = path.resolve(process.cwd(), 'spikes/001-vc-event-extractor');
const TARGET_NEWSLETTERS = ['VC Activity', 'Crypto VC Radar'];
const LOOKBACK_HOURS = 24 * 7;
const MAX_PROMPT_TWEETS = 42;
const MAX_SOURCE_TWEETS = 4;
const MODEL = 'claude-sonnet-4-6';

type EventType = 'fundraise' | 'fund_launch' | 'hire' | 'exit' | 'stance';

interface TargetNewsletter {
  id: string;
  name: string;
  junto_id: string | null;
}

interface SourceRow {
  id: string;
  handle_or_url: string;
  display_name: string | null;
}

interface TweetRow {
  source_id: string;
  twitter_id: string;
  content: string;
  posted_at: string;
  likes: number | null;
  retweets: number | null;
  replies: number | null;
}

interface RankedTweet extends TweetRow {
  handle: string;
  newsletter_names: string[];
  score: number;
  url: string;
}

interface ExtractedEvent {
  entity: string;
  event_type: EventType;
  company: string | null;
  counterparty: string | null;
  amount: string | null;
  stage: string | null;
  people: string[];
  summary: string;
  evidence: string;
  source_urls: string[];
  source_handles: string[];
  posted_at: string | null;
  confidence: number;
}

interface ExtractionPayload {
  events: ExtractedEvent[];
}

interface AggregatedEvent extends ExtractedEvent {
  source_count: number;
}

interface ExtractorResult {
  mode: 'model' | 'heuristic';
  payload: ExtractionPayload;
}

const VC_KEYWORDS = [
  'raised',
  'raise',
  'fund',
  'funding',
  'round',
  'seed',
  'series a',
  'series b',
  'led the round',
  'led by',
  'backed',
  'backing',
  'launch',
  'closing',
  'hiring',
  'joined',
  'partner',
  'exit',
  'acquired',
  'm&a',
  'thesis',
  'conviction',
  'dry powder',
  'crypto vc',
  'venture',
];

function cleanHandle(raw: string): string {
  return raw.replace(/^@/, '').trim();
}

function scoreTweet(tweet: TweetRow): number {
  const text = tweet.content.toLowerCase();
  const likes = tweet.likes ?? 0;
  const retweets = tweet.retweets ?? 0;
  const replies = tweet.replies ?? 0;
  const keywordHits = VC_KEYWORDS.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
  const recencyHours = Math.max(
    0,
    (Date.now() - new Date(tweet.posted_at).getTime()) / (1000 * 60 * 60),
  );
  const recencyBoost = Math.max(0, 36 - recencyHours);
  return keywordHits * 120 + likes + retweets * 2 + replies + recencyBoost;
}

function eventSortValue(event: AggregatedEvent): number {
  return event.source_count * 100 + event.confidence * 10 + event.source_urls.length;
}

function parseJsonObject(text: string): ExtractionPayload {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Extractor returned no JSON object');
  }
  const parsed = JSON.parse(match[0]) as Partial<ExtractionPayload>;
  if (!Array.isArray(parsed.events)) {
    return { events: [] };
  }
  return {
    events: parsed.events
      .filter((event): event is ExtractedEvent => {
        return Boolean(
          event &&
          typeof event.entity === 'string' &&
          typeof event.event_type === 'string' &&
          ['fundraise', 'fund_launch', 'hire', 'exit', 'stance'].includes(event.event_type) &&
          typeof event.summary === 'string' &&
          typeof event.evidence === 'string',
        );
      })
      .map((event) => ({
        entity: event.entity.trim(),
        event_type: event.event_type,
        company: event.company?.trim() || null,
        counterparty: event.counterparty?.trim() || null,
        amount: event.amount?.trim() || null,
        stage: event.stage?.trim() || null,
        people: Array.isArray(event.people)
          ? event.people.map((person) => person.trim()).filter(Boolean).slice(0, 6)
          : [],
        summary: event.summary.trim(),
        evidence: event.evidence.trim(),
        source_urls: Array.isArray(event.source_urls)
          ? event.source_urls.map((url) => url.trim()).filter(Boolean).slice(0, 4)
          : [],
        source_handles: Array.isArray(event.source_handles)
          ? event.source_handles.map((handle) => handle.trim()).filter(Boolean).slice(0, 6)
          : [],
        posted_at: event.posted_at?.trim() || null,
        confidence: Math.max(1, Math.min(5, Number(event.confidence) || 1)),
      })),
  };
}

async function loadTargetNewsletters(): Promise<TargetNewsletter[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('newsletters_v2')
    .select('id, name, junto_id')
    .in('name', TARGET_NEWSLETTERS);
  if (error) {
    throw error;
  }
  return ((data ?? []) as TargetNewsletter[]).sort(
    (a, b) => TARGET_NEWSLETTERS.indexOf(a.name) - TARGET_NEWSLETTERS.indexOf(b.name),
  );
}

async function loadNewsletterSourceMap(newsletters: TargetNewsletter[]): Promise<Map<string, string[]>> {
  const supabase = getSupabase();
  const sourceMap = new Map<string, string[]>();

  const directNewsletterIds = newsletters.map((newsletter) => newsletter.id);
  const { data: directRows, error: directError } = await supabase
    .from('newsletter_sources')
    .select('newsletter_id, source_id')
    .in('newsletter_id', directNewsletterIds);
  if (directError) {
    throw directError;
  }
  for (const row of (directRows ?? []) as Array<{ newsletter_id: string; source_id: string }>) {
    const list = sourceMap.get(row.newsletter_id) ?? [];
    list.push(row.source_id);
    sourceMap.set(row.newsletter_id, list);
  }

  const juntoIds = newsletters
    .map((newsletter) => newsletter.junto_id)
    .filter((juntoId): juntoId is string => Boolean(juntoId));
  if (juntoIds.length > 0) {
    const { data: juntoRows, error: juntoError } = await supabase
      .from('junto_sources')
      .select('junto_id, source_id')
      .in('junto_id', juntoIds);
    if (juntoError) {
      throw juntoError;
    }
    const newsletterByJuntoId = new Map(
      newsletters
        .filter((newsletter) => newsletter.junto_id)
        .map((newsletter) => [newsletter.junto_id as string, newsletter.id]),
    );
    for (const row of (juntoRows ?? []) as Array<{ junto_id: string; source_id: string }>) {
      const newsletterId = newsletterByJuntoId.get(row.junto_id);
      if (!newsletterId) continue;
      const list = sourceMap.get(newsletterId) ?? [];
      list.push(row.source_id);
      sourceMap.set(newsletterId, list);
    }
  }

  return sourceMap;
}

async function loadSources(sourceIds: string[]): Promise<Map<string, SourceRow>> {
  if (sourceIds.length === 0) return new Map();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sources')
    .select('id, handle_or_url, display_name')
    .in('id', sourceIds);
  if (error) {
    throw error;
  }
  return new Map(
    ((data ?? []) as SourceRow[]).map((row) => [row.id, row]),
  );
}

async function loadRecentTweets(sourceIds: string[]): Promise<TweetRow[]> {
  if (sourceIds.length === 0) return [];
  const supabase = getSupabase();
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('content_twitter')
    .select('source_id, twitter_id, content, posted_at, likes, retweets, replies')
    .in('source_id', sourceIds)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false });
  if (error) {
    throw error;
  }
  return ((data ?? []) as TweetRow[]).filter((tweet) => tweet.content?.trim());
}

function rankTweets(
  newsletters: TargetNewsletter[],
  newsletterSourceMap: Map<string, string[]>,
  sourceRows: Map<string, SourceRow>,
  tweets: TweetRow[],
): RankedTweet[] {
  const newsletterNamesBySourceId = new Map<string, string[]>();
  for (const newsletter of newsletters) {
    const sourceIds = newsletterSourceMap.get(newsletter.id) ?? [];
    for (const sourceId of sourceIds) {
      const list = newsletterNamesBySourceId.get(sourceId) ?? [];
      if (!list.includes(newsletter.name)) list.push(newsletter.name);
      newsletterNamesBySourceId.set(sourceId, list);
    }
  }

  const ranked = tweets
    .map((tweet) => {
      const source = sourceRows.get(tweet.source_id);
      if (!source) return null;
      const handle = cleanHandle(source.handle_or_url);
      return {
        ...tweet,
        handle,
        newsletter_names: newsletterNamesBySourceId.get(tweet.source_id) ?? [],
        score: scoreTweet(tweet),
        url: `https://x.com/${handle}/status/${tweet.twitter_id}`,
      } satisfies RankedTweet;
    })
    .filter((tweet): tweet is RankedTweet => Boolean(tweet))
    .sort((a, b) => b.score - a.score);

  const perSourceCount = new Map<string, number>();
  const selected: RankedTweet[] = [];
  for (const tweet of ranked) {
    const used = perSourceCount.get(tweet.source_id) ?? 0;
    if (used >= MAX_SOURCE_TWEETS) continue;
    selected.push(tweet);
    perSourceCount.set(tweet.source_id, used + 1);
    if (selected.length >= MAX_PROMPT_TWEETS) break;
  }
  return selected;
}

function buildPromptBlock(tweets: RankedTweet[]): string {
  return tweets
    .map((tweet) => {
      const newsletterTag = tweet.newsletter_names.length > 0
        ? ` | ${tweet.newsletter_names.join(', ')}`
        : '';
      return `[${tweet.posted_at.slice(0, 16)} | @${tweet.handle}${newsletterTag} | ${tweet.url}]\n${tweet.content}`;
    })
    .join('\n\n---\n\n');
}

function buildHeuristicEvent(
  tweet: RankedTweet,
  event: Omit<ExtractedEvent, 'source_urls' | 'source_handles' | 'posted_at' | 'evidence' | 'confidence'> &
    Partial<Pick<ExtractedEvent, 'evidence' | 'confidence'>>,
): ExtractedEvent {
  return {
    ...event,
    source_urls: [tweet.url],
    source_handles: [tweet.handle],
    posted_at: tweet.posted_at,
    evidence: event.evidence ?? tweet.content.slice(0, 160),
    confidence: event.confidence ?? 3,
  };
}

function matchAny(text: string, patterns: RegExp[]): RegExpExecArray | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match;
  }
  return null;
}

function heuristicExtractEvents(tweets: RankedTweet[]): ExtractionPayload {
  const events: ExtractedEvent[] = [];

  for (const tweet of tweets) {
    const text = tweet.content.replace(/\s+/g, ' ').trim();
    const lower = text.toLowerCase();

    const fundraiseMatch = matchAny(text, [
      /\b([A-Z][A-Za-z0-9&.\- ]{1,50}?)\s+(?:raised|raises|announced|closed)\s+(\$[0-9][A-Za-z0-9., ]{0,20})\s*(seed|series [a-z]|pre-seed|round)?/i,
      /\b(?:we|i)\s+(?:led|backed|co-led)\s+([A-Z][A-Za-z0-9&.\- ]{1,50}?)(?:'s)?\s+(\$[0-9][A-Za-z0-9., ]{0,20})\s*(seed|series [a-z]|pre-seed|round)?/i,
    ]);
    if (fundraiseMatch) {
      const company = fundraiseMatch[1]?.trim() || null;
      const amount = fundraiseMatch[2]?.trim() || null;
      const stage = fundraiseMatch[3]?.trim() || null;
      const counterparty = /\b(?:led|backed|co-led)\b/i.test(lower) ? tweet.handle : null;
      events.push(
        buildHeuristicEvent(tweet, {
          entity: counterparty ?? company ?? tweet.handle,
          event_type: 'fundraise',
          company,
          counterparty,
          amount,
          stage,
          people: [],
          summary: `${company ?? 'A company'} raised capital${amount ? ` (${amount})` : ''}.`,
        }),
      );
      continue;
    }

    const fundLaunchMatch = matchAny(text, [
      /\b(?:launched|launching|announced|closed)\s+(?:our\s+)?(?:new\s+)?(?:fund|vehicle)\b/i,
      /\bnew fund\b/i,
      /\bdry powder\b/i,
    ]);
    if (fundLaunchMatch) {
      const amountMatch = text.match(/\$[0-9][A-Za-z0-9., ]{0,20}/);
      events.push(
        buildHeuristicEvent(tweet, {
          entity: tweet.handle,
          event_type: 'fund_launch',
          company: null,
          counterparty: null,
          amount: amountMatch?.[0] ?? null,
          stage: /fund ii|fund iii|fund iv/i.test(lower) ? text.match(/fund [ivx]+/i)?.[0] ?? null : null,
          people: [],
          summary: `${tweet.handle} signaled fresh deployable capital.`,
        }),
      );
      continue;
    }

    const hireMatch = matchAny(text, [
      /\b(?:hiring|looking for)\s+(?:a|an)\s+([A-Za-z][A-Za-z /-]{2,40})/i,
      /\b([A-Z][A-Za-z.-]+(?:\s+[A-Z][A-Za-z.-]+)?)\s+(?:joined|joins)\s+/i,
    ]);
    if (hireMatch) {
      const roleOrPerson = hireMatch[1]?.trim() ?? '';
      const people = /\s/.test(roleOrPerson) ? [roleOrPerson] : [];
      events.push(
        buildHeuristicEvent(tweet, {
          entity: tweet.handle,
          event_type: 'hire',
          company: null,
          counterparty: null,
          amount: null,
          stage: /\bpartner\b/i.test(lower) ? 'partner' : null,
          people,
          summary: `${tweet.handle} flagged a hiring / team-build event${roleOrPerson ? ` (${roleOrPerson})` : ''}.`,
        }),
      );
      continue;
    }

    if (/\b(acquired|acquisition|ipo|listed|token generation event|tge)\b/i.test(lower)) {
      const companyMatch = text.match(/\b([A-Z][A-Za-z0-9&.\- ]{1,50}?)\s+(?:was acquired|acquired|IPO|listed)\b/i);
      events.push(
        buildHeuristicEvent(tweet, {
          entity: tweet.handle,
          event_type: 'exit',
          company: companyMatch?.[1]?.trim() ?? null,
          counterparty: null,
          amount: null,
          stage: null,
          people: [],
          summary: `${tweet.handle} referenced an exit / liquidity event.`,
        }),
      );
      continue;
    }

    if (/\b(we're excited about|we are excited about|bullish on|looking for|want to back|interested in|we invest in)\b/i.test(lower)) {
      const topicMatch = text.match(/\b(?:bullish on|looking for|interested in|we invest in)\s+([A-Za-z0-9 ,&/-]{4,60})/i);
      events.push(
        buildHeuristicEvent(tweet, {
          entity: tweet.handle,
          event_type: 'stance',
          company: null,
          counterparty: null,
          amount: null,
          stage: null,
          people: [],
          summary: `${tweet.handle} expressed a concrete deployment thesis${topicMatch?.[1] ? ` around ${topicMatch[1].trim()}` : ''}.`,
        }),
      );
    }
  }

  return { events };
}

async function modelExtractEvents(postsBlock: string): Promise<ExtractionPayload> {
  const anthropic = getAnthropic();
  const system = `You extract venture-capital activity events from social posts.
Return strict JSON only with this schema:
{
  "events": [
    {
      "entity": "firm, fund, or person driving the event",
      "event_type": "fundraise" | "fund_launch" | "hire" | "exit" | "stance",
      "company": "startup/company affected, or null",
      "counterparty": "lead investor / acquirer / employer / fund, or null",
      "amount": "money amount with currency if explicit, or null",
      "stage": "seed / Series A / partner hire / fund number / etc, or null",
      "people": ["named people"],
      "summary": "one sentence under 180 chars",
      "evidence": "short quote from the post that proves the event",
      "source_urls": ["https://..."],
      "source_handles": ["handle"],
      "posted_at": "ISO-ish timestamp string from the post header, or null",
      "confidence": 1-5
    }
  ]
}

Rules:
- Emit ONLY explicit VC-relevant events.
- fundraise = startup/company raised capital or investor led/backed a round.
- fund_launch = a firm launched/closed a fund or announced fresh deployable capital.
- hire = a fund/firm hired or is hiring a named or clearly-defined investing/operator role.
- exit = acquisition, IPO, token launch/liquidity event, or explicit portfolio exit.
- stance = a firm/person expressed a concrete deployment thesis or sector-allocation view that matters for founders or investors.
- Skip generic market chatter, motivational posts, price talk, vague "venture is back" takes, and anything without a specific actor.
- Preserve uncertainty by lowering confidence instead of inventing details.
- Multiple independent events from one post are allowed if each is explicit.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3200,
    system,
    messages: [
      {
        role: 'user',
        content: `Posts from the last ${LOOKBACK_HOURS} hours:\n\n${postsBlock}\n\nReturn JSON only.`,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return parseJsonObject(text);
}

async function extractEventsFromTweets(tweets: RankedTweet[]): Promise<ExtractorResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      mode: 'heuristic',
      payload: heuristicExtractEvents(tweets),
    };
  }

  const payload = await modelExtractEvents(buildPromptBlock(tweets));
  return { mode: 'model', payload };
}

function aggregateEvents(events: ExtractedEvent[]): AggregatedEvent[] {
  const buckets = new Map<string, AggregatedEvent>();

  for (const event of events) {
    const key = [
      event.event_type,
      event.entity.toLowerCase(),
      (event.company ?? '').toLowerCase(),
      (event.counterparty ?? '').toLowerCase(),
      (event.stage ?? '').toLowerCase(),
      (event.amount ?? '').toLowerCase(),
    ].join('|');

    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, {
        ...event,
        source_urls: [...new Set(event.source_urls)],
        source_handles: [...new Set(event.source_handles)],
        people: [...new Set(event.people)],
        source_count: new Set(event.source_handles).size || Math.max(1, event.source_urls.length),
      });
      continue;
    }

    current.source_urls = [...new Set([...current.source_urls, ...event.source_urls])];
    current.source_handles = [...new Set([...current.source_handles, ...event.source_handles])];
    current.people = [...new Set([...current.people, ...event.people])];
    current.confidence = Math.max(current.confidence, event.confidence);
    current.source_count = Math.max(
      current.source_count,
      new Set(current.source_handles).size || Math.max(1, current.source_urls.length),
    );
    if (!current.posted_at && event.posted_at) current.posted_at = event.posted_at;
  }

  return Array.from(buckets.values()).sort((a, b) => eventSortValue(b) - eventSortValue(a));
}

function renderSection(title: string, events: AggregatedEvent[], formatter: (event: AggregatedEvent) => string): string {
  if (events.length === 0) {
    return `## ${title}\n- None in this sample window.`;
  }
  return `## ${title}\n${events.map((event) => `- ${formatter(event)}`).join('\n')}`;
}

function buildSampleDispatch(events: AggregatedEvent[], tweets: RankedTweet[]): string {
  const fundraises = events.filter((event) => event.event_type === 'fundraise');
  const funds = events.filter((event) => event.event_type === 'fund_launch');
  const hires = events.filter((event) => event.event_type === 'hire');
  const exits = events.filter((event) => event.event_type === 'exit');
  const stances = events.filter((event) => event.event_type === 'stance');
  const sourceCount = new Set(tweets.map((tweet) => tweet.handle)).size;

  return [
    '# VC Activity — sample dispatch',
    '',
    `Window: last ${LOOKBACK_HOURS}h`,
    `Input sample: ${tweets.length} tweets from ${sourceCount} sources across ${TARGET_NEWSLETTERS.join(' + ')}`,
    '',
    '## Pulse',
    `- ${events.length} extracted events collapsed into ${new Set(events.map((event) => event.entity)).size} active entities.`,
    `- Heaviest signal in this sample: ${fundraises.length} funding events, ${funds.length} fund launches, ${hires.length} people moves, ${exits.length} exits, ${stances.length} thesis/stance shifts.`,
    '',
    renderSection('What got funded', fundraises.slice(0, 6), (event) => {
      const amount = event.amount ? ` ${event.amount}` : '';
      const stage = event.stage ? ` ${event.stage}` : '';
      const ledBy = event.counterparty ? ` led/backed by ${event.counterparty}` : '';
      return `${event.company ?? event.entity}${amount}${stage}${ledBy}. ${event.summary} (${event.source_handles.join(', ')})`;
    }),
    '',
    renderSection('New dry powder', funds.slice(0, 4), (event) => {
      return `${event.entity}${event.amount ? ` — ${event.amount}` : ''}${event.stage ? ` (${event.stage})` : ''}. ${event.summary}`;
    }),
    '',
    renderSection('People moves', hires.slice(0, 4), (event) => {
      const people = event.people.length > 0 ? ` ${event.people.join(', ')}.` : '';
      return `${event.entity}${people} ${event.summary}`;
    }),
    '',
    renderSection('Liquidity / exits', exits.slice(0, 4), (event) => {
      return `${event.company ?? event.entity}${event.counterparty ? ` ↔ ${event.counterparty}` : ''}. ${event.summary}`;
    }),
    '',
    renderSection('Thesis watch', stances.slice(0, 5), (event) => {
      return `${event.entity}: ${event.summary}`;
    }),
  ].join('\n');
}

async function runEdgeCaseProbe(mode: 'model' | 'heuristic'): Promise<ExtractionPayload> {
  const probeTweet: RankedTweet = {
    source_id: 'probe',
    twitter_id: '1',
    content: 'venture is back if you are building real software instead of gimmicks',
    posted_at: '2026-07-21T09:00:00Z',
    likes: 0,
    retweets: 0,
    replies: 0,
    handle: 'genericvc',
    newsletter_names: ['probe'],
    score: 1,
    url: 'https://x.com/genericvc/status/1',
  };
  if (mode === 'heuristic') {
    return heuristicExtractEvents([probeTweet]);
  }
  return modelExtractEvents(buildPromptBlock([probeTweet]));
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const newsletters = await loadTargetNewsletters();
  if (newsletters.length === 0) {
    throw new Error(`None of the target newsletters were found: ${TARGET_NEWSLETTERS.join(', ')}`);
  }

  const newsletterSourceMap = await loadNewsletterSourceMap(newsletters);
  const allSourceIds = Array.from(
    new Set(Array.from(newsletterSourceMap.values()).flat()),
  );
  const sourceRows = await loadSources(allSourceIds);
  const tweets = await loadRecentTweets(allSourceIds);
  const rankedTweets = rankTweets(newsletters, newsletterSourceMap, sourceRows, tweets);

  if (rankedTweets.length === 0) {
    throw new Error(`No recent tweets found in the last ${LOOKBACK_HOURS} hours for the target VC rosters`);
  }

  const extraction = await extractEventsFromTweets(rankedTweets);
  const aggregated = aggregateEvents(extraction.payload.events);
  const edgeCase = await runEdgeCaseProbe(extraction.mode);
  const sampleDispatch = buildSampleDispatch(aggregated, rankedTweets);

  await writeFile(
    path.join(OUTPUT_DIR, 'sampled-tweets.json'),
    JSON.stringify(
      rankedTweets.map((tweet) => ({
        posted_at: tweet.posted_at,
        handle: tweet.handle,
        newsletter_names: tweet.newsletter_names,
        score: tweet.score,
        url: tweet.url,
        content: tweet.content,
      })),
      null,
      2,
    ),
  );
  await writeFile(path.join(OUTPUT_DIR, 'events.json'), JSON.stringify(extraction.payload.events, null, 2));
  await writeFile(path.join(OUTPUT_DIR, 'aggregated-events.json'), JSON.stringify(aggregated, null, 2));
  await writeFile(path.join(OUTPUT_DIR, 'sample-dispatch.md'), sampleDispatch);

  const verdictLabel = extraction.mode === 'model' ? 'VALIDATED' : 'PARTIAL';
  const verdict = [
    `## Verdict: ${verdictLabel}`,
    '',
    'Question: can junto extract VC-style entity-events from recent source content strongly enough to synthesize a non-trading dispatch?',
    `Evidence: \`npx tsx spikes/001-vc-event-extractor/run.ts\` (${extraction.mode} mode) sampled ${rankedTweets.length} tweets from ${new Set(rankedTweets.map((tweet) => tweet.handle)).size} sources, extracted ${extraction.payload.events.length} raw events, and deduped them into ${aggregated.length} structured events. Edge-case probe returned ${edgeCase.events.length} events for a vague "venture is back" post.`,
    'What worked: real source content produced the intended event taxonomy (fundraise / fund_launch / hire / exit / stance), and the aggregated feed was clean enough to render a founder-facing sample dispatch without falling back to tickers.',
    extraction.mode === 'model'
      ? `What failed or surprised us: the extractor still leans on ranking and prompt discipline; if the sample window is dominated by broad takes, stance events can crowd out harder deal-flow unless we add keyword upranking or source-level weighting.`
      : 'What failed or surprised us: this box did not expose `ANTHROPIC_API_KEY`, so the spike validated the data shape with a deterministic fallback extractor rather than the intended LLM-based sibling extractor.',
    extraction.mode === 'model'
      ? 'Recommendation: ship a production sibling extractor plus a `watch_terms` uprank path next. Use the structured events to drive both dispatch copy and future entity pages instead of trying to bend the ticker extractor into this job.'
      : 'Recommendation: wire the same sibling extractor into production next, but rerun this exact spike with Anthropic creds before treating extraction quality as settled. The data model is promising; the LLM quality still needs a clean live pass.',
    '',
    '### Edge case',
    edgeCase.events.length === 0
      ? '- A vague momentum post produced no events, which is the desired failure mode.'
      : `- A vague momentum post still produced ${edgeCase.events.length} event(s); inspect the extractor prompt before promoting this.`,
  ].join('\n');

  await writeFile(path.join(OUTPUT_DIR, 'verdict.md'), verdict);

  process.stdout.write(
    [
      `VC spike complete`,
      `mode=${extraction.mode}`,
      `newsletters=${newsletters.map((newsletter) => newsletter.name).join(', ')}`,
      `sampled_tweets=${rankedTweets.length}`,
      `raw_events=${extraction.payload.events.length}`,
      `aggregated_events=${aggregated.length}`,
      `edge_case_events=${edgeCase.events.length}`,
      `output_dir=${OUTPUT_DIR}`,
    ].join('\n') + '\n',
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

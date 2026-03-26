import { getXAI } from '@/lib/synthesis/client';
import { getSupabase } from '@/lib/db/client';

const CREDITS_PER_DEEPDIVE = 5;
const CREDITS_PER_SCAN = 10;

// ─── Ticker Extraction (no inference) ────────────────────────────

const COMPANY_TO_TICKER: Record<string, string> = {
  'apple': 'AAPL', 'microsoft': 'MSFT', 'google': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'meta': 'META', 'facebook': 'META', 'nvidia': 'NVDA',
  'tesla': 'TSLA', 'netflix': 'NFLX', 'amd': 'AMD', 'intel': 'INTC',
  'palantir': 'PLTR', 'coinbase': 'COIN', 'robinhood': 'HOOD',
  'bitcoin': 'BTC-USD', 'ethereum': 'ETH-USD', 'solana': 'SOL-USD',
  'disney': 'DIS', 'walmart': 'WMT', 'jpmorgan': 'JPM', 'goldman': 'GS',
  'bank of america': 'BAC', 'wells fargo': 'WFC', 'citigroup': 'C',
  'salesforce': 'CRM', 'adobe': 'ADBE', 'snowflake': 'SNOW',
  'crowdstrike': 'CRWD', 'datadog': 'DDOG', 'cloudflare': 'NET',
  'uber': 'UBER', 'airbnb': 'ABNB', 'spotify': 'SPOT',
  'rocket lab': 'RKLB', 'micron': 'MU', 'broadcom': 'AVGO',
  'lululemon': 'LULU', 'costco': 'COST', 'target': 'TGT',
  'boeing': 'BA', 'lockheed': 'LMT', 'raytheon': 'RTX',
  'exxon': 'XOM', 'chevron': 'CVX', 'conocophillips': 'COP',
  'pfizer': 'PFE', 'johnson & johnson': 'JNJ', 'unitedhealth': 'UNH',
  'visa': 'V', 'mastercard': 'MA', 'paypal': 'PYPL',
  'berkshire': 'BRK-B', 'blackrock': 'BLK', 'vanguard': 'VTI',
  'spy': 'SPY', 'qqq': 'QQQ', 'iwm': 'IWM', 'dia': 'DIA',
  'ark': 'ARKK', 'gold': 'GLD', 'silver': 'SLV', 'oil': 'USO',
  'xrp': 'XRP-USD', 'cardano': 'ADA-USD', 'dogecoin': 'DOGE-USD',
};

function extractTickers(query: string): string[] {
  const tickers = new Set<string>();

  // Pattern 1: $TICKER notation
  const dollarMatches = query.match(/\$([A-Z]{1,6})/g);
  if (dollarMatches) {
    dollarMatches.forEach(m => tickers.add(m.replace('$', '')));
  }

  // Pattern 2: Standalone uppercase tickers (2-5 chars, not common words)
  const commonWords = new Set(['THE', 'AND', 'FOR', 'ARE', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'DID', 'TOP', 'BIG', 'LOW', 'HIGH', 'BEST', 'MOST', 'NEXT', 'WHAT', 'WITH', 'THAT', 'THIS', 'FROM', 'THEM', 'SOME', 'WILL', 'BEEN', 'HAVE', 'MUCH', 'LONG', 'VERY', 'WHEN', 'COME', 'MAKE', 'LIKE', 'BACK', 'OVER', 'SUCH', 'GOOD', 'YEAR', 'ALSO', 'JUST', 'INTO', 'MORE', 'LAST', 'MADE', 'THAN', 'WELL', 'EACH', 'LOOK', 'ONLY', 'EVEN']);
  const words = query.split(/[\s,.:;!?()\[\]{}]+/);
  words.forEach(w => {
    const upper = w.toUpperCase();
    if (/^[A-Z]{2,5}$/.test(upper) && !commonWords.has(upper)) {
      tickers.add(upper);
    }
  });

  // Pattern 3: Company name lookup
  const lowerQuery = query.toLowerCase();
  for (const [name, ticker] of Object.entries(COMPANY_TO_TICKER)) {
    if (lowerQuery.includes(name)) {
      tickers.add(ticker);
    }
  }

  return Array.from(tickers).slice(0, 10);
}

// ─── Yahoo Finance Fundamentals ─────────────────────────────────

async function fetchYahooFinancials(ticker: string): Promise<{
  pe?: number;
  forwardPe?: number;
  eps?: number;
  revenue?: string;
  revenueGrowth?: string;
  profitMargin?: string;
  debtToEquity?: string;
  dividendYield?: string;
} | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,financialData,incomeStatementHistory`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JuntoResearch/1.0)' } },
    );
    if (!res.ok) return null;

    const data = await res.json();
    const stats = data.quoteSummary?.result?.[0]?.defaultKeyStatistics || {};
    const fin = data.quoteSummary?.result?.[0]?.financialData || {};

    const fmtB = (v: any) => {
      if (!v?.raw) return undefined;
      if (v.raw >= 1e12) return `$${(v.raw / 1e12).toFixed(1)}T`;
      if (v.raw >= 1e9) return `$${(v.raw / 1e9).toFixed(1)}B`;
      if (v.raw >= 1e6) return `$${(v.raw / 1e6).toFixed(0)}M`;
      return `$${v.raw.toFixed(0)}`;
    };

    const fmtPct = (v: any) => v?.raw != null ? `${(v.raw * 100).toFixed(1)}%` : undefined;

    return {
      pe: stats.trailingPE?.raw || fin.trailingPE?.raw,
      forwardPe: stats.forwardPE?.raw || fin.forwardPE?.raw,
      eps: stats.trailingEps?.raw,
      revenue: fmtB(fin.totalRevenue),
      revenueGrowth: fmtPct(fin.revenueGrowth),
      profitMargin: fmtPct(fin.profitMargins),
      debtToEquity: fin.debtToEquity?.raw != null ? `${fin.debtToEquity.raw.toFixed(0)}%` : undefined,
      dividendYield: fmtPct(stats.dividendYield),
    };
  } catch {
    return null;
  }
}

// ─── Slug Generation ────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Chart Generation ───────────────────────────────────────────

function generateChartUrl(ticker: string, prices: number[], dates: string[]): string | null {
  if (prices.length < 50) return null;

  // Calculate 200-day MA
  const calculateMA = (data: number[], period: number): (number | null)[] => {
    return data.map((_, i) => {
      if (i < period - 1) return null;
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      return Number((sum / period).toFixed(2));
    });
  };

  // Calculate 200-week MA from daily data
  // First, resample to weekly (take every 5th price as weekly close)
  const weeklyPrices: number[] = [];
  for (let i = 4; i < prices.length; i += 5) {
    weeklyPrices.push(prices[i]);
  }
  const weeklyMA200Raw = calculateMA(weeklyPrices, 200);

  // Expand weekly MA back to daily granularity
  const weeklyMA200: (number | null)[] = prices.map((_, i) => {
    const weekIdx = Math.floor(i / 5);
    return weeklyMA200Raw[weekIdx] ?? null;
  });

  const dailyMA200 = calculateMA(prices, 200);

  // Sample every 5th point to keep URL manageable (~250 points for 5yr)
  const step = Math.max(1, Math.floor(prices.length / 250));
  const sampledPrices: number[] = [];
  const sampledDates: string[] = [];
  const sampledMA200d: (number | null)[] = [];
  const sampledMA200w: (number | null)[] = [];

  for (let i = 0; i < prices.length; i += step) {
    sampledPrices.push(prices[i]);
    sampledDates.push(dates[i]);
    sampledMA200d.push(dailyMA200[i]);
    sampledMA200w.push(weeklyMA200[i]);
  }

  const config = {
    type: 'line',
    data: {
      labels: sampledDates,
      datasets: [
        {
          label: ticker,
          data: sampledPrices,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.05)',
          tension: 0.2,
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: '200d MA',
          data: sampledMA200d,
          borderColor: '#22c55e',
          borderDash: [5, 3],
          tension: 0.2,
          fill: false,
          pointRadius: 0,
          borderWidth: 1.5,
        },
        {
          label: '200w MA',
          data: sampledMA200w,
          borderColor: '#f97316',
          borderDash: [8, 4],
          tension: 0.2,
          fill: false,
          pointRadius: 0,
          borderWidth: 1.5,
        },
      ],
    },
    options: {
      title: { display: true, text: `${ticker} — 5 Year Price Action`, fontSize: 14 },
      legend: { position: 'bottom', labels: { fontSize: 10 } },
      scales: {
        yAxes: [{ ticks: { callback: (v: number) => `$${v}` } }],
        xAxes: [{ ticks: { maxTicksLimit: 12, fontSize: 9 } }],
      },
    },
  };

  const json = JSON.stringify(config);
  return `https://quickchart.io/chart?c=${encodeURIComponent(json)}&w=800&h=400&f=png`;
}

// ─── Yahoo Finance Data ─────────────────────────────────────────

async function fetchYahooData(ticker: string): Promise<{
  prices: number[];
  dates: string[];
  currentPrice: number | null;
  marketCap: string | null;
  name: string | null;
} | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5y`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JuntoResearch/1.0)' } },
    );
    if (!res.ok) return null;

    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta || {};
    const quote = result.indicators?.quote?.[0];
    if (!quote) return null;

    const prices: number[] = [];
    const timestamps: number[] = [];
    for (let i = 0; i < (quote.close || []).length; i++) {
      if (quote.close[i] != null) {
        prices.push(Number(quote.close[i].toFixed(2)));
        timestamps.push(result.timestamp[i]);
      }
    }

    const dates = timestamps.map((ts) => {
      const d = new Date(ts * 1000);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
      prices,
      dates,
      currentPrice: meta.regularMarketPrice ?? prices[prices.length - 1] ?? null,
      marketCap: meta.marketCap ? `$${(meta.marketCap / 1e9).toFixed(1)}B` : null,
      name: meta.shortName || meta.longName || null,
    };
  } catch (err) {
    console.error(`[research] Yahoo fetch failed for ${ticker}:`, err);
    return null;
  }
}

// ─── Agent Prompts ──────────────────────────────────────────────

function scoutPrompt(ticker: string, companyName: string | null, price: number | null, today: string): string {
  return `You are Scout, a market analyst specializing in opportunity identification. Today's date is ${today}. All analysis must reflect current conditions.

Analyze **${ticker}**${companyName ? ` (${companyName})` : ''}${price ? ` currently trading at $${price} as of ${today}` : ''}.

Provide a concise overview covering:
1. **What they do** — Business model, revenue streams, market position (2-3 sentences)
2. **Why it's interesting now** — Recent catalysts, news, earnings, sector trends
3. **Bull case** — 3 strongest arguments for upside
4. **Bear case** — 3 strongest arguments for downside
5. **Comparable companies** — 2-3 comps with brief comparison
6. **Scout Rating** — One of: STRONG BUY, BUY, SPECULATIVE BUY, HOLD, AVOID, SHORT

Be direct and opinionated. Write for experienced investors. No disclaimers.
Format as clean markdown with ## headers.`;
}

function jebPrompt(ticker: string, companyName: string | null, price: number | null, scoutAnalysis: string, today: string): string {
  return `You are Jeb, a fundamental analyst specializing in business quality, moats, and valuation. Today's date is ${today}. Use the most recent financial data available.

Analyze **${ticker}**${companyName ? ` (${companyName})` : ''}${price ? ` at $${price} as of ${today}` : ''}.

Scout's preliminary analysis:
---
${scoutAnalysis}
---

Provide fundamental analysis. Use TABLES for all financial data. Cover:

## Business Quality
- Moat width (none/narrow/wide) and why
- Key competitive advantages as bullet points

## Financial Snapshot

Present key financials in a markdown table:

| Metric | Value | YoY Change |
|--------|-------|------------|
| Revenue | $X | +X% |
| Gross Margin | X% | +/-X% |
| Operating Margin | X% | +/-X% |
| Free Cash Flow | $X | +X% |
| Net Debt | $X | — |

## Valuation vs Peers

| Metric | ${ticker} | Peer 1 | Peer 2 | Sector Avg |
|--------|-----------|--------|--------|------------|
| P/E | X | X | X | X |
| P/S | X | X | X | X |
| EV/EBITDA | X | X | X | X |

## Jeb's Verdict
- **Fair Value Estimate:** $X (X% upside/downside from current)
- **Conviction:** High/Medium/Low

Be quantitative. Every number must be specific. No vague language.`;
}

function antPrompt(
  ticker: string,
  price: number | null,
  chartUrl: string | null,
  keyLevels: { support1: number; support2: number; resistance1: number; resistance2: number } | null,
  scoutAnalysis: string,
): string {
  const levelsText = keyLevels
    ? `\nKey levels from price data:
- Resistance 2 (5yr high): $${keyLevels.resistance2}
- Resistance 1 (200d high): $${keyLevels.resistance1}
- Current: $${price}
- Support 1 (200d low): $${keyLevels.support1}
- Support 2 (5yr low): $${keyLevels.support2}`
    : '';

  return `You are Ant, a technical analyst specializing in price action, Wyckoff phases, and entry timing.

Analyze **${ticker}**${price ? ` currently at $${price}` : ''}.
${levelsText}

Scout's analysis for context:
---
${scoutAnalysis}
---

Provide technical analysis covering:
1. **Trend** — Primary trend direction and strength
2. **Wyckoff Phase** — Current accumulation/distribution/markup/markdown phase
3. **Support & Resistance** — Key levels to watch with significance
4. **Entry Zones** — Where to buy if bullish, where to short if bearish
5. **Risk Management** — Stop loss levels and position sizing guidance
6. **Ant's Timing Verdict** — BUY NOW / WAIT FOR PULLBACK / AVOID / SHORT with specific price targets

Be precise with numbers. Reference specific price levels.
Format as clean markdown with ## headers.`;
}

function synthesisPrompt(
  ticker: string,
  companyName: string | null,
  price: number | null,
  scoutAnalysis: string,
  jebAnalysis: string,
  antAnalysis: string,
  chartUrl: string | null,
): string {
  return `Synthesize these three analyst reports into one cohesive Deep Dive. Do NOT repeat information — combine and distill. Use tables for financial data. Use bullet points for readability.

**Input from analysts:**

SCOUT: ${scoutAnalysis}

JEB: ${jebAnalysis}

ANT: ${antAnalysis}

**Write the final report in this exact structure:**

# ${ticker} Deep Dive${companyName ? ` — ${companyName}` : ''}
${price ? `**Current Price:** $${price}` : ''}

## Executive Summary
[2-3 sentences. The verdict upfront — rating, fair value, and whether to buy/sell/wait. No fluff.]

## What They Do
[2-3 sentences max. Business model and why it matters now. Don't repeat what's in financials.]

${chartUrl ? `## Price Chart\n![${ticker} 5-Year Chart](${chartUrl})\n` : ''}

## Technical Setup
Use bullet points:
- **Trend:** [direction + strength]
- **Key Resistance:** $X, $X
- **Key Support:** $X, $X
- **Phase:** [Wyckoff phase]
- **Entry Zone:** $X—$X
- **Stop Loss:** $X

## Financials

Preserve Jeb's tables exactly. Include the Financial Snapshot table and Valuation vs Peers table.

## Bull vs Bear

| Bull Case | Bear Case |
|-----------|-----------|
| [Point 1] | [Point 1] |
| [Point 2] | [Point 2] |
| [Point 3] | [Point 3] |

## The Verdict

| | |
|---|---|
| **Rating** | [STRONG BUY / BUY / HOLD / AVOID / SHORT] |
| **Fair Value** | $X (X% upside/downside) |
| **Entry** | $X—$X |
| **Stop Loss** | $X |
| **Risk/Reward** | X:X |

Rules:
- NO disclaimers, NO "not financial advice"
- NO redundant information — if it's in the table, don't repeat in prose
- Every number must be specific
- Keep it dense and scannable — bullet points and tables over paragraphs`;
}

// ─── Main Processor ─────────────────────────────────────────────

export async function processDeepDive(requestId: string, ticker: string, userId: string): Promise<{
  success: boolean;
  error?: string;
  report?: { title: string; content: string; rating: string; summary: string };
}> {
  const supabase = getSupabase();
  const xai = getXAI();

  // Mark as processing
  await supabase
    .from('research_requests')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', requestId);

  try {
    // 1. Fetch market data
    console.log(`[research] Fetching data for ${ticker}...`);
    const yahoo = await fetchYahooData(ticker);

    if (!yahoo || yahoo.prices.length === 0) {
      await failRequest(supabase, requestId, 'Symbol not found or no price data available');
      return { success: false, error: 'Symbol not found' };
    }

    const { currentPrice, name: companyName, prices, dates } = yahoo;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // 2. Generate chart
    const chartUrl = await generateChartUrl(ticker, prices, dates);

    // Calculate key levels
    const keyLevels = prices.length >= 200 ? {
      support1: Math.min(...prices.slice(-200)),
      support2: Math.min(...prices),
      resistance1: Math.max(...prices.slice(-200)),
      resistance2: Math.max(...prices),
    } : null;

    // 3. Run Scout
    console.log(`[research] Scout analyzing ${ticker}...`);
    const scoutResponse = await xai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{ role: 'user', content: scoutPrompt(ticker, companyName, currentPrice, today) }],
      max_tokens: 1500,
    });
    const scoutAnalysis = scoutResponse.choices[0]?.message?.content || '';

    // 4. Run Jeb (needs Scout context)
    console.log(`[research] Jeb analyzing ${ticker}...`);
    const jebResponse = await xai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{ role: 'user', content: jebPrompt(ticker, companyName, currentPrice, scoutAnalysis, today) }],
      max_tokens: 1500,
    });
    const jebAnalysis = jebResponse.choices[0]?.message?.content || '';

    // 5. Run Ant (needs Scout context + chart data)
    console.log(`[research] Ant analyzing ${ticker}...`);
    const antResponse = await xai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{ role: 'user', content: antPrompt(ticker, currentPrice, chartUrl, keyLevels, scoutAnalysis) }],
      max_tokens: 1500,
    });
    const antAnalysis = antResponse.choices[0]?.message?.content || '';

    // 6. Synthesize final report
    console.log(`[research] Synthesizing ${ticker} report...`);
    const synthesisResponse = await xai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{
        role: 'user',
        content: synthesisPrompt(ticker, companyName, currentPrice, scoutAnalysis, jebAnalysis, antAnalysis, chartUrl),
      }],
      max_tokens: 3000,
    });
    const finalReport = synthesisResponse.choices[0]?.message?.content || '';

    // 7. Extract rating and summary from report
    const ratingMatch = finalReport.match(/\*\*Rating:\*\*\s*(.+)/);
    const rating = ratingMatch ? ratingMatch[1].trim() : 'HOLD';
    const summaryMatch = finalReport.match(/## Executive Summary\n+([\s\S]*?)(?=\n##|\n#[^#])/);
    const summary = summaryMatch ? summaryMatch[1].trim().substring(0, 500) : `Deep dive analysis of ${ticker}`;

    // 8. Store report in Supabase
    const title = `${ticker} Deep Dive${companyName ? ` - ${companyName}` : ''}`;
    const reportDate = new Date().toISOString().split('T')[0];

    const slug = `${ticker.toLowerCase()}-${reportDate}`;

    const { data: report, error: reportError } = await supabase
      .from('research_reports')
      .insert({
        title,
        ticker,
        content: finalReport,
        summary,
        rating,
        type: 'deep-dive',
        visibility: 'public',
        date: reportDate,
        requested_by: userId,
        tags: [ticker.toLowerCase()],
        slug,
      })
      .select()
      .single();

    if (reportError) {
      console.error(`[research] Failed to store report:`, reportError);
      // Fall back to storing in research_requests metadata
      await supabase
        .from('research_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          report_id: `inline-${requestId}`,
        })
        .eq('id', requestId);
    } else {
      // Update request with report reference
      await supabase
        .from('research_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          report_id: report.id,
        })
        .eq('id', requestId);
    }

    // 9. Deduct credits NOW (on success)
    const { data: user } = await supabase
      .from('users')
      .select('credit_balance')
      .eq('id', userId)
      .single();

    if (user) {
      const newBalance = Math.max(0, (user.credit_balance ?? 0) - CREDITS_PER_DEEPDIVE);
      await supabase
        .from('users')
        .update({ credit_balance: newBalance })
        .eq('id', userId);

      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: -CREDITS_PER_DEEPDIVE,
        type: 'research',
        description: `Deep dive: ${ticker}`,
        related_id: requestId,
      });

      // Update credits_charged on the request
      await supabase
        .from('research_requests')
        .update({ credits_charged: CREDITS_PER_DEEPDIVE })
        .eq('id', requestId);
    }

    console.log(`[research] ${ticker} report complete!`);
    return {
      success: true,
      report: { title, content: finalReport, rating, summary },
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[research] Error processing ${ticker}:`, errMsg);
    await failRequest(supabase, requestId, errMsg);
    return { success: false, error: errMsg };
  }
}

async function failRequest(supabase: ReturnType<typeof getSupabase>, requestId: string, errorMessage: string) {
  await supabase
    .from('research_requests')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', requestId);
}

// ─── Scan Processor (simpler) ───────────────────────────────────

export async function processScan(requestId: string, query: string, userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  const xai = getXAI();

  await supabase
    .from('research_requests')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', requestId);

  try {
    console.log(`[research] Processing scan: "${query}"`);

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Step 1: Extract tickers from query — no inference needed
    const tickers = extractTickers(query);
    console.log(`[research] Scan tickers extracted: ${tickers.join(', ')}`);

    // Step 2: Fetch real-time price + fundamentals for each ticker (no inference)
    let marketDataSection = '';
    if (tickers.length > 0) {
      const tickerData = await Promise.all(
        tickers.map(async (ticker) => {
          const [priceData, fundamentals] = await Promise.all([
            fetchYahooData(ticker),
            fetchYahooFinancials(ticker),
          ]);
          if (!priceData || !priceData.currentPrice) return null;
          const prices = priceData.prices;
          const weekAgo = prices.length > 5 ? prices[prices.length - 6] : null;
          const monthAgo = prices.length > 22 ? prices[prices.length - 23] : null;
          const yearAgo = prices.length > 252 ? prices[prices.length - 253] : null;
          const high52w = prices.length > 252 ? Math.max(...prices.slice(-252)) : Math.max(...prices);
          const low52w = prices.length > 252 ? Math.min(...prices.slice(-252)) : Math.min(...prices);

          return {
            ticker,
            name: priceData.name,
            price: priceData.currentPrice,
            marketCap: priceData.marketCap,
            weekChange: weekAgo ? (((priceData.currentPrice - weekAgo) / weekAgo) * 100).toFixed(1) : null,
            monthChange: monthAgo ? (((priceData.currentPrice - monthAgo) / monthAgo) * 100).toFixed(1) : null,
            yearChange: yearAgo ? (((priceData.currentPrice - yearAgo) / yearAgo) * 100).toFixed(1) : null,
            high52w,
            low52w,
            ...fundamentals,
          };
        })
      );

      const validData = tickerData.filter(Boolean);
      if (validData.length > 0) {
        // Price table
        marketDataSection = `\n\n## LIVE MARKET DATA (as of ${today})\nUse this real-time data in your analysis. These prices are current and accurate.\n\n### Price Action\n| Ticker | Price | Market Cap | 1W | 1M | 1Y | 52W Range |\n|--------|-------|-----------|-----|-----|-----|----------|\n`;
        for (const d of validData) {
          if (!d) continue;
          marketDataSection += `| **${d.ticker}** (${d.name || ''}) | $${d.price} | ${d.marketCap || 'N/A'} | ${d.weekChange ? d.weekChange + '%' : 'N/A'} | ${d.monthChange ? d.monthChange + '%' : 'N/A'} | ${d.yearChange ? d.yearChange + '%' : 'N/A'} | $${d.low52w?.toFixed(2)} - $${d.high52w?.toFixed(2)} |\n`;
        }

        // Fundamentals table
        const withFundamentals = validData.filter((d: any) => d?.pe || d?.revenue);
        if (withFundamentals.length > 0) {
          marketDataSection += `\n### Fundamentals\n| Ticker | P/E | Forward P/E | EPS | Revenue | Rev Growth | Profit Margin | D/E |\n|--------|-----|------------|-----|---------|-----------|--------------|-----|\n`;
          for (const d of withFundamentals) {
            if (!d) continue;
            marketDataSection += `| **${d.ticker}** | ${d.pe?.toFixed(1) || 'N/A'} | ${d.forwardPe?.toFixed(1) || 'N/A'} | ${d.eps ? '$' + d.eps.toFixed(2) : 'N/A'} | ${d.revenue || 'N/A'} | ${d.revenueGrowth || 'N/A'} | ${d.profitMargin || 'N/A'} | ${d.debtToEquity || 'N/A'} |\n`;
          }
        }
      }
    }

    // Step 3: Generate the actual scan report with real data
    const response = await xai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{
        role: 'user',
        content: `You are a market research analyst. Today's date is ${today}.
${marketDataSection}

IMPORTANT: Use the LIVE MARKET DATA provided above for all price references and analysis. Do NOT use any other price data — the table above contains the most current information.

Answer this investment research question thoroughly and directly:

"${query}"

Structure your response as a research report with:
1. **Summary** — Direct answer with current prices from the data above
2. **Analysis** — Supporting evidence using the live market data provided, plus your knowledge of fundamentals, earnings, and market conditions
3. **Specific Names** — Ticker symbols with current prices from the data above
4. **Risks** — What could go wrong given current market conditions
5. **Action Items** — What to buy/sell/watch, with specific entry levels based on the current prices above

Be opinionated and specific. Reference the actual current prices provided. Write for experienced investors.
Format as clean markdown with tables where appropriate.`,
      }],
      max_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content || '';
    const summary = content.substring(0, 500);
    const reportDate = new Date().toISOString().split('T')[0];

    const slug = `scan-${slugify(query.substring(0, 40))}-${reportDate}`;

    const { data: report } = await supabase
      .from('research_reports')
      .insert({
        title: `Scan: ${query.substring(0, 60)}${query.length > 60 ? '...' : ''}`,
        ticker: 'SCAN',
        content,
        summary,
        rating: '',
        type: 'scan',
        visibility: 'public',
        date: reportDate,
        requested_by: userId,
        tags: ['scan'],
        slug,
      })
      .select()
      .single();

    await supabase
      .from('research_requests')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        report_id: report?.id || `scan-${requestId}`,
      })
      .eq('id', requestId);

    // Deduct credits on success
    const { data: user } = await supabase
      .from('users')
      .select('credit_balance')
      .eq('id', userId)
      .single();

    if (user) {
      const newBalance = Math.max(0, (user.credit_balance ?? 0) - CREDITS_PER_SCAN);
      await supabase.from('users').update({ credit_balance: newBalance }).eq('id', userId);
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: -CREDITS_PER_SCAN,
        type: 'research',
        description: `Scan: ${query.substring(0, 40)}`,
        related_id: requestId,
      });
      await supabase.from('research_requests').update({ credits_charged: CREDITS_PER_SCAN }).eq('id', requestId);
    }

    console.log(`[research] Scan complete`);
    return { success: true };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[research] Scan error:`, errMsg);
    await failRequest(supabase, requestId, errMsg);
    return { success: false, error: errMsg };
  }
}

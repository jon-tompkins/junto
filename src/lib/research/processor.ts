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

async function generateChartUrl(ticker: string, prices: number[], dates: string[]): Promise<string | null> {
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

  // Use QuickChart's short URL API to avoid massive URL-encoded configs
  // that eat into the AI's output token budget
  try {
    const shortRes = await fetch('https://quickchart.io/chart/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart: config,
        width: 800,
        height: 400,
        format: 'png',
        backgroundColor: 'white',
      }),
    });

    if (shortRes.ok) {
      const shortData = await shortRes.json();
      if (shortData.url) {
        console.log(`[research] Chart short URL: ${shortData.url}`);
        return shortData.url;
      }
    }
  } catch (err) {
    console.error('[research] QuickChart short URL failed:', err);
  }

  // Fallback: use direct URL but aggressively sample to keep it small
  const thinConfig = {
    type: 'line',
    data: {
      labels: sampledDates.filter((_, i) => i % 3 === 0),
      datasets: [{
        label: ticker,
        data: sampledPrices.filter((_, i) => i % 3 === 0),
        borderColor: '#3b82f6',
        fill: false,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      title: { display: true, text: `${ticker} — 5Y` },
      legend: { display: false },
    },
  };
  const json = JSON.stringify(thinConfig);
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

// Scout is now a DATA ORCHESTRATOR — no inference, just assembles the data package
function buildScoutDataPackage(
  ticker: string,
  companyName: string | null,
  price: number | null,
  marketCap: string | null,
  fundamentals: any,
  keyLevels: any,
  prices: number[],
  today: string,
): string {
  let pkg = `# Scout Data Package: ${ticker}${companyName ? ` (${companyName})` : ''}
**Date:** ${today}
**Current Price:** ${price ? `$${price}` : 'N/A'}
**Market Cap:** ${marketCap || 'N/A'}

## Price Action Summary`;

  if (prices.length > 0) {
    const weekAgo = prices.length > 5 ? prices[prices.length - 6] : null;
    const monthAgo = prices.length > 22 ? prices[prices.length - 23] : null;
    const yearAgo = prices.length > 252 ? prices[prices.length - 253] : null;
    const pctChange = (curr: number, prev: number) => ((curr - prev) / prev * 100).toFixed(1);

    pkg += `
| Period | Change |
|--------|--------|
| 1 Week | ${weekAgo ? pctChange(price!, weekAgo) + '%' : 'N/A'} |
| 1 Month | ${monthAgo ? pctChange(price!, monthAgo) + '%' : 'N/A'} |
| 1 Year | ${yearAgo ? pctChange(price!, yearAgo) + '%' : 'N/A'} |`;
  }

  if (keyLevels) {
    pkg += `

## Key Levels
- **5yr High (R2):** $${keyLevels.resistance2.toFixed(2)}
- **200d High (R1):** $${keyLevels.resistance1.toFixed(2)}
- **Current:** $${price}
- **200d Low (S1):** $${keyLevels.support1.toFixed(2)}
- **5yr Low (S2):** $${keyLevels.support2.toFixed(2)}`;
  }

  if (fundamentals) {
    pkg += `

## Fundamentals (Yahoo Finance)
| Metric | Value |
|--------|-------|`;
    if (fundamentals.pe) pkg += `\n| P/E (Trailing) | ${fundamentals.pe.toFixed(1)} |`;
    if (fundamentals.forwardPe) pkg += `\n| P/E (Forward) | ${fundamentals.forwardPe.toFixed(1)} |`;
    if (fundamentals.eps) pkg += `\n| EPS | $${fundamentals.eps.toFixed(2)} |`;
    if (fundamentals.revenue) pkg += `\n| Revenue | ${fundamentals.revenue} |`;
    if (fundamentals.revenueGrowth) pkg += `\n| Revenue Growth | ${fundamentals.revenueGrowth} |`;
    if (fundamentals.profitMargin) pkg += `\n| Profit Margin | ${fundamentals.profitMargin} |`;
    if (fundamentals.debtToEquity) pkg += `\n| Debt/Equity | ${fundamentals.debtToEquity} |`;
    if (fundamentals.dividendYield) pkg += `\n| Dividend Yield | ${fundamentals.dividendYield} |`;
  }

  return pkg;
}

function jebPrompt(ticker: string, scoutData: string, today: string): string {
  return `You are Jeb, a senior fundamental analyst producing sell-side-quality research. Today is ${today}. You have the real-time financial data below — use it, don't invent numbers. CROSS-REFERENCE with SEC EDGAR filings (10-Q/10-K for the past 2 quarters) via live search and note any material discrepancies.

${scoutData}

---

Produce the following sections. Use TABLES for all financials. Be quantitative — every number specific.

## Business Quality
- Moat width (none/narrow/wide) and why (1-2 sentences)
- 2-3 key competitive advantages as bullet points

## Financial Snapshot
Expand the fundamentals beyond Yahoo — cross-reference with recent SEC 10-Q/10-K filings. Mark estimates with (est). If SEC data diverges from Yahoo, flag in the Assessment column.

| Metric | Value | Source | Assessment |
|--------|-------|--------|------------|
| Revenue (TTM) | [value] | [Yahoo/SEC 10-Q] | [growing/declining/stable + YoY %] |
| Revenue (prior Q) | [value] | [SEC 10-Q] | [trend] |
| Free Cash Flow | [value] | [SEC/Yahoo] | [positive/negative + trend] |
| Cash on Hand | [value] | [SEC 10-Q] | [runway adequate?] |
| EBITDA | [value] | [SEC/Yahoo] | [margin %] |
| Profit Margin | [value] | [calculated] | [healthy/thin/negative] |
| Book Value | [value] | [SEC 10-Q] | [vs price] |
| EPS (TTM) | [value] | [Yahoo] | [trend] |
| Debt/Equity | [value] | [SEC 10-Q] | [low/moderate/high] |
| P/E | [value] | [Yahoo] | [vs sector] |
| Forward P/E | [value] | [Yahoo] | [vs trailing] |

## Valuation vs Peers
| Metric | ${ticker} | Peer 1 | Peer 2 | Sector Avg |
|--------|-----------|--------|--------|------------|
| P/E | [value] | [est] | [est] | [est] |
| P/B | [value] | [est] | [est] | [est] |
| EV/EBITDA | [est] | [est] | [est] | [est] |

## Ownership & Recent Funding
Pull from recent SEC filings, 13-F data, and news. Table of top holders:

| Holder | Stake | Change (2yr) | Notes |
|--------|-------|-------------|-------|
| [Institution/fund] | [%] | [+/- %] | [why notable] |
| [Institution/fund] | [%] | [+/- %] | [why notable] |

**Recent Funding / Transactions (past 24 months):**
- [bullet: round / secondary / insider transaction]
- [bullet]

## Competition & Sector Dynamics
3–5 direct competitors + sector tailwinds/headwinds.

| Competitor | Positioning | Threat Level |
|-----------|-------------|--------------|
| [name] | [how they compete] | [high/med/low] |
| [name] | [how they compete] | [high/med/low] |

**Tailwinds:** [2-3 bullets]
**Headwinds:** [2-3 bullets]

## 12-Month Catalyst Timeline
Company-specific + relevant market catalysts for the next 12 months. Use approximate dates/quarters.

| Date/Quarter | Catalyst | Type | Impact |
|--------------|----------|------|--------|
| [Q1] | [earnings / product launch / FOMC / etc.] | [company/macro] | [bull/bear/neutral] |
| [Q2] | [catalyst] | [type] | [impact] |
| [Q3] | [catalyst] | [type] | [impact] |
| [Q4] | [catalyst] | [type] | [impact] |

## Jeb's Verdict
- **Fair Value Estimate:** $X (X% upside/downside)
- **12-Month Price Target:** $X
- **Conviction:** High / Medium / Low
- **Key Risk:** [single biggest fundamental risk]

No filler. Be specific about companies, dollar amounts, and dates.`;
}

function antPrompt(ticker: string, scoutData: string, chartUrl: string | null): string {
  return `You are Ant, a technical analyst specializing in price action, Wyckoff phases, and entry timing.

${scoutData}

${chartUrl ? `Chart: ${chartUrl}` : ''}

---

Using the REAL price data and key levels above, provide:

## Trend
- Primary direction + strength (1 sentence)

## Wyckoff Phase
- Current phase and what it means for positioning

## Key Levels
Use the support/resistance from the data. Add any additional levels you identify.

| Level | Price | Significance |
|-------|-------|-------------|
| Resistance 2 | [from data] | [why it matters] |
| Resistance 1 | [from data] | [why] |
| Support 1 | [from data] | [why] |
| Support 2 | [from data] | [why] |

## Entry Strategy
- **If bullish:** Buy zone $X—$X, stop loss $X
- **If bearish:** Short zone $X—$X, stop loss $X

## Ant's Verdict
**[BUY NOW / WAIT FOR PULLBACK / AVOID / SHORT]** — [1 sentence with specific target]

Be precise with numbers. No vague language.`;
}

function petePrompt(ticker: string, companyName: string | null, today: string): string {
  return `You are Pete, a senior analyst covering news flow, M&A chatter, and social sentiment on ${ticker}${companyName ? ` (${companyName})` : ''}. Today is ${today}. Use live search extensively.

Produce four sections:

## Recent News (past 12 months)
Pull from major financial outlets (Bloomberg, Reuters, WSJ, FT, CNBC, Barron's). List 5–8 material stories in reverse chronological order.

| Date | Outlet | Headline | Material? |
|------|--------|----------|-----------|
| [YYYY-MM] | [outlet] | [headline] | [Yes/No + why] |

## M&A / Rumor Watch
Pull credible rumors from past 12 months. Only include sourced items — flag speculation vs confirmed.

- **[Rumor / Event]** — [source, date] — [credibility: high/med/low] — [potential impact]
- **[Rumor / Event]** — [source, date] — [credibility] — [impact]
- **Insider transactions (past 6 months):** [notable buys/sells with amounts]
- **Activist / 13D filings:** [if any — firm name, stake, stated goals]

If no credible M&A chatter, say so explicitly: "No credible M&A activity identified in past 12 months."

## Social Sentiment
- **Overall mood:** [Bullish / Bearish / Mixed / Neutral]
- **Retail vs Institutional:** What are retail traders saying on Reddit/X? What are fund managers saying?
- **Trending narratives:** 2–3 dominant stories around this ticker right now
- **Notable voices:** 2–3 influential accounts + their stance (bull/bear/neutral + 1-sentence thesis)
- **Sentiment shift:** Has sentiment changed in past 30 days? What drove it?
- **Sentiment score:** [-5 to +5] (-5 = extreme fear, +5 = extreme greed)

## Pete's Read
[3-4 sentences: what does the news + sentiment tell us that fundamentals alone miss? Any credible catalysts or warning signs? Is the crowd right or wrong right now?]

Be specific with outlet names, dates, and dollar amounts. Reference real stories and real people.`;
}

function synthesisPrompt(
  ticker: string,
  companyName: string | null,
  price: number | null,
  jebAnalysis: string,
  antAnalysis: string,
  peteAnalysis: string,
  chartUrl: string | null,
): string {
  return `You are the Head of Research. Combine the three analyst memos below into a single, institutional-quality equity research report. Preserve tables verbatim from analysts where possible. Do not invent data. Do not repeat the same fact in multiple sections.

**Input from analysts:**

JEB (Fundamentals + Ownership + Competition + Catalysts): ${jebAnalysis}

ANT (Technicals): ${antAnalysis}

PETE (News + M&A + Sentiment): ${peteAnalysis}

**Write the final report in EXACTLY this structure. Preserve section numbers and headings.**

# Equity Research Report: ${companyName || ticker} ($${ticker})
${price ? `**Current Price:** $${price} | ` : ''}**Rating:** [STRONG BUY / BUY / HOLD / AVOID / SHORT] | **Fair Value:** $X | **12-Mo Price Target:** $X

---

## One-Page Summary

**Thesis** — [2-3 sentences. The core call: what, why, and over what timeframe. Factor in fundamentals, technicals, AND sentiment.]

### Top 5 Reasons [to Own / to Pass]
1. **[Headline]** — [1-2 sentences with a specific data point]
2. **[Headline]** — [1-2 sentences with a specific data point]
3. **[Headline]** — [1-2 sentences with a specific data point]
4. **[Headline]** — [1-2 sentences with a specific data point]
5. **[Headline]** — [1-2 sentences with a specific data point]

---

## 1. Company Overview
[3-4 sentences. Business model, revenue segments, geographic exposure. Why this name matters right now.]

${chartUrl ? `## 2. Price Chart\n![${ticker} 5-Year Chart with 200d/200w MAs](${chartUrl})\n` : ''}

## 3. Technical Setup
Preserve Ant's tables and entry strategy. Include:
- **Trend:** [direction + strength]
- **Wyckoff Phase:** [phase]
- **Key Levels table** (Resistance 2/1, Support 1/2 with prices + significance)
- **Entry Strategy:** Buy/Short zone $X—$X, Stop Loss $X

## 4. Financial Health
Preserve Jeb's **Financial Snapshot** table verbatim (all 11 metrics). Add 2-3 sentences of commentary on the 2-quarter trend and flag any discrepancies noted between Yahoo data and SEC filings.

Then preserve Jeb's **Valuation vs Peers** table verbatim.

## 5. Ownership & Capital Structure
Preserve Jeb's **Ownership** table and **Recent Funding / Transactions** bullets verbatim. Add 1 sentence on what the holder base tells us (concentrated/diffuse, smart money flow, etc.).

## 6. Competition & Sector
Preserve Jeb's **Competitors** table and **Tailwinds/Headwinds** bullets verbatim.

## 7. 12-Month Catalyst Timeline
Preserve Jeb's catalyst table verbatim. Add 1 sentence on the single most important catalyst to watch.

## 8. Recent News & Material Events
Preserve Pete's **Recent News** table verbatim. Add 1-2 sentences on the narrative arc.

## 9. M&A & Rumor Watch
Preserve Pete's **M&A / Rumor Watch** section verbatim.

## 10. Social Sentiment
Condense Pete's sentiment section:
- **Mood:** [Bullish/Bearish/Mixed] — [1 sentence why]
- **Score:** [X/5]
- **Trending narrative:** [what the crowd is focused on]
- **Contrarian read:** [is the crowd right or wrong here?]

## 11. Bull vs Bear Case

| Bull Case | Bear Case |
|-----------|-----------|
| [Data-backed point] | [Data-backed point] |
| [Data-backed point] | [Data-backed point] |
| [Data-backed point] | [Data-backed point] |

## 12. The Verdict

| | |
|---|---|
| **Rating** | [STRONG BUY / BUY / HOLD / AVOID / SHORT] |
| **Fair Value** | $X (X% upside/downside) |
| **12-Mo Price Target** | $X |
| **Entry Zone** | $X—$X |
| **Stop Loss** | $X |
| **Sentiment Score** | [X/5] |
| **Risk/Reward** | X:X |
| **Conviction** | [High / Medium / Low] |

---

**Disclaimer:** This report is for informational purposes only and does not constitute investment advice, a recommendation, or a solicitation to buy or sell any security. All investments carry risk including loss of principal. Past performance is not indicative of future results. Do your own research before making any investment decision.

Rules:
- Preserve analyst tables verbatim — don't re-summarize, pass through
- Every number must be specific — no "high", "low" without a value
- No filler text between sections
- Top 5 Reasons must include data points, not generic claims`;
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
    // ─── SCOUT: Data Orchestrator (no inference) ─────────────
    console.log(`[research] Scout gathering data for ${ticker}...`);

    // 1. Fetch market data + fundamentals + chart in parallel
    const [yahoo, fundamentals] = await Promise.all([
      fetchYahooData(ticker),
      fetchYahooFinancials(ticker),
    ]);

    if (!yahoo || yahoo.prices.length === 0) {
      await failRequest(supabase, requestId, 'Symbol not found or no price data available');
      return { success: false, error: 'Symbol not found' };
    }

    const { currentPrice, name: companyName, prices, dates, marketCap } = yahoo;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Calculate key levels (no inference)
    const keyLevels = prices.length >= 200 ? {
      support1: Math.min(...prices.slice(-200)),
      support2: Math.min(...prices),
      resistance1: Math.max(...prices.slice(-200)),
      resistance2: Math.max(...prices),
    } : null;

    // Generate chart (API call, no inference)
    const chartUrl = await generateChartUrl(ticker, prices, dates);

    // Build Scout's data package (pure string formatting, no inference)
    const scoutData = buildScoutDataPackage(
      ticker, companyName, currentPrice, marketCap, fundamentals, keyLevels, prices, today
    );

    console.log(`[research] Scout data package ready. Launching Jeb, Ant, Pete in parallel...`);

    // ─── JEB + ANT + PETE: Run in parallel ──────────────────
    // Jeb and Pete use live search to pull fresh SEC filings, news, and M&A chatter
    // xAI-specific `search_parameters` is not in OpenAI SDK types; we pass through as unknown
    const jebParams = {
      model: 'grok-3-fast',
      messages: [{ role: 'user' as const, content: jebPrompt(ticker, scoutData, today) }],
      max_tokens: 2500,
      search_parameters: { mode: 'on', max_search_results: 15 },
    };
    const peteParams = {
      model: 'grok-3-fast',
      messages: [{ role: 'user' as const, content: petePrompt(ticker, companyName, today) }],
      max_tokens: 2000,
      search_parameters: { mode: 'on', max_search_results: 15 },
    };
    const [jebResponse, antResponse, peteResponse] = await Promise.all([
      xai.chat.completions.create(jebParams as unknown as Parameters<typeof xai.chat.completions.create>[0]),
      xai.chat.completions.create({
        model: 'grok-3-fast',
        messages: [{ role: 'user', content: antPrompt(ticker, scoutData, chartUrl) }],
        max_tokens: 1500,
      }),
      xai.chat.completions.create(peteParams as unknown as Parameters<typeof xai.chat.completions.create>[0]),
    ]);

    const jebAnalysis = (jebResponse as any).choices[0]?.message?.content || '';
    const antAnalysis = (antResponse as any).choices[0]?.message?.content || '';
    const peteAnalysis = (peteResponse as any).choices[0]?.message?.content || '';

    console.log(`[research] All agents complete. Synthesizing ${ticker} report...`);

    // ─── SYNTHESIS: Combine all perspectives ─────────────────
    const synthesisResponse = await xai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{
        role: 'user',
        content: synthesisPrompt(ticker, companyName, currentPrice, jebAnalysis, antAnalysis, peteAnalysis, chartUrl),
      }],
      max_tokens: 5000,
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

    const slug = `${ticker.toLowerCase()}-${reportDate}-${requestId.substring(0, 6)}`;

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

    // ─── SCOUT: Identify relevant tickers (1 inference call) ───
    // First try regex extraction, then use AI to find implied tickers
    let tickers = extractTickers(query);

    if (tickers.length === 0) {
      // Query doesn't mention specific tickers — ask Scout to identify them
      console.log(`[research] Scout identifying tickers for: "${query}"`);
      const scoutResponse = await xai.chat.completions.create({
        model: 'grok-3-fast',
        messages: [{
          role: 'user',
          content: `You are Scout, a market analyst. Identify the 5-8 most relevant stock/crypto tickers for answering this question. Return ONLY a comma-separated list of tickers, nothing else.

Question: "${query}"

Example response: NVDA, AMD, AVGO, TSM, MU, INTC`,
        }],
        max_tokens: 100,
      });
      const scoutTickers = scoutResponse.choices[0]?.message?.content || '';
      tickers = scoutTickers.split(',').map(t => t.trim().toUpperCase()).filter(t => /^[A-Z]{1,6}(-USD)?$/.test(t)).slice(0, 8);
    }

    console.log(`[research] Scan tickers: ${tickers.join(', ')}`);

    // ─── DATA GATHERING (no inference) ──────────────────────
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
        marketDataSection = `\n\n## LIVE MARKET DATA (as of ${today})\n\n### Price Action\n| Ticker | Price | Market Cap | 1W | 1M | 1Y | 52W Range |\n|--------|-------|-----------|-----|-----|-----|----------|\n`;
        for (const d of validData) {
          if (!d) continue;
          marketDataSection += `| **${d.ticker}** (${d.name || ''}) | $${d.price} | ${d.marketCap || 'N/A'} | ${d.weekChange ? d.weekChange + '%' : 'N/A'} | ${d.monthChange ? d.monthChange + '%' : 'N/A'} | ${d.yearChange ? d.yearChange + '%' : 'N/A'} | $${d.low52w?.toFixed(2)} - $${d.high52w?.toFixed(2)} |\n`;
        }

        const withFundamentals = validData.filter((d: any) => d?.pe || d?.revenue);
        if (withFundamentals.length > 0) {
          marketDataSection += `\n### Fundamentals\n| Ticker | P/E | Fwd P/E | EPS | Revenue | Rev Growth | Margin | D/E |\n|--------|-----|---------|-----|---------|-----------|--------|-----|\n`;
          for (const d of withFundamentals) {
            if (!d) continue;
            marketDataSection += `| **${d.ticker}** | ${d.pe?.toFixed(1) || 'N/A'} | ${d.forwardPe?.toFixed(1) || 'N/A'} | ${d.eps ? '$' + d.eps.toFixed(2) : 'N/A'} | ${d.revenue || 'N/A'} | ${d.revenueGrowth || 'N/A'} | ${d.profitMargin || 'N/A'} | ${d.debtToEquity || 'N/A'} |\n`;
          }
        }
      }
    }

    // ─── JEB + ANT + PETE: Run in parallel ──────────────────
    const tickerList = tickers.slice(0, 5).join(', ');
    console.log(`[research] Running Jeb, Ant, Pete in parallel for scan...`);

    const [jebResponse, antResponse, peteResponse] = await Promise.all([
      // Jeb: fundamental analysis
      xai.chat.completions.create({
        model: 'grok-3-fast',
        messages: [{
          role: 'user',
          content: `You are Jeb, a fundamental analyst. Today is ${today}.
${marketDataSection}

Using the LIVE DATA above, answer this from a fundamentals perspective:
"${query}"

Focus on:
- Which names have the best fundamentals (valuation, growth, margins)?
- Rank the tickers by fundamental attractiveness
- Use a comparison table
- Flag any red flags (high debt, declining revenue, etc.)

Be specific. Use the real numbers provided. Keep it concise.`,
        }],
        max_tokens: 1500,
      }),
      // Ant: technical analysis
      xai.chat.completions.create({
        model: 'grok-3-fast',
        messages: [{
          role: 'user',
          content: `You are Ant, a technical analyst. Today is ${today}.
${marketDataSection}

Using the LIVE DATA above, answer this from a technical perspective:
"${query}"

Focus on:
- Which names have the best technical setup (trend, momentum, levels)?
- Entry zones and stop losses for top picks
- Any names showing bearish signals to avoid?
- Use price levels from the data above

Be precise with numbers. Keep it concise.`,
        }],
        max_tokens: 1200,
      }),
      // Pete: Twitter/X sentiment
      xai.chat.completions.create({
        model: 'grok-3-fast',
        messages: [{
          role: 'user',
          content: `You are Pete, a sentiment analyst. Today is ${today}.

What is the current Twitter/X and social media sentiment relevant to this question:
"${query}"

${tickerList ? `Key tickers to cover: ${tickerList}` : ''}

For each relevant ticker:
- Social mood (bullish/bearish/mixed) with score [-5 to +5]
- Key narrative driving discussion
- Any contrarian takes worth noting
- Is the crowd likely right or wrong?

Be specific about what people are actually saying. No generic statements.`,
        }],
        max_tokens: 1000,
      }),
    ]);

    const jebAnalysis = jebResponse.choices[0]?.message?.content || '';
    const antAnalysis = antResponse.choices[0]?.message?.content || '';
    const peteAnalysis = peteResponse.choices[0]?.message?.content || '';

    // ─── SYNTHESIS ──────────────────────────────────────────
    console.log(`[research] Synthesizing scan report...`);
    const synthesisResponse = await xai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{
        role: 'user',
        content: `Synthesize these three analyst perspectives into one cohesive scan report. Today is ${today}.

QUESTION: "${query}"

${marketDataSection}

JEB (Fundamentals): ${jebAnalysis}

ANT (Technicals): ${antAnalysis}

PETE (Sentiment): ${peteAnalysis}

Write the final report:

## Summary
[Direct answer to the question in 2-3 sentences. Be opinionated.]

## Top Picks
| Rank | Ticker | Price | Fundamentals | Technicals | Sentiment | Action |
|------|--------|-------|-------------|-----------|-----------|--------|
| 1 | [best pick] | $X | [brief] | [brief] | [brief] | [buy/watch/avoid] |
| 2 | ... | ... | ... | ... | ... | ... |

## Analysis
[Key insights from combining all three perspectives. Where do the analysts agree? Disagree?]

## Risks
[Top 3 risks to this thesis]

## Action Items
- [Specific action 1 with price levels]
- [Specific action 2]
- [Specific action 3]

## Social Sentiment
[Pete's key findings — mood, narratives, contrarian signals]

Rules:
- Use REAL prices from the data tables
- Be opinionated — rank and recommend
- No disclaimers
- Tables and bullets for readability`,
      }],
      max_tokens: 2500,
    });

    const content = synthesisResponse.choices[0]?.message?.content || '';
    const summary = content.substring(0, 500);
    const reportDate = new Date().toISOString().split('T')[0];

    const slug = `scan-${slugify(query.substring(0, 40))}-${reportDate}-${requestId.substring(0, 6)}`;

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

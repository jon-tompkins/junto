import { getXAI } from '@/lib/synthesis/client';
import { getSupabase } from '@/lib/db/client';

const CREDITS_PER_DEEPDIVE = 5;
const CREDITS_PER_SCAN = 10;

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

function scoutPrompt(ticker: string, companyName: string | null, price: number | null): string {
  return `You are Scout, a market analyst specializing in opportunity identification.

Analyze **${ticker}**${companyName ? ` (${companyName})` : ''}${price ? ` currently trading at $${price}` : ''}.

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

function jebPrompt(ticker: string, companyName: string | null, price: number | null, scoutAnalysis: string): string {
  return `You are Jeb, a fundamental analyst specializing in business quality, moats, and valuation.

Analyze **${ticker}**${companyName ? ` (${companyName})` : ''}${price ? ` at $${price}` : ''}.

Scout's preliminary analysis:
---
${scoutAnalysis}
---

Now dig deeper into fundamentals. Cover:
1. **Business Quality** — Moat width (none/narrow/wide), competitive advantages, switching costs
2. **Financials** — Revenue growth, margins, FCF, debt levels. Use specific numbers.
3. **Valuation** — P/E, P/S, EV/EBITDA vs peers. Is it cheap or expensive and why?
4. **Balance Sheet** — Cash position, debt-to-equity, runway
5. **Management** — Any notable insider activity, CEO track record
6. **Jeb's Verdict** — Fair value estimate and whether current price is attractive

Be quantitative. Use real financial data where available. Write for investors who understand financial statements.
Format as clean markdown with ## headers.`;
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
  return `You are the lead analyst synthesizing research from three specialists into a final Deep Dive report.

**${ticker}**${companyName ? ` — ${companyName}` : ''}${price ? ` | Current Price: $${price}` : ''}

## Scout's Analysis (Opportunity):
${scoutAnalysis}

## Jeb's Analysis (Fundamentals):
${jebAnalysis}

## Ant's Analysis (Technicals):
${antAnalysis}

Synthesize into a cohesive Deep Dive report with this structure:

# ${ticker} Deep Dive${companyName ? ` - ${companyName}` : ''}

## Executive Summary
[2-3 sentence verdict combining all three analysts. Include the consensus rating.]

## Company Overview
[From Scout's analysis — what they do, why interesting now]

${chartUrl ? `## Price Action\n![${ticker} Chart](${chartUrl})\n` : ''}
## Technical Analysis
[From Ant — trend, key levels, Wyckoff phase, entry zones]

## Fundamental Analysis
[From Jeb — business quality, financials, valuation]

## Bull Case
[Combined bull arguments, ranked by conviction]

## Bear Case
[Combined bear arguments, ranked by risk]

## The Verdict
**Rating:** [Consensus of Scout, Jeb, Ant]
**Fair Value:** [Jeb's estimate]
**Entry Strategy:** [Ant's timing + levels]
**Risk/Reward:** [Brief assessment]

Write the final report in clean markdown. Be direct and opinionated. Every claim should be specific.
Do NOT include disclaimers or "not financial advice" text — that's handled by the platform.`;
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
      messages: [{ role: 'user', content: scoutPrompt(ticker, companyName, currentPrice) }],
      max_tokens: 1500,
    });
    const scoutAnalysis = scoutResponse.choices[0]?.message?.content || '';

    // 4. Run Jeb (needs Scout context)
    console.log(`[research] Jeb analyzing ${ticker}...`);
    const jebResponse = await xai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{ role: 'user', content: jebPrompt(ticker, companyName, currentPrice, scoutAnalysis) }],
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

    const response = await xai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{
        role: 'user',
        content: `You are a market research analyst. Answer this investment research question thoroughly and directly:

"${query}"

Structure your response as a research report with:
1. **Summary** — Direct answer to the question
2. **Analysis** — Supporting evidence, data, reasoning
3. **Specific Names** — Ticker symbols, companies, or assets that answer the question
4. **Risks** — What could go wrong with this thesis
5. **Action Items** — What to buy/sell/watch, with specific entry levels if applicable

Be opinionated and specific. Use real data. Write for experienced investors.
Format as clean markdown.`,
      }],
      max_tokens: 2500,
    });

    const content = response.choices[0]?.message?.content || '';
    const summary = content.substring(0, 500);
    const reportDate = new Date().toISOString().split('T')[0];

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

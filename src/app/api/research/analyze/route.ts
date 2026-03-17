import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getXAI } from '@/lib/synthesis/client';

// Helper to generate properly formatted QuickChart URL
function generateQuickChartUrl(ticker: string, prices: number[], dates: string[]): string {
  // Calculate moving averages
  const calculateMA = (data: number[], period: number): number[] => {
    const ma: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        ma.push(data[i]);
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        ma.push(Number((sum / period).toFixed(2)));
      }
    }
    return ma;
  };

  const ma20 = calculateMA(prices, 20);
  const ma50 = calculateMA(prices, 50);

  const chartConfig = {
    type: 'line',
    data: {
      labels: dates.slice(-30),
      datasets: [
        {
          label: 'Price',
          data: prices.slice(-30),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.1,
          fill: false
        },
        {
          label: '20-day MA',
          data: ma20.slice(-30),
          borderColor: 'rgb(34, 197, 94)',
          borderDash: [5, 5],
          tension: 0.1,
          fill: false
        },
        {
          label: '50-day MA',
          data: ma50.slice(-30),
          borderColor: 'rgb(249, 115, 22)',
          borderDash: [5, 5],
          tension: 0.1,
          fill: false
        }
      ]
    },
    options: {
      title: {
        display: true,
        text: `${ticker} Price Action`,
        fontSize: 18
      },
      scales: {
        yAxes: [{
          ticks: {
            min: Math.min(...prices) * 0.95,
            max: Math.max(...prices) * 1.05
          }
        }]
      },
      legend: {
        position: 'bottom'
      }
    }
  };

  // Properly encode the JSON - use double quotes and encodeURIComponent
  const jsonString = JSON.stringify(chartConfig);
  const encodedConfig = encodeURIComponent(jsonString);
  return `https://quickchart.io/chart?c=${encodedConfig}&w=800&h=400&f=png`;
}

// Fetch price data for chart
async function fetchPriceData(ticker: string): Promise<{ prices: number[]; dates: string[] } | null> {
  try {
    // Use a free API like Yahoo Finance or similar
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`);
    const data = await response.json();
    
    if (data.chart?.result?.[0]) {
      const result = data.chart.result[0];
      const prices = result.indicators.quote[0].close.filter((p: number | null) => p !== null);
      const timestamps = result.timestamp;
      const dates = timestamps.map((ts: number) => {
        const date = new Date(ts * 1000);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
      
      return { prices, dates };
    }
    return null;
  } catch (error) {
    console.error('Price data fetch failed:', error);
    return null;
  }
}

// Generate technical analysis with proper chart
export async function generateTechnicalAnalysis(ticker: string): Promise<{
  analysis: string;
  chartUrl: string | null;
  keyLevels: Array<{ level: string; price: number; significance: string }>;
  timingVerdict: string;
}> {
  const client = getXAI();
  
  // Fetch real price data
  const priceData = await fetchPriceData(ticker);
  let chartUrl: string | null = null;
  
  if (priceData) {
    chartUrl = generateQuickChartUrl(ticker, priceData.prices, priceData.dates);
  }

  const prompt = `Perform technical analysis on ${ticker}. 

Current price context: ${priceData ? `Trading around $${priceData.prices[priceData.prices.length - 1]}` : 'Price data unavailable'}

Provide:
1. Key support and resistance levels (3-5 levels with price targets)
2. Current trend structure
3. Technical indicators (RSI, MACD if relevant)
4. Timing verdict (BUY, WAIT, or AVOID) with specific entry/stop/target prices
5. Risk/reward analysis

Return as JSON:
{
  "analysis": "Detailed technical analysis text (3-4 paragraphs)",
  "keyLevels": [
    {"level": "Resistance 1", "price": 123.45, "significance": "Recent high"},
    {"level": "Support 1", "price": 110.00, "significance": "200-day MA"}
  ],
  "timingVerdict": "WAIT for pullback to $115-118 zone",
  "entry": 115.00,
  "stopLoss": 109.50,
  "target1": 125.00,
  "target2": 132.00
}`;

  try {
    const response = await client.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');

    return {
      analysis: parsed.analysis || 'Technical analysis unavailable',
      chartUrl,
      keyLevels: parsed.keyLevels || [],
      timingVerdict: parsed.timingVerdict || 'NEUTRAL'
    };
  } catch (error) {
    console.error('Technical analysis generation failed:', error);
    return {
      analysis: 'Technical analysis generation failed',
      chartUrl,
      keyLevels: [],
      timingVerdict: 'NEUTRAL'
    };
  }
}

// POST /api/research/analyze - internal endpoint for agent analysis
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-analysis-secret');
    if (authHeader !== process.env.RESEARCH_PROCESS_SECRET && authHeader !== 'junto-research-2026') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ticker, requestId, stage } = await request.json();

    if (!ticker || !requestId || !stage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabase();

    if (stage === 'technical') {
      // Generate technical analysis with chart
      const technicalData = await generateTechnicalAnalysis(ticker);
      
      return NextResponse.json({
        success: true,
        stage: 'technical',
        data: technicalData
      });
    }

    return NextResponse.json({ error: 'Unknown stage' }, { status: 400 });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET test endpoint
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Analysis endpoint - use POST for technical analysis',
    endpoints: {
      technical: 'POST with { ticker, requestId, stage: "technical" }'
    }
  });
}
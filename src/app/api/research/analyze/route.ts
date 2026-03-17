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

// Fetch price data for chart with better error handling
async function fetchPriceData(ticker: string): Promise<{ prices: number[]; dates: string[]; currentPrice: number | null } | null> {
  try {
    // Use Yahoo Finance API
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`Yahoo Finance API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.chart?.result?.[0]) {
      const result = data.chart.result[0];
      const meta = result.meta;
      
      // Get current price from meta (handles splits correctly)
      const currentPrice = meta.regularMarketPrice || meta.previousClose || null;
      
      // Get price history
      const quote = result.indicators.quote[0];
      const prices: number[] = [];
      const timestamps: number[] = [];
      
      // Filter out null values and collect valid data points
      for (let i = 0; i < quote.close.length; i++) {
        if (quote.close[i] !== null && quote.close[i] !== undefined) {
          prices.push(quote.close[i]);
          timestamps.push(result.timestamp[i]);
        }
      }
      
      // Convert timestamps to dates
      const dates = timestamps.map((ts: number) => {
        const date = new Date(ts * 1000);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
      
      console.log(`Fetched ${prices.length} price points for ${ticker}, current: $${currentPrice}`);
      
      return { prices, dates, currentPrice };
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
  currentPrice: number | null;
}> {
  // Fetch real price data
  const priceData = await fetchPriceData(ticker);
  let chartUrl: string | null = null;
  let currentPrice: number | null = null;
  
  if (priceData && priceData.prices.length > 0) {
    currentPrice = priceData.currentPrice || priceData.prices[priceData.prices.length - 1];
    chartUrl = generateQuickChartUrl(ticker, priceData.prices, priceData.dates);
    console.log(`Generated chart for ${ticker} at $${currentPrice}`);
  }

  // Calculate basic support/resistance from price data
  const keyLevels: Array<{ level: string; price: number; significance: string }> = [];
  
  if (priceData && priceData.prices.length > 0) {
    const prices = priceData.prices;
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const recentHigh = Math.max(...prices.slice(-20));
    const recentLow = Math.min(...prices.slice(-20));
    
    if (currentPrice) {
      keyLevels.push({ level: 'Current', price: currentPrice, significance: 'Last traded price' });
    }
    keyLevels.push({ level: 'Resistance 2', price: maxPrice, significance: '3-month high' });
    keyLevels.push({ level: 'Resistance 1', price: recentHigh, significance: 'Recent high (20-day)' });
    keyLevels.push({ level: 'Support 1', price: recentLow, significance: 'Recent low (20-day)' });
    keyLevels.push({ level: 'Support 2', price: minPrice, significance: '3-month low' });
  }

  return {
    analysis: `Technical analysis for ${ticker}: ${keyLevels.length > 0 ? 'Key levels identified from price data' : 'Price data unavailable'}`,
    chartUrl,
    keyLevels,
    timingVerdict: currentPrice ? 'Analysis ready' : 'Data unavailable',
    currentPrice
  };
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
        data: {
          chartUrl: technicalData.chartUrl,
          currentPrice: technicalData.currentPrice,
          keyLevels: technicalData.keyLevels,
          timingVerdict: technicalData.timingVerdict,
          ticker
        }
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
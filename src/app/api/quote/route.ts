import { NextRequest, NextResponse } from 'next/server';

// GET /api/quote?symbol=AAPL - validate ticker and get basic info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase().trim();

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    // Validate ticker format
    if (!/^[A-Z]{1,10}$/.test(symbol)) {
      return NextResponse.json({ 
        valid: false,
        error: 'Invalid ticker format' 
      }, { status: 400 });
    }

    // Use Yahoo Finance API to validate ticker
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    
    const response = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JuntoBot/1.0)',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ 
        valid: false,
        symbol,
        error: 'Ticker not found. Please check the symbol.'
      });
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (!result || data?.chart?.error) {
      return NextResponse.json({ 
        valid: false,
        symbol,
        error: 'Ticker not found. Please check the symbol.'
      });
    }

    // Extract basic info
    const meta = result.meta || {};
    const price = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const change = price && previousClose ? price - previousClose : null;
    const changePercent = change && previousClose ? (change / previousClose) * 100 : null;

    return NextResponse.json({
      valid: true,
      symbol: meta.symbol || symbol,
      name: meta.shortName || meta.longName || symbol,
      price: price ? parseFloat(price.toFixed(2)) : null,
      change: change ? parseFloat(change.toFixed(2)) : null,
      changePercent: changePercent ? parseFloat(changePercent.toFixed(2)) : null,
      currency: meta.currency || 'USD',
      exchange: meta.exchangeName || meta.exchange,
    });

  } catch (error) {
    console.error('Quote API error:', error);
    return NextResponse.json({ 
      valid: false,
      error: 'Failed to validate ticker'
    }, { status: 500 });
  }
}

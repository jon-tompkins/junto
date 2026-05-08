import { NextRequest, NextResponse } from 'next/server';
import { fetchCurrentPrice } from '@/lib/prices';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();
  const price = await fetchCurrentPrice(ticker);
  if (price == null) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ticker, price });
}

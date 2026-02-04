import { NextRequest, NextResponse } from 'next/server';
import { ingestNewslettersFromGmail, IngestResult } from '@/lib/email/gmail-ingest';

// POST /api/newsletters/ingest - Fetch and store newsletters from Gmail
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const daysBack = body.daysBack || 7;
    const limit = body.limit || 50;
    
    console.log(`Starting newsletter ingestion: last ${daysBack} days, limit ${limit}`);
    
    const result: IngestResult = await ingestNewslettersFromGmail(daysBack, limit);
    
    return NextResponse.json({
      success: result.errors.length === 0,
      ...result,
      summary: `Processed ${result.processed}, stored ${result.stored}, skipped ${result.skipped}`,
    });
    
  } catch (error) {
    console.error('Newsletter ingestion error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// GET /api/newsletters/ingest - Check ingestion status/config
export async function GET() {
  const configured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  
  return NextResponse.json({
    configured,
    gmail_user: process.env.GMAIL_USER ? `${process.env.GMAIL_USER.slice(0, 3)}***` : null,
    message: configured 
      ? 'Gmail ingestion is configured. POST to this endpoint to fetch newsletters.'
      : 'Gmail credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.',
  });
}
// Trigger redeploy Wed Feb  4 18:29:05 UTC 2026

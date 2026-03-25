import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { markdownToHtml } from '@/lib/utils/markdown';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/jon-tompkins/Agent-Reports/main';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    // 1. Try Supabase first (new reports) — match by UUID or slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let dbReport;
    if (isUUID) {
      const { data } = await supabase
        .from('research_reports')
        .select('*')
        .eq('id', id)
        .single();
      dbReport = data;
    }

    if (!dbReport) {
      const { data } = await supabase
        .from('research_reports')
        .select('*')
        .eq('slug', id)
        .single();
      dbReport = data;
    }

    if (dbReport) {
      if (dbReport.visibility !== 'public') {
        return NextResponse.json({ error: 'Report not available' }, { status: 403 });
      }

      return NextResponse.json({
        id: dbReport.id,
        title: dbReport.title,
        ticker: dbReport.ticker,
        summary: dbReport.summary,
        rating: dbReport.rating,
        type: dbReport.type,
        visibility: dbReport.visibility,
        date: dbReport.date,
        tags: dbReport.tags || [],
        content: markdownToHtml(dbReport.content),
      });
    }

    // 2. Fall back to GitHub (legacy reports)
    const indexRes = await fetch(`${GITHUB_RAW_BASE}/reports/index.json`, {
      next: { revalidate: 300 }
    });

    if (!indexRes.ok) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const indexData = await indexRes.json();
    const report = indexData.reports.find((r: any) => r.id === id);

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    if (report.visibility !== 'public') {
      return NextResponse.json({ error: 'Report not available' }, { status: 403 });
    }

    const contentRes = await fetch(`${GITHUB_RAW_BASE}/${report.path || report.file}`, {
      next: { revalidate: 300 }
    });

    if (!contentRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch report content' }, { status: 500 });
    }

    const markdown = await contentRes.text();
    const content = markdownToHtml(markdown);

    return NextResponse.json({
      ...report,
      content
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
  }
}

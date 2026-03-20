import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

const GITHUB_RAW = 'https://raw.githubusercontent.com/jon-tompkins/Agent-Reports/main/reports';

export async function GET() {
  try {
    const supabase = getSupabase();
    const reports: any[] = [];

    // 1. Fetch from Supabase (new reports)
    const { data: dbReports } = await supabase
      .from('research_reports')
      .select('id, title, ticker, summary, rating, type, visibility, date, tags, requested_by')
      .eq('visibility', 'public')
      .order('date', { ascending: false });

    if (dbReports) {
      reports.push(
        ...dbReports.map((r) => ({
          id: r.id,
          title: r.title,
          ticker: r.ticker,
          summary: r.summary,
          rating: r.rating,
          type: r.type,
          category: r.type,
          visibility: r.visibility,
          date: r.date,
          tags: r.tags || [],
          requested_by: null, // Don't expose user ID
          source: 'db',
        })),
      );
    }

    // 2. Fetch legacy reports from GitHub
    try {
      const cacheBuster = Date.now();
      const res = await fetch(`${GITHUB_RAW}/index.json?t=${cacheBuster}`, {
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.reports) {
          reports.push(
            ...data.reports.map((r: any) => ({
              ...r,
              source: 'github',
            })),
          );
        }
      }
    } catch {
      // GitHub fetch failed — continue with DB reports only
      console.warn('[research] GitHub index fetch failed, serving DB reports only');
    }

    // Sort all by date descending
    reports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

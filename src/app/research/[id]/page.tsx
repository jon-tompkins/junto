import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { getSupabase } from '@/lib/db/client';
import { markdownToHtml } from '@/lib/utils/markdown';
import { TopNav } from '@/components/top-nav';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/jon-tompkins/Agent-Reports/main';

interface Report {
  id: string;
  title: string;
  ticker?: string;
  date: string;
  type?: string;
  category?: string;
  rating?: string;
  visibility: string;
  summary?: string;
  description?: string;
  file?: string;
  path?: string;
  tags?: string[];
  content?: string;
}

// Extract ticker from title like "PTON (Company Name) Deep Dive"
function extractTicker(title: string): string {
  const match = title.match(/^([A-Z]{1,5})\s/);
  return match ? match[1] : '';
}

// Extract rating from summary text
function extractRating(summary: string): string {
  const match = summary.match(/Rating:\s*([^.]+)/i);
  return match ? match[1].trim() : '';
}

function getRatingColor(rating: string | undefined | null) {
  if (!rating) return 'text-slate-400';
  if (rating.includes('BUY') || rating.includes('BULLISH')) return 'text-green-400';
  if (rating.includes('AVOID') || rating.includes('SHORT') || rating.includes('BEARISH') || rating.includes('SELL')) return 'text-red-400';
  if (rating.includes('SPECULATIVE') || rating.includes('HOLD')) return 'text-yellow-400';
  return 'text-slate-400';
}

async function getReport(id: string): Promise<Report | null> {
  const supabase = getSupabase();

  // 1. Try Supabase first (new reports)
  const { data: dbReport } = await supabase
    .from('research_reports')
    .select('*')
    .eq('id', id)
    .single();

  if (dbReport) {
    if (dbReport.visibility !== 'public') return null;

    return {
      id: dbReport.id,
      title: dbReport.title,
      ticker: dbReport.ticker || extractTicker(dbReport.title),
      summary: dbReport.summary || dbReport.description || '',
      rating: dbReport.rating || extractRating(dbReport.summary || ''),
      type: dbReport.type || dbReport.category || 'research',
      visibility: dbReport.visibility,
      date: dbReport.date,
      tags: dbReport.tags || [],
      content: markdownToHtml(dbReport.content),
    };
  }

  // 2. Fall back to GitHub (legacy reports)
  try {
    const indexRes = await fetch(`${GITHUB_RAW_BASE}/reports/index.json`, {
      next: { revalidate: 300 },
    });

    if (!indexRes.ok) return null;

    const indexData = await indexRes.json();
    const report = indexData.reports.find((r: any) => r.id === id);

    if (!report || report.visibility !== 'public') return null;

    const contentRes = await fetch(`${GITHUB_RAW_BASE}/${report.path || report.file}`, {
      next: { revalidate: 300 },
    });

    if (!contentRes.ok) return null;

    const markdown = await contentRes.text();

    return {
      ...report,
      ticker: report.ticker || extractTicker(report.title),
      rating: report.rating || extractRating(report.summary || ''),
      type: report.type || report.category || 'research',
      summary: report.summary || report.description || '',
      tags: report.tags || [],
      content: markdownToHtml(markdown),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const report = await getReport(id);

  if (!report) {
    return {
      title: 'Report Not Found | MyJunto Research',
    };
  }

  const description = report.summary
    ? report.summary.length > 160
      ? report.summary.slice(0, 157) + '...'
      : report.summary
    : 'Research report on MyJunto';

  return {
    title: `${report.title} | MyJunto Research`,
    description,
    keywords: report.tags,
    openGraph: {
      title: `${report.title} | MyJunto Research`,
      description,
      type: 'article',
    },
  };
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await getReport(id);

  if (!report) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            {report.ticker && (
              <span className="text-xs text-slate-500 uppercase tracking-wide bg-slate-700/50 px-2 py-1 rounded">
                {report.ticker}
              </span>
            )}
            {report.rating && (
              <span className={`text-sm font-medium ${getRatingColor(report.rating)}`}>
                {report.rating}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold mb-2">{report.title}</h1>
          {report.summary && <p className="text-slate-400">{report.summary}</p>}
          <div className="flex items-center gap-4 mt-4 text-sm text-slate-500">
            <span>{report.date}</span>
            {report.type && (
              <>
                <span>&bull;</span>
                <span>{report.type}</span>
              </>
            )}
          </div>
        </div>

        {/* Tags */}
        {report.tags && report.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {report.tags.map(tag => (
              <span
                key={tag}
                className="px-3 py-1 bg-slate-700/50 rounded-full text-xs text-slate-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <article className="prose prose-invert prose-slate max-w-none">
          <div
            className="research-content"
            dangerouslySetInnerHTML={{ __html: report.content || '' }}
          />
        </article>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-slate-700/40 text-slate-500 text-sm">
          <p className="mb-4">
            <strong>Disclaimer:</strong> This report is for informational purposes only and does not constitute investment advice.
            Always do your own research before making investment decisions.
          </p>
          <Link href="/research" className="text-white hover:underline">
            &larr; View all research
          </Link>
        </div>
      </div>

      <style jsx global>{`
        .research-content h1 { font-size: 1.75rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; }
        .research-content h2 { font-size: 1.5rem; font-weight: 600; margin-top: 1.75rem; margin-bottom: 0.75rem; }
        .research-content h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; }
        .research-content p { margin-bottom: 1rem; line-height: 1.7; color: #a3a3a3; }
        .research-content ul, .research-content ol { margin-bottom: 1rem; padding-left: 1.5rem; color: #a3a3a3; }
        .research-content li { margin-bottom: 0.5rem; }
        .research-content table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        .research-content th, .research-content td { border: 1px solid #334155; padding: 0.5rem; text-align: left; }
        .research-content th { background: #1e293b; }
        .research-content strong { color: #fff; }
        .research-content hr { border-color: #334155; margin: 2rem 0; }
        .research-content code { background: #1e293b; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.875rem; }
        .research-content pre { background: #0f172a; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
        .research-content .chart-img { max-width: 75%; height: auto; border-radius: 0.5rem; border: 1px solid #334155; margin: 1rem auto; display: block; }
        @media (max-width: 768px) { .research-content .chart-img { max-width: 100%; } }
      `}</style>
    </main>
  );
}

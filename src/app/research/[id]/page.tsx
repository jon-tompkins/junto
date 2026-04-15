import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { getSupabase } from '@/lib/db/client';
import { markdownToHtml } from '@/lib/utils/markdown';
import { TopNav } from '@/components/top-nav';
import { PrintButton } from './print-button';

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

  const formattedDate = (() => {
    try {
      return new Date(report.date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch {
      return report.date;
    }
  })();

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white print:bg-white print:text-black">
      <div className="print:hidden">
        <TopNav />
      </div>

      {/* Print CSS — scoped to this page */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: Letter; margin: 0.5in; }
          body { background: white !important; color: black !important; }
          .research-content { color: black !important; }
          .research-content h1, .research-content h2, .research-content h3,
          .research-content h4, .research-content strong { color: black !important; }
          .research-content a { color: #1e40af !important; text-decoration: underline; }
          .research-content table { border-collapse: collapse; width: 100%; break-inside: avoid; page-break-inside: avoid; margin: 12px 0; }
          .research-content th, .research-content td { border: 1px solid #94a3b8; padding: 6px 10px; text-align: left; font-size: 11px; }
          .research-content th { background: #f1f5f9; font-weight: 600; }
          .research-content img { max-width: 100%; break-inside: avoid; page-break-inside: avoid; margin: 12px 0; }
          .research-content h2 { break-after: avoid; page-break-after: avoid; margin-top: 20px; border-top: 1px solid #cbd5e1; padding-top: 12px; }
          .research-content h3 { break-after: avoid; page-break-after: avoid; }
          .myjunto-brand-header { border-bottom: 2px solid #0f172a !important; color: black !important; }
          .myjunto-brand-footer { border-top: 2px solid #0f172a !important; color: #475569 !important; }
          .report-tags, .print\\:hidden { display: none !important; }
        }
      ` }} />

      <div className="max-w-4xl mx-auto px-6 py-12 print:py-0 print:px-0 print:max-w-none">

        {/* MyJunto Brand Header */}
        <div className="myjunto-brand-header flex items-center justify-between pb-4 mb-6 border-b border-slate-700/60 print:border-slate-900">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-light text-slate-400 print:text-slate-600">my</span>
            <span className="text-xl font-bold text-white print:text-black">junto</span>
            <span className="ml-3 text-xs uppercase tracking-widest text-slate-500 print:text-slate-600">Equity Research</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 print:text-slate-600">{formattedDate}</span>
            <PrintButton />
          </div>
        </div>

        {/* Title Block */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            {report.ticker && (
              <span className="text-sm font-mono font-bold uppercase tracking-wide bg-slate-800 text-white print:bg-slate-900 print:text-white px-3 py-1 rounded">
                ${report.ticker}
              </span>
            )}
            {report.rating && (
              <span className={`text-sm font-semibold ${getRatingColor(report.rating)} print:!text-black print:border print:border-slate-900 print:px-2 print:py-0.5 print:rounded`}>
                {report.rating}
              </span>
            )}
            {report.type && (
              <span className="text-xs uppercase tracking-wide text-slate-500 print:text-slate-600">
                {report.type}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold mb-2 print:text-black">{report.title}</h1>
          {report.summary && (
            <p className="text-slate-400 print:text-slate-700">{report.summary}</p>
          )}
        </div>

        {/* Tags */}
        {report.tags && report.tags.length > 0 && (
          <div className="report-tags flex flex-wrap gap-2 mb-8">
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
        <article className="prose prose-invert prose-slate max-w-none print:prose-slate">
          <div
            className="research-content"
            dangerouslySetInnerHTML={{ __html: report.content || '' }}
          />
        </article>

        {/* MyJunto Brand Footer */}
        <div className="myjunto-brand-footer mt-16 pt-6 border-t border-slate-700/40 print:border-slate-900 text-slate-500 print:text-slate-600 text-xs">
          <div className="flex items-baseline justify-between mb-3">
            <div className="flex items-baseline gap-1">
              <span className="font-light">my</span>
              <span className="font-bold text-slate-400 print:text-slate-800">junto</span>
              <span className="ml-2 text-slate-600 print:text-slate-600">· myjunto.xyz</span>
            </div>
            <span>Generated {formattedDate}</span>
          </div>
          <p className="mb-4 leading-relaxed">
            <strong>Disclaimer:</strong> This report is for informational purposes only and does not constitute investment advice,
            a recommendation, or a solicitation to buy or sell any security. All investments carry risk including loss of principal.
            Past performance is not indicative of future results. Do your own research before making any investment decision.
          </p>
          <div className="print:hidden">
            <Link href="/research" className="text-white hover:underline">
              &larr; View all research
            </Link>
          </div>
        </div>
      </div>

    </main>
  );
}

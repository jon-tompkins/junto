'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Report {
  id: string;
  title: string;
  ticker: string;
  date: string;
  type: string;
  rating: string;
  visibility: string;
  summary: string;
  file: string;
  tags: string[];
  content?: string;
}

export default function ReportPage() {
  const params = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchReport(params.id as string);
    }
  }, [params.id]);

  const fetchReport = async (id: string) => {
    try {
      const res = await fetch(`/api/research/${id}`);
      if (!res.ok) {
        throw new Error('Report not found');
      }
      const data = await res.json();
      if (data.visibility !== 'public') {
        throw new Error('Report not available');
      }
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const getRatingColor = (rating: string) => {
    if (rating.includes('BUY') || rating.includes('BULLISH')) return 'text-green-400';
    if (rating.includes('AVOID') || rating.includes('SHORT') || rating.includes('BEARISH')) return 'text-red-400';
    if (rating.includes('SPECULATIVE')) return 'text-yellow-400';
    return 'text-neutral-400';
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neutral-400">Loading report...</div>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <div className="text-neutral-400 mb-4">{error || 'Report not found'}</div>
        <Link href="/research" className="text-white hover:underline">
          ← Back to Research
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Back Link */}
        <Link href="/research" className="text-neutral-500 hover:text-white text-sm mb-8 inline-block">
          ← Back to Research
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-neutral-500 uppercase tracking-wide bg-neutral-800 px-2 py-1 rounded">
              {report.ticker}
            </span>
            <span className={`text-sm font-medium ${getRatingColor(report.rating)}`}>
              {report.rating}
            </span>
          </div>
          <h1 className="text-3xl font-bold mb-2">{report.title}</h1>
          <p className="text-neutral-400">{report.summary}</p>
          <div className="flex items-center gap-4 mt-4 text-sm text-neutral-500">
            <span>{report.date}</span>
            <span>•</span>
            <span>{report.type}</span>
          </div>
        </div>

        {/* Tags */}
        <div className="flex gap-2 mb-8">
          {report.tags.map(tag => (
            <span 
              key={tag}
              className="px-3 py-1 bg-neutral-800 rounded-full text-xs text-neutral-400"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Content */}
        <article className="prose prose-invert prose-neutral max-w-none">
          <div 
            className="research-content"
            dangerouslySetInnerHTML={{ __html: report.content || '' }}
          />
        </article>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-neutral-800 text-neutral-500 text-sm">
          <p className="mb-4">
            <strong>Disclaimer:</strong> This report is for informational purposes only and does not constitute investment advice. 
            Always do your own research before making investment decisions.
          </p>
          <Link href="/research" className="text-white hover:underline">
            ← View all research
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
        .research-content th, .research-content td { border: 1px solid #404040; padding: 0.5rem; text-align: left; }
        .research-content th { background: #262626; }
        .research-content strong { color: #fff; }
        .research-content hr { border-color: #404040; margin: 2rem 0; }
        .research-content code { background: #262626; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.875rem; }
        .research-content pre { background: #171717; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
      `}</style>
    </main>
  );
}

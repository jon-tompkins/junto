'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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
}

export default function ResearchPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/research');
      const data = await res.json();
      // Only show public reports
      const publicReports = data.reports.filter((r: Report) => r.visibility === 'public');
      setReports(publicReports);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
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

  const filteredReports = filter === 'all' 
    ? reports 
    : reports.filter(r => r.tags.includes(filter));

  const allTags = [...new Set(reports.flatMap(r => r.tags))].sort();

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neutral-400">Loading research...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-neutral-500 hover:text-white text-sm mb-4 inline-block">
            ← MyJunto
          </Link>
          <h1 className="text-3xl font-bold mb-2">Junto Research</h1>
          <p className="text-neutral-400">Investment research and analysis</p>
        </div>

        {/* Filter Tags */}
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full text-sm ${
              filter === 'all' 
                ? 'bg-white text-black' 
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setFilter(tag)}
              className={`px-3 py-1 rounded-full text-sm ${
                filter === tag 
                  ? 'bg-white text-black' 
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Reports Grid */}
        <div className="space-y-4">
          {filteredReports.map(report => (
            <Link
              key={report.id}
              href={`/research/${report.id}`}
              className="block p-6 bg-neutral-900 rounded-lg border border-neutral-800 hover:border-neutral-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">
                    {report.ticker}
                  </span>
                  <h2 className="text-xl font-semibold mt-1">{report.title}</h2>
                </div>
                <span className={`text-sm font-medium ${getRatingColor(report.rating)}`}>
                  {report.rating}
                </span>
              </div>
              
              <p className="text-neutral-400 text-sm mb-3">{report.summary}</p>
              
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {report.tags.slice(0, 3).map(tag => (
                    <span 
                      key={tag}
                      className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-neutral-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-neutral-500">{report.date}</span>
              </div>
            </Link>
          ))}
        </div>

        {filteredReports.length === 0 && (
          <div className="text-center py-12 text-neutral-500">
            No reports found
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-neutral-800 text-center text-neutral-500 text-sm">
          <p>Reports are for informational purposes only. Not investment advice.</p>
        </div>
      </div>
    </main>
  );
}

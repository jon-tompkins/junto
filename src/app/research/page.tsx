'use client';

import { useState, useEffect, useMemo } from 'react';
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
  const [search, setSearch] = useState('');

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

  // Dynamic search across ticker, title, summary, and tags
  const filteredReports = useMemo(() => {
    if (!search.trim()) return reports;
    
    const query = search.toLowerCase();
    return reports.filter(r => 
      r.ticker.toLowerCase().includes(query) ||
      r.title.toLowerCase().includes(query) ||
      r.summary.toLowerCase().includes(query) ||
      r.tags.some(tag => tag.toLowerCase().includes(query)) ||
      r.rating.toLowerCase().includes(query) ||
      r.type.toLowerCase().includes(query)
    );
  }, [reports, search]);

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
        <div className="mb-8">
          <Link href="/" className="text-neutral-500 hover:text-white text-sm mb-4 inline-block">
            ← MyJunto
          </Link>
          <h1 className="text-3xl font-bold mb-2">Junto Research</h1>
          <p className="text-neutral-400">Investment research and analysis</p>
        </div>

        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ticker, topic, or keyword..."
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 pl-10 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 transition-colors"
            />
            <svg 
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-neutral-500"
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {search && (
            <div className="mt-2 text-sm text-neutral-500">
              {filteredReports.length} result{filteredReports.length !== 1 ? 's' : ''} for "{search}"
            </div>
          )}
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
            {search ? `No reports matching "${search}"` : 'No reports found'}
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

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

interface Report {
  id: string;
  title: string;
  ticker?: string;
  date: string;
  type?: string;
  category?: string;
  rating?: string;
  visibility: string;
  summary: string;
  description?: string;
  file?: string;
  path?: string;
  tags?: string[];
  requested_by?: string;
}

interface ResearchRequest {
  id: string;
  ticker: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  report_id?: string;
  requested_by?: string;
}

const researchTeam = [
  {
    name: 'Scout',
    role: 'Deep Dive Analyst',
    avatar: '🔍',
    description: 'Comprehensive fundamental analysis and valuation'
  },
  {
    name: 'Quant',
    role: 'Technical Analysis',
    avatar: '📊',
    description: 'Chart patterns, momentum, and statistical analysis'
  },
  {
    name: 'Macro',
    role: 'Market Context',
    avatar: '🌍',
    description: 'Sector trends, macro factors, and positioning'
  }
];

export default function ResearchPage() {
  const { data: session } = useSession();
  const [reports, setReports] = useState<Report[]>([]);
  const [requests, setRequests] = useState<ResearchRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'deep-dive' | 'scan'>('all');
  const [credits, setCredits] = useState<number | null>(null);
  const [tickerInput, setTickerInput] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');

  useEffect(() => {
    fetchReports();
    fetchRequests();
    if (session) {
      fetchCredits();
    }
  }, [session]);

  const extractTicker = (title: string): string => {
    const match = title.match(/^([A-Z]{1,5})\s/);
    return match ? match[1] : '';
  };

  const extractRating = (summary: string): string => {
    const match = summary.match(/Rating:\s*([^.]+)/i);
    return match ? match[1].trim() : '';
  };

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/research');
      const data = await res.json();
      const publicReports = data.reports
        .filter((r: Report) => r.visibility === 'public')
        .map((r: Report) => ({
          ...r,
          ticker: r.ticker || extractTicker(r.title),
          rating: r.rating || extractRating(r.summary || ''),
          type: r.type || r.category || 'research',
        }));
      setReports(publicReports);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await fetch('/api/research/requests?all=true&limit=50');
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    }
  };

  const fetchCredits = async () => {
    try {
      const res = await fetch('/api/user/credits');
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits);
      }
    } catch (err) {
      console.error('Failed to fetch credits:', err);
    }
  };

  const handleRequestDeepDive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput.trim()) return;

    setRequesting(true);
    setRequestError('');
    setRequestSuccess('');

    try {
      const res = await fetch('/api/research/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: tickerInput.trim().toUpperCase() })
      });

      const data = await res.json();

      if (!res.ok) {
        setRequestError(data.error || 'Failed to create request');
        return;
      }

      setRequestSuccess(`Deep dive requested for ${data.request.ticker}! We'll notify you when it's ready.`);
      setTickerInput('');
      setCredits(data.creditsRemaining);
      fetchRequests();
    } catch (err) {
      setRequestError('Something went wrong. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const getRatingColor = (rating: string | undefined | null) => {
    if (!rating) return 'text-neutral-400';
    if (rating.includes('BUY') || rating.includes('BULLISH')) return 'text-green-400';
    if (rating.includes('AVOID') || rating.includes('SHORT') || rating.includes('BEARISH') || rating.includes('SELL')) return 'text-red-400';
    if (rating.includes('SPECULATIVE') || rating.includes('HOLD')) return 'text-yellow-400';
    return 'text-neutral-400';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded text-xs">Queued</span>;
      case 'processing':
        return <span className="px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs">In Progress</span>;
      case 'completed':
        return <span className="px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-xs">Complete</span>;
      case 'failed':
        return <span className="px-2 py-0.5 bg-red-900/50 text-red-400 rounded text-xs">Failed</span>;
      default:
        return null;
    }
  };

  const filteredReports = useMemo(() => {
    let filtered = reports;
    
    // Filter by type
    if (typeFilter !== 'all') {
      filtered = filtered.filter(r => r.type === typeFilter);
    }
    
    // Filter by search
    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(r => 
        (r.ticker && r.ticker.toLowerCase().includes(query)) ||
        (r.title && r.title.toLowerCase().includes(query)) ||
        (r.summary && r.summary.toLowerCase().includes(query)) ||
        (r.tags && r.tags.some(tag => tag.toLowerCase().includes(query))) ||
        (r.rating && r.rating.toLowerCase().includes(query)) ||
        (r.type && r.type.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [reports, search, typeFilter]);

  const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'processing');

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
          <p className="text-neutral-400">Investment research and analysis powered by AI</p>
        </div>

        {/* Research Team */}
        <div className="mb-8 p-6 bg-neutral-900 rounded-lg border border-neutral-800">
          <h2 className="text-lg font-semibold mb-4">Research Team</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {researchTeam.map(member => (
              <div key={member.name} className="flex items-start gap-3">
                <div className="text-2xl">{member.avatar}</div>
                <div>
                  <div className="font-medium">{member.name}</div>
                  <div className="text-xs text-neutral-500">{member.role}</div>
                  <div className="text-xs text-neutral-400 mt-1">{member.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Request Deep Dive */}
        <div className="mb-8 p-6 bg-gradient-to-r from-neutral-900 to-neutral-800 rounded-lg border border-neutral-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Request a Deep Dive</h2>
            {session && credits !== null && (
              <div className="text-sm text-neutral-400">
                <span className="text-white font-medium">{credits}</span> credits
              </div>
            )}
          </div>
          
          {!session ? (
            <p className="text-neutral-400 text-sm">
              <Link href="/login" className="text-white underline">Sign in</Link> to request custom research reports.
            </p>
          ) : (
            <form onSubmit={handleRequestDeepDive} className="flex gap-3">
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                placeholder="Enter ticker (e.g. AAPL)"
                maxLength={10}
                className="flex-1 bg-neutral-800 border border-neutral-600 rounded-lg px-4 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400 uppercase"
              />
              <button
                type="submit"
                disabled={requesting || !tickerInput.trim() || (credits !== null && credits < 5)}
                className="px-6 py-2 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {requesting ? 'Requesting...' : 'Request (5 credits)'}
              </button>
            </form>
          )}
          
          {requestError && (
            <p className="mt-3 text-red-400 text-sm">{requestError}</p>
          )}
          {requestSuccess && (
            <p className="mt-3 text-green-400 text-sm">{requestSuccess}</p>
          )}
          
          {credits !== null && credits < 5 && (
            <p className="mt-3 text-yellow-400 text-sm">
              You need at least 5 credits for a deep dive. Credits coming soon!
            </p>
          )}
        </div>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">In Progress</h2>
            <div className="space-y-2">
              {pendingRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between p-4 bg-neutral-900 rounded-lg border border-neutral-800">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold">{req.ticker}</span>
                    {getStatusBadge(req.status)}
                    {req.requested_by && (
                      <span className="text-xs text-neutral-500">by @{req.requested_by}</span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {new Date(req.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Type Filter + Search Bar */}
        <div className="mb-8">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === 'all' 
                  ? 'bg-white text-black' 
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              All ({reports.length})
            </button>
            <button
              onClick={() => setTypeFilter('deep-dive')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === 'deep-dive' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              🔍 Deep Dives ({reports.filter(r => r.type === 'deep-dive').length})
            </button>
            <button
              onClick={() => setTypeFilter('scan')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === 'scan' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              📡 Scans ({reports.filter(r => r.type === 'scan').length})
            </button>
          </div>
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
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-neutral-500 uppercase tracking-wide">
                      {report.ticker}
                    </span>
                    {report.type === 'scan' ? (
                      <span className="px-2 py-0.5 bg-purple-900/50 text-purple-400 rounded text-xs font-medium">
                        SCAN
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs font-medium">
                        DEEP DIVE
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-semibold">{report.title}</h2>
                </div>
                {report.rating && (
                  <span className={`text-sm font-medium ${getRatingColor(report.rating)}`}>
                    {report.rating}
                  </span>
                )}
              </div>
              
              <p className="text-neutral-400 text-sm mb-3">{report.summary}</p>
              
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {(report.tags || []).slice(0, 3).map(tag => (
                    <span 
                      key={tag}
                      className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-neutral-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  {report.requested_by && (
                    <span className="text-xs text-neutral-500">by @{report.requested_by}</span>
                  )}
                  <span className="text-xs text-neutral-500">{report.date}</span>
                </div>
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

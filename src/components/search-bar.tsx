'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface SearchResult {
  sources: { handle: string; display_name: string | null; avatar_url: string | null }[];
  tickers: string[];
}

// Universal search — tickers ($AAPL → /positions/AAPL) and profiles (@handle → /sources/handle).
export function SearchBar({ className = '', onNavigate }: { className?: string; onNavigate?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResult>({ sources: [], tickers: [] });
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setRes({ sources: [], tickers: [] }); return; }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) { setRes(d); setOpen(true); } })
        .catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const go = (href: string) => { setOpen(false); setQ(''); onNavigate?.(); router.push(href); };
  const hasResults = res.tickers.length > 0 || res.sources.length > 0;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (hasResults) setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter') {
            if (res.tickers[0]) go(`/positions/${encodeURIComponent(res.tickers[0])}`);
            else if (res.sources[0]) go(`/sources/${encodeURIComponent(res.sources[0].handle)}`);
          }
        }}
        placeholder="Search tickers or profiles…"
        className="w-full bg-raised border border-[rgb(var(--t-brass)/0.25)] rounded px-3 py-1.5 text-sm text-parchment placeholder:text-parchment/35 focus:outline-none focus:border-brass"
        aria-label="Search tickers or profiles"
      />
      {open && hasResults && (
        <div
          className="absolute left-0 right-0 mt-1 rounded-sm shadow-xl z-[60] py-1 max-h-80 overflow-y-auto"
          style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.28)' }}
        >
          {res.tickers.length > 0 && (
            <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-parchment/40 font-[var(--font-oswald)]">Tickers</div>
          )}
          {res.tickers.map((t) => (
            <button key={t} onClick={() => go(`/positions/${encodeURIComponent(t)}`)} className="w-full text-left px-3 py-1.5 text-sm font-mono text-parchment/85 hover:bg-raised transition">
              ${t}
            </button>
          ))}
          {res.sources.length > 0 && (
            <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-parchment/40 font-[var(--font-oswald)]">Profiles</div>
          )}
          {res.sources.map((s) => (
            <button key={s.handle} onClick={() => go(`/sources/${encodeURIComponent(s.handle)}`)} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-raised transition">
              {s.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-raised inline-block shrink-0" />
              )}
              <span className="text-parchment/85 font-mono">@{s.handle}</span>
              {s.display_name && <span className="text-parchment/45 truncate">{s.display_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

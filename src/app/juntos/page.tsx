'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

const CADENCE_LABELS: Record<string, string> = {
  daily: 'Daily',
  twice_daily: '2× Daily',
  weekly: 'Weekly',
};

interface JuntoSource {
  id: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
  type: string;
}

interface Dispatch {
  id: string;
  name: string;
  subscriber_count: number;
  schedule_cadence: string;
}

interface JuntoCard {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  is_own: boolean;
  source_count: number;
  sources: JuntoSource[];
  dispatches: Dispatch[];
}

function SourceAvatar({ src, size = 24 }: { src: JuntoSource; size?: number }) {
  const label = src.display_name || src.handle_or_url || '?';
  const initials = label.replace('@', '').slice(0, 2).toUpperCase();
  return src.avatar_url ? (
    <img
      src={src.avatar_url}
      alt={label}
      title={src.display_name || src.handle_or_url}
      style={{ width: size, height: size, borderRadius: '2px', objectFit: 'cover', border: '1px solid rgba(176,141,87,0.18)', flexShrink: 0 }}
    />
  ) : (
    <div
      title={src.display_name || src.handle_or_url}
      style={{
        width: size,
        height: size,
        borderRadius: '2px',
        background: 'rgba(176,141,87,0.15)',
        border: '1px solid rgba(176,141,87,0.28)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.33,
        color: '#B08D57',
        fontFamily: 'var(--font-oswald, sans-serif)',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function AvatarStack({ sources, max = 6 }: { sources: JuntoSource[]; max?: number }) {
  const shown = sources.slice(0, max);
  const rest = sources.length - max;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map((s) => (
        <SourceAvatar key={s.id} src={s} size={24} />
      ))}
      {rest > 0 && (
        <div style={{
          width: 24, height: 24, borderRadius: '2px',
          background: 'rgba(176,141,87,0.08)',
          border: '1px solid rgba(176,141,87,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: 'rgba(245,239,224,0.45)',
        }}>
          +{rest}
        </div>
      )}
    </div>
  );
}

function JuntoModal({ junto, onClose }: { junto: JuntoCard; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(8,6,4,0.85)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md flex flex-col"
        style={{
          background: '#0d0b09',
          border: '1px solid rgba(176,141,87,0.28)',
          borderBottom: 'none',
          borderRadius: '4px 4px 0 0',
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(176,141,87,0.15)' }}>
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <h2 className="text-base font-bold uppercase tracking-wide truncate" style={{ fontFamily: 'var(--font-oswald, sans-serif)', color: '#F5EFE0' }}>
                {junto.name}
              </h2>
              {junto.is_own && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm shrink-0" style={{ background: 'rgba(176,141,87,0.15)', color: '#B08D57', border: '1px solid rgba(176,141,87,0.28)' }}>
                  Yours
                </span>
              )}
            </div>
            {junto.description && (
              <p className="text-xs mt-0.5" style={{ color: 'rgba(245,239,224,0.55)' }}>{junto.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-lg leading-none transition shrink-0 mt-0.5"
            style={{ color: 'rgba(245,239,224,0.35)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#F5EFE0')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(245,239,224,0.35)')}
          >
            ×
          </button>
        </div>

        {/* Source list — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {junto.sources.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: 'rgba(245,239,224,0.35)' }}>No sources added yet.</p>
          ) : (
            <div className="space-y-2">
              {junto.sources.map((s) => {
                const handle = s.type === 'twitter' ? `@${s.handle_or_url}` : s.handle_or_url;
                const label = s.display_name || handle;
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <SourceAvatar src={s} size={32} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: '#F5EFE0' }}>{label}</div>
                      {s.display_name && (
                        <div className="text-xs font-mono truncate" style={{ color: 'rgba(245,239,224,0.4)' }}>{handle}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 flex gap-2 flex-wrap" style={{ borderTop: '1px solid rgba(176,141,87,0.15)' }}>
          <Link
            href={`/create?junto_id=${junto.id}`}
            className="flex-1 text-center py-2.5 text-xs font-bold uppercase tracking-wide transition"
            style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald, sans-serif)' }}
          >
            Create Dispatch →
          </Link>
          <Link
            href={`/junto/${junto.id}`}
            className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition"
            style={{ border: '1px solid rgba(176,141,87,0.28)', color: 'rgba(245,239,224,0.6)', fontFamily: 'var(--font-oswald, sans-serif)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#F5EFE0')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(245,239,224,0.6)')}
          >
            View Junto
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function JuntosPage() {
  const [juntos, setJuntos] = useState<JuntoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileFilter, setProfileFilter] = useState('');
  const [selectedJunto, setSelectedJunto] = useState<JuntoCard | null>(null);

  useEffect(() => {
    fetch('/api/juntos/public')
      .then((r) => r.json())
      .then((d) => setJuntos(d.juntos || []))
      .catch(() => setJuntos([]))
      .finally(() => setLoading(false));
  }, []);

  const filterTerms = profileFilter.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);

  const filtered = filterTerms.length === 0
    ? juntos
    : juntos.filter((j) =>
        filterTerms.every((term) =>
          j.sources.some((s) => {
            const handle = (s.handle_or_url || '').toLowerCase().replace('@', '');
            const name = (s.display_name || '').toLowerCase();
            return handle.includes(term) || name.includes(term);
          })
        )
      );

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 uppercase tracking-wide" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
              Juntos
            </h1>
            <p style={{ color: 'rgba(245,239,224,0.6)', fontSize: '1rem' }}>Curated source lists — browse or build your own.</p>
          </div>
          <Link
            href="/junto/new"
            className="rounded px-5 py-2.5 transition shrink-0 font-bold uppercase tracking-wide text-sm"
            style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald, sans-serif)' }}
          >
            + New Junto
          </Link>
        </div>

        {/* Profile filter */}
        <div className="mb-6">
          <input
            type="text"
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            placeholder="Filter by profile — type a handle or name (e.g. elonmusk, Cathie Wood)"
            className="w-full px-4 py-2.5 text-sm focus:outline-none transition"
            style={{
              background: '#141210',
              border: '1px solid rgba(176,141,87,0.28)',
              color: '#F5EFE0',
            }}
          />
          {filterTerms.length > 0 && (
            <div className="flex items-center justify-between mt-1.5 px-0.5">
              <p className="text-xs" style={{ color: 'rgba(245,239,224,0.4)' }}>
                {filtered.length} junto{filtered.length !== 1 ? 's' : ''} include{filtered.length === 1 ? 's' : ''} all filters
              </p>
              <button
                onClick={() => setProfileFilter('')}
                className="text-xs transition"
                style={{ color: 'rgba(176,141,87,0.6)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#B08D57')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(176,141,87,0.6)')}
              >
                clear
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded p-5 h-36" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            {juntos.length === 0 ? (
              <>
                <p className="mb-4" style={{ color: 'rgba(245,239,224,0.6)' }}>No juntos yet.</p>
                <Link href="/junto/new" style={{ color: '#B08D57' }} className="font-medium hover:opacity-80 transition">
                  Create the first one →
                </Link>
              </>
            ) : (
              <p style={{ color: 'rgba(245,239,224,0.5)' }}>No juntos match that filter.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((junto) => (
              <button
                key={junto.id}
                onClick={() => setSelectedJunto(junto)}
                className="text-left transition group flex flex-col gap-3 p-5 w-full"
                style={{
                  background: '#141210',
                  border: '1px solid rgba(176,141,87,0.28)',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(176,141,87,0.5)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(176,141,87,0.28)')}
              >
                {/* Name + badges */}
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-lg leading-tight group-hover:text-[#B08D57] transition" style={{ fontFamily: 'var(--font-oswald, sans-serif)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {junto.name}
                  </h2>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    {junto.is_own && (
                      <span className="text-[10px] px-2 py-0.5 rounded-sm font-medium" style={{ background: 'rgba(176,141,87,0.15)', color: '#B08D57', border: '1px solid rgba(176,141,87,0.28)' }}>
                        Yours
                      </span>
                    )}
                    {!junto.is_public && (
                      <span className="text-[10px] px-2 py-0.5 rounded-sm font-medium" style={{ background: '#1c1a17', color: 'rgba(245,239,224,0.45)', border: '1px solid rgba(176,141,87,0.18)' }}>
                        Private
                      </span>
                    )}
                  </div>
                </div>

                {junto.description && (
                  <p className="text-sm line-clamp-2" style={{ color: 'rgba(245,239,224,0.6)' }}>{junto.description}</p>
                )}

                {/* Source avatars */}
                {junto.sources.length > 0 ? (
                  <AvatarStack sources={junto.sources} max={8} />
                ) : (
                  <p className="text-xs" style={{ color: 'rgba(245,239,224,0.3)' }}>No sources yet</p>
                )}

                {/* Meta + dispatch pills */}
                <div className="flex items-center gap-3 mt-auto flex-wrap">
                  <span className="text-xs" style={{ color: 'rgba(245,239,224,0.4)' }}>
                    {junto.source_count} {junto.source_count === 1 ? 'source' : 'sources'}
                  </span>
                  {junto.dispatches.slice(0, 2).map((d) => (
                    <span
                      key={d.id}
                      className="text-[11px] px-2 py-0.5"
                      style={{ background: '#1c1a17', color: 'rgba(245,239,224,0.7)', border: '1px solid rgba(176,141,87,0.18)' }}
                    >
                      {d.name} · {CADENCE_LABELS[d.schedule_cadence] ?? d.schedule_cadence}
                    </span>
                  ))}
                  {junto.dispatches.length > 2 && (
                    <span className="text-[11px]" style={{ color: 'rgba(245,239,224,0.35)' }}>
                      +{junto.dispatches.length - 2} more
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedJunto && (
        <JuntoModal junto={selectedJunto} onClose={() => setSelectedJunto(null)} />
      )}
    </main>
  );
}

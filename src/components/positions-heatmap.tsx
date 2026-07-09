'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { squarifiedTreemap, STANCE_BG, STANCE_LABEL, hexToRgb } from '@/lib/positions/treemap';

export interface HeatmapPosition {
  ticker: string;
  stance: string;
  count: number;
  fresh_count?: number;
  sources?: Array<{ handle: string; display_name?: string | null; avatar_url: string | null; is_stale?: boolean }>;
}

interface Props {
  items: HeatmapPosition[];
  height?: number;
  includeStale?: boolean;
  linkBase?: string;
  className?: string;
}

export function PositionsHeatmap({
  items,
  height = 360,
  includeStale = false,
  linkBase = '/positions',
  className = '',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const effectiveCount = (i: HeatmapPosition) =>
    includeStale ? i.count : i.fresh_count ?? i.count;
  const maxCount = Math.max(...items.map(effectiveCount), 1);

  const sorted = useMemo(
    () => [...items].filter((i) => effectiveCount(i) > 0).sort((a, b) => effectiveCount(b) - effectiveCount(a)),
    [items, includeStale],
  );

  const layout = useMemo(
    () => squarifiedTreemap(
      sorted.map((i) => ({ value: effectiveCount(i), data: i })),
      width,
      height,
    ),
    [sorted, width, height],
  );

  if (items.length === 0) {
    return (
      <div className={`flex items-center justify-center text-parchment/55 text-sm ${className}`} style={{ height }}>
        No positions yet.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`relative w-full bg-ink border border-[rgb(var(--t-brass) / 0.18)] rounded overflow-hidden ${className}`}
      style={{ height: `${height}px` }}
    >
      {layout.map(({ x, y, w, h, data: item }) => {
        const shownCount = effectiveCount(item);
        const bg = STANCE_BG[item.stance] ?? '#4b5563';
        const ratio = shownCount / maxCount;
        const alpha = 0.18 + ratio * 0.45;
        const tileArea = w * h;
        const showLabel = w >= 40 && h >= 28;
        const showStance = w >= 70 && h >= 60;
        const showAvatars = w >= 90 && h >= 80;
        const fontSize = Math.max(10, Math.min(Math.floor(Math.sqrt(tileArea) / 5), 56));
        const visibleSources = (item.sources || []).filter((s) => includeStale || !s.is_stale);
        const avatarSize = Math.max(14, Math.min(Math.floor(Math.sqrt(tileArea) / 12), 28));

        return (
          <Link
            key={`${item.ticker}-${item.stance}`}
            href={`${linkBase}/${encodeURIComponent(item.ticker)}`}
            className="absolute flex flex-col items-center justify-center overflow-hidden transition group"
            style={{
              left: `${x}px`,
              top: `${y}px`,
              width: `${w}px`,
              height: `${h}px`,
              background: `rgba(${hexToRgb(bg)}, ${alpha})`,
              boxShadow: 'inset 0 0 0 1px rgb(var(--t-ink) / 0.6)',
            }}
            title={`${item.ticker} · ${STANCE_LABEL[item.stance] ?? item.stance} · ${shownCount} source${shownCount !== 1 ? 's' : ''}`}
          >
            <span
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition pointer-events-none"
              style={{ boxShadow: `inset 0 0 0 2px ${bg}` }}
            />
            {showLabel && (
              <span
                className="font-bold font-mono text-center leading-tight px-1"
                style={{ fontSize: `${fontSize}px`, color: 'rgb(var(--t-parchment))' }}
              >
                {item.ticker}
              </span>
            )}
            {showStance && (
              <span
                className="font-medium uppercase tracking-wider leading-none mt-1"
                style={{ fontSize: `${Math.max(8, Math.floor(fontSize * 0.4))}px`, color: bg }}
              >
                {STANCE_LABEL[item.stance] ?? item.stance} · {shownCount}
              </span>
            )}
            {showAvatars && visibleSources.length > 0 && (
              <div className="flex items-center mt-1.5" style={{ marginLeft: 4 }}>
                {visibleSources.slice(0, w > 160 ? 4 : 2).map((s, i) => (
                  <div
                    key={s.handle}
                    className="rounded-full border-2 overflow-hidden shrink-0"
                    style={{
                      width: `${avatarSize}px`,
                      height: `${avatarSize}px`,
                      borderColor: 'rgb(var(--t-ink))',
                      marginLeft: i > 0 ? `-${Math.floor(avatarSize / 3)}px` : 0,
                      background: 'rgb(var(--t-raised))',
                      position: 'relative',
                      zIndex: 10 - i,
                    }}
                  >
                    {s.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatar_url} alt={s.handle} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-parchment/60" style={{ fontSize: '8px' }}>
                        {s.handle[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

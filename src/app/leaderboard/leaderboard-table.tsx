'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SourceHitRateRow } from '@/lib/leaderboard';

type SortKey = 'hit_rate' | 'scored' | 'avg_return_pct' | 'total_positions' | 'avg_conviction';

const COLUMNS: Array<{ key: SortKey; label: string; hideAt?: string }> = [
  { key: 'hit_rate', label: 'Hit rate' },
  { key: 'scored', label: 'Calls' },
  { key: 'avg_return_pct', label: 'Avg return', hideAt: 'hidden md:table-cell' },
  { key: 'avg_conviction', label: 'Avg conv.', hideAt: 'hidden sm:table-cell' },
  { key: 'total_positions', label: 'Positions' },
];

function pct(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`;
}

// Null-aware value for sorting: unrated/empty metrics always sink to the bottom.
function sortVal(r: SourceHitRateRow, key: SortKey): number | null {
  const v = r[key];
  return v == null ? null : Number(v);
}

export function LeaderboardTable({ rows }: { rows: SourceHitRateRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('hit_rate');
  const [desc, setDesc] = useState(true);

  const sorted = [...rows].sort((a, b) => {
    const av = sortVal(a, sortKey);
    const bv = sortVal(b, sortKey);
    // nulls to the bottom regardless of direction
    if (av == null && bv == null) return b.total_positions - a.total_positions;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av !== bv) return desc ? bv - av : av - bv;
    // stable-ish tiebreak so equal values don't jump around
    return b.scored - a.scored || b.total_positions - a.total_positions;
  });

  function toggle(key: SortKey) {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(true);
    }
  }

  const arrow = (key: SortKey) => (key === sortKey ? (desc ? ' ↓' : ' ↑') : '');

  return (
    <div className="overflow-x-auto border border-[#F5EFE0]/10 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[#F5EFE0]/40 border-b border-[#F5EFE0]/10">
            <th className="py-3 pl-4 pr-2 font-medium">#</th>
            <th className="py-3 px-2 font-medium">Analyst</th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`py-3 px-2 font-medium text-right select-none cursor-pointer hover:text-[#F5EFE0]/70 ${c.hideAt ?? ''} ${
                  c.key === sortKey ? 'text-[#B08D57]' : ''
                }`}
                onClick={() => toggle(c.key)}
              >
                {c.label}
                {arrow(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const isRated = r.hit_rate != null;
            return (
              <tr
                key={r.source_id}
                className="border-b border-[#F5EFE0]/5 last:border-0 hover:bg-[#F5EFE0]/[0.03]"
              >
                <td className="py-3 pl-4 pr-2 text-[#F5EFE0]/40 tabular-nums">{i + 1}</td>
                <td className="py-3 px-2">
                  <Link
                    href={`/sources/${encodeURIComponent(r.handle)}`}
                    className="flex items-center gap-3 group"
                  >
                    {r.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.avatar_url}
                        alt={r.handle}
                        className="w-8 h-8 rounded bg-[#1c1a17] object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-[#1c1a17] flex items-center justify-center text-[#F5EFE0]/60 text-xs font-medium shrink-0">
                        {r.handle[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="font-medium text-[#F5EFE0] group-hover:text-[#B08D57] transition">
                        @{r.handle}
                      </span>
                      {r.display_name ? (
                        <div className="text-[11px] text-[#F5EFE0]/40 truncate">{r.display_name}</div>
                      ) : null}
                    </div>
                  </Link>
                </td>
                <td className="py-3 px-2 text-right tabular-nums font-semibold text-[#B08D57]">
                  {isRated ? (
                    pct(r.hit_rate)
                  ) : (
                    <span className="text-[#F5EFE0]/30 font-normal">unrated</span>
                  )}
                </td>
                <td className="py-3 px-2 text-right tabular-nums text-[#F5EFE0]/70">
                  {r.scored > 0 ? (
                    <>
                      {r.scored}
                      <span className="text-[#F5EFE0]/30 text-[11px]"> ({r.wins}–{r.losses})</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-3 px-2 text-right tabular-nums hidden md:table-cell text-[#F5EFE0]/70">
                  {r.avg_return_pct == null
                    ? '—'
                    : `${r.avg_return_pct > 0 ? '+' : ''}${r.avg_return_pct.toFixed(1)}%`}
                </td>
                <td className="py-3 px-2 text-right tabular-nums hidden sm:table-cell text-[#F5EFE0]/70">
                  {r.avg_conviction == null ? '—' : r.avg_conviction.toFixed(1)}
                </td>
                <td className="py-3 pl-2 pr-4 text-right tabular-nums text-[#F5EFE0]/40">
                  {r.total_positions}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

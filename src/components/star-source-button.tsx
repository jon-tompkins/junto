'use client';

import { useState } from 'react';

// Star toggle for a source. Starring adds the source to the user's featured
// ("personal") junto via /api/v2/starred-sources. Controlled-ish: parent passes
// the current starred state and is notified on change so it can keep its own set
// in sync, but the button owns the in-flight/optimistic state.
export function StarSourceButton({
  sourceId,
  starred,
  onChange,
  size = 'md',
}: {
  sourceId: string;
  starred: boolean;
  onChange?: (sourceId: string, starred: boolean) => void;
  size?: 'sm' | 'md';
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !starred;
    setBusy(true);
    setErr(null);
    onChange?.(sourceId, next); // optimistic
    try {
      const res = await fetch('/api/v2/junto-source-star', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed');
      }
    } catch (e: any) {
      onChange?.(sourceId, !next); // revert
      setErr(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const dim = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={err ? err : starred ? 'Starred — in your junto. Click to remove.' : 'Star — add to your junto'}
      aria-pressed={starred}
      aria-label={starred ? 'Un-star source' : 'Star source'}
      className={`inline-flex items-center justify-center transition ${busy ? 'opacity-50' : 'hover:scale-110'} ${
        starred ? 'text-brass' : 'text-parchment/30 hover:text-parchment/60'
      }`}
    >
      <svg className={dim} viewBox="0 0 20 20" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
        <path
          strokeLinejoin="round"
          d="M10 2.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.9l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L10 2.5z"
        />
      </svg>
    </button>
  );
}

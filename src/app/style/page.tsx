'use client';

// Federalist palette — inspired by Benjamin Franklin's Junto (1727)
// Navy #1B2951 · Parchment #F5EFE0 · Brass #B08D57 · Oxblood #722F37 · Ink #1A1814

const BRASS = '#B08D57';
const PARCHMENT = '#F5EFE0';
const NAVY = '#1B2951';
const OXBLOOD = '#722F37';
const INK = '#0d0b09';

export default function StylePage() {
  return (
    <main
      className="min-h-screen px-6 py-16"
      style={{
        background: INK,
        color: PARCHMENT,
        fontFamily: 'var(--font-display), sans-serif',
      }}
    >
      {/* Subtle grid backdrop */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(176,141,87,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(176,141,87,0.04) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="max-w-4xl mx-auto space-y-24 relative">

        {/* Header */}
        <div style={{ borderLeft: `4px solid ${BRASS}`, paddingLeft: '1.25rem' }}>
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ fontFamily: 'var(--font-mono), monospace', color: `${BRASS}aa` }}
          >
            myjunto / style
          </p>
          <h1
            className="text-6xl font-bold uppercase tracking-tight leading-none mb-3"
            style={{ fontFamily: 'var(--font-oswald), sans-serif', color: PARCHMENT }}
          >
            Design System
          </h1>
          <p className="text-sm max-w-md" style={{ color: `${PARCHMENT}70` }}>
            Direction: uplifting neo-brutalism, Federalist palette. Franklin was a printer —
            heavy type, aged warmth, structural confidence. No decorative noise.
          </p>
        </div>

        {/* ── Colors ─────────────────────────────── */}
        <section>
          <SectionLabel>01 / Colors</SectionLabel>

          <div className="space-y-10">
            <div>
              <Label>Full palette — the Federalist five</Label>
              <div className="grid grid-cols-5 gap-0" style={{ border: '1px solid rgba(176,141,87,0.15)' }}>
                {[
                  { name: 'Brass', hex: BRASS, role: 'Primary accent', light: false },
                  { name: 'Parchment', hex: PARCHMENT, role: 'Text / light bg', light: true },
                  { name: 'Navy', hex: NAVY, role: 'Secondary accent', light: false },
                  { name: 'Oxblood', hex: OXBLOOD, role: 'Bear / danger', light: false },
                  { name: 'Ink', hex: INK, role: 'Page background', light: false },
                ].map((c, i) => (
                  <div
                    key={c.name}
                    className="p-4"
                    style={{ borderRight: i < 4 ? '1px solid rgba(176,141,87,0.1)' : 'none' }}
                  >
                    <div className="h-10 mb-3" style={{ background: c.hex }} />
                    <p className="text-xs font-semibold" style={{ color: PARCHMENT }}>{c.name}</p>
                    <p className="text-[10px] mt-0.5 font-mono" style={{ color: `${PARCHMENT}50` }}>{c.hex}</p>
                    <p className="text-[10px] mt-1" style={{ color: `${PARCHMENT}40` }}>{c.role}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Background scale — dark mode</Label>
              <div className="flex overflow-hidden" style={{ border: '1px solid rgba(176,141,87,0.15)' }}>
                {[
                  { label: 'Ink / Page', bg: INK },
                  { label: 'Surface', bg: '#141210' },
                  { label: 'Raised', bg: '#1c1a17' },
                  { label: 'Hover', bg: '#232017' },
                  { label: 'Border', bg: 'rgba(176,141,87,0.12)' },
                ].map((c, i) => (
                  <div
                    key={c.label}
                    className="flex-1 p-4"
                    style={{ borderRight: i < 4 ? '1px solid rgba(176,141,87,0.1)' : 'none' }}
                  >
                    <div className="h-8 mb-3" style={{ background: c.bg, border: '1px solid rgba(176,141,87,0.1)' }} />
                    <p className="text-[10px] font-semibold" style={{ color: PARCHMENT }}>{c.label}</p>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: `${PARCHMENT}40` }}>{c.bg}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Text scale</Label>
              <div style={{ border: '1px solid rgba(176,141,87,0.15)' }}>
                {[
                  { label: 'Primary', color: PARCHMENT, s: 'Market intelligence from signal.' },
                  { label: 'Secondary', color: `${PARCHMENT}90`, s: 'Market intelligence from signal.' },
                  { label: 'Muted', color: `${PARCHMENT}60`, s: 'Market intelligence from signal.' },
                  { label: 'Disabled', color: `${PARCHMENT}30`, s: 'Market intelligence from signal.' },
                  { label: 'Brass', color: BRASS, s: 'Market intelligence from signal.' },
                  { label: 'Navy', color: '#6B82B5', s: 'Market intelligence from signal.' },
                  { label: 'Bull', color: '#7DB87D', s: 'Market intelligence from signal.' },
                  { label: 'Bear / Danger', color: OXBLOOD, s: 'Market intelligence from signal.' },
                ].map((t, i, arr) => (
                  <div
                    key={t.label}
                    className="flex items-center px-4 py-3 gap-8"
                    style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(176,141,87,0.06)' : 'none' }}
                  >
                    <span className="text-xs w-24 shrink-0 font-mono" style={{ color: `${PARCHMENT}35`, fontFamily: 'var(--font-mono)' }}>{t.label}</span>
                    <span className="text-sm" style={{ color: t.color }}>{t.s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Typography ─────────────────────────── */}
        <section>
          <SectionLabel>02 / Typography</SectionLabel>
          <div style={{ border: '1px solid rgba(176,141,87,0.15)' }} className="p-6 space-y-6">
            <div>
              <Mono>Display / H1 — Oswald 700, parchment</Mono>
              <p
                className="text-7xl font-bold uppercase leading-none tracking-tight mt-2"
                style={{ fontFamily: 'var(--font-oswald), sans-serif', color: PARCHMENT }}
              >
                The Signal.
              </p>
            </div>
            <div>
              <Mono>H2 — Oswald 600</Mono>
              <p
                className="text-4xl font-semibold uppercase tracking-tight mt-2"
                style={{ fontFamily: 'var(--font-oswald), sans-serif', color: PARCHMENT }}
              >
                Curated Intelligence
              </p>
            </div>
            <div>
              <Mono>H3 — Oswald 500</Mono>
              <p
                className="text-2xl font-medium uppercase tracking-wide mt-2"
                style={{ fontFamily: 'var(--font-oswald), sans-serif', color: PARCHMENT }}
              >
                Analyst Profiles
              </p>
            </div>
            <div>
              <Mono>Body — system sans, parchment/70</Mono>
              <p className="text-base leading-relaxed max-w-lg mt-2" style={{ color: `${PARCHMENT}90` }}>
                AI synthesizes everything into a brief worth reading. Daily, twice daily, or weekly —
                delivered wherever you want it. Signal from the sources that actually move markets.
              </p>
            </div>
            <div>
              <Mono>Data / timestamp — IBM Plex Mono, brass</Mono>
              <p
                className="text-sm mt-2"
                style={{ fontFamily: 'var(--font-mono), monospace', color: BRASS }}
              >
                01 / DISPATCH · BTC: LONG · CONVICTION: HIGH · UPDATED 14:32 UTC
              </p>
            </div>
            <div>
              <Mono>Section label — mono, muted</Mono>
              <p
                className="text-xs uppercase tracking-[0.2em] mt-2"
                style={{ fontFamily: 'var(--font-mono), monospace', color: `${PARCHMENT}40` }}
              >
                Dispatches
              </p>
            </div>
          </div>
        </section>

        {/* ── Buttons ────────────────────────────── */}
        <section>
          <SectionLabel>03 / Buttons</SectionLabel>
          <div style={{ border: '1px solid rgba(176,141,87,0.15)' }} className="p-6 space-y-8">

            <div>
              <Label>Primary — brass fill, ink text</Label>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  className="px-7 py-3 font-bold text-sm uppercase tracking-wide transition hover:opacity-90"
                  style={{ background: BRASS, color: INK, fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  Create a Dispatch
                </button>
                <button
                  className="px-5 py-2 font-bold text-xs uppercase tracking-wide transition hover:opacity-90"
                  style={{ background: BRASS, color: INK, fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  Subscribe
                </button>
                <button
                  className="px-7 py-3 font-bold text-sm uppercase tracking-wide cursor-not-allowed opacity-30"
                  style={{ background: BRASS, color: INK, fontFamily: 'var(--font-oswald), sans-serif' }}
                  disabled
                >
                  Disabled
                </button>
              </div>
            </div>

            <div>
              <Label>Secondary — brass border, transparent fill</Label>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  className="px-7 py-3 font-bold text-sm uppercase tracking-wide transition"
                  style={{
                    border: `2px solid ${BRASS}55`,
                    color: BRASS,
                    fontFamily: 'var(--font-oswald), sans-serif',
                  }}
                >
                  Browse Juntos
                </button>
                <button
                  className="px-7 py-3 font-bold text-sm uppercase tracking-wide transition"
                  style={{
                    border: `2px solid ${NAVY}80`,
                    color: '#6B82B5',
                    fontFamily: 'var(--font-oswald), sans-serif',
                  }}
                >
                  View Profile
                </button>
              </div>
            </div>

            <div>
              <Label>Ghost / inline</Label>
              <div className="flex flex-wrap gap-6 items-center">
                <button
                  className="text-sm font-semibold uppercase tracking-wide transition flex items-center gap-2 hover:opacity-70"
                  style={{ color: BRASS, fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  Browse all Juntos <span className="text-lg leading-none">→</span>
                </button>
                <button
                  className="text-sm font-semibold uppercase tracking-wide transition flex items-center gap-2 hover:opacity-70"
                  style={{ color: `${PARCHMENT}60`, fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  View all <span className="text-lg leading-none">→</span>
                </button>
              </div>
            </div>

            <div>
              <Label>Destructive — oxblood</Label>
              <button
                className="px-7 py-3 font-bold text-sm uppercase tracking-wide transition"
                style={{
                  border: `2px solid ${OXBLOOD}60`,
                  color: OXBLOOD,
                  fontFamily: 'var(--font-oswald), sans-serif',
                }}
              >
                Delete Dispatch
              </button>
            </div>
          </div>
        </section>

        {/* ── Cards ──────────────────────────────── */}
        <section>
          <SectionLabel>04 / Cards &amp; Boxes</SectionLabel>
          <div className="space-y-6">

            <div>
              <Label>Dispatch card — default vs active (brass left-border)</Label>
              <div className="grid md:grid-cols-2 gap-0" style={{ border: '1px solid rgba(176,141,87,0.15)' }}>
                <div
                  className="group p-5 cursor-pointer transition"
                  style={{ borderRight: '1px solid rgba(176,141,87,0.1)' }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3
                      className="text-lg font-semibold uppercase tracking-wide transition"
                      style={{ fontFamily: 'var(--font-oswald), sans-serif', color: PARCHMENT }}
                    >
                      Crypto Daily Brief
                    </h3>
                    <span
                      className="text-[10px] px-2 py-1 ml-3 uppercase tracking-wide shrink-0"
                      style={{
                        border: `1px solid rgba(176,141,87,0.2)`,
                        color: `${PARCHMENT}50`,
                        fontFamily: 'var(--font-mono), monospace',
                      }}
                    >
                      Daily
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: `${PARCHMENT}60` }}>
                    Top crypto voices distilled into actionable morning intelligence.
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      {['crypto', 'defi'].map(l => (
                        <span key={l} className="text-[10px] px-2 py-0.5 uppercase" style={{ border: '1px solid rgba(176,141,87,0.12)', color: `${PARCHMENT}35` }}>{l}</span>
                      ))}
                    </div>
                    <span className="text-xs font-mono" style={{ color: `${PARCHMENT}30`, fontFamily: 'var(--font-mono)' }}>12 sources</span>
                  </div>
                </div>

                {/* Active state */}
                <div
                  className="p-5 cursor-pointer"
                  style={{ borderLeft: `3px solid ${BRASS}` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3
                      className="text-lg font-semibold uppercase tracking-wide"
                      style={{ fontFamily: 'var(--font-oswald), sans-serif', color: BRASS }}
                    >
                      Macro Weekly
                    </h3>
                    <span
                      className="text-[10px] px-2 py-1 ml-3 uppercase tracking-wide shrink-0"
                      style={{ border: `1px solid ${BRASS}40`, color: `${BRASS}90`, fontFamily: 'var(--font-mono), monospace' }}
                    >
                      Weekly
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: `${PARCHMENT}60` }}>
                    Rates, commodities, and global macro from the smartest voices on X.
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      {['macro', 'rates'].map(l => (
                        <span key={l} className="text-[10px] px-2 py-0.5 uppercase" style={{ border: `1px solid ${BRASS}25`, color: `${BRASS}60` }}>{l}</span>
                      ))}
                    </div>
                    <span className="text-xs font-mono" style={{ color: `${PARCHMENT}30`, fontFamily: 'var(--font-mono)' }}>15 sources</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label>Stat box</Label>
              <div className="grid grid-cols-3 divide-x" style={{ border: '1px solid rgba(176,141,87,0.15)', borderRight: 'none' }}>
                {[
                  { n: '1,000', label: 'free credits', sub: '$1.00 value' },
                  { n: '1,000', label: 'credits per $1', sub: 'top up anytime' },
                  { n: '50%', label: 'revenue share', sub: 'earn from subscribers' },
                ].map((s) => (
                  <div key={s.label} className="p-6" style={{ borderRight: '1px solid rgba(176,141,87,0.15)' }}>
                    <div className="text-4xl font-bold leading-none mb-2" style={{ fontFamily: 'var(--font-oswald), sans-serif', color: BRASS }}>{s.n}</div>
                    <div className="text-sm" style={{ color: PARCHMENT }}>{s.label}</div>
                    <div className="text-xs mt-1" style={{ color: `${PARCHMENT}40` }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Notices — left-border accent pattern</Label>
              <div className="space-y-2">
                {[
                  { type: 'WARN', color: BRASS, bg: `${BRASS}0a`, text: 'Credits running low. Top up to keep dispatches running.' },
                  { type: 'OK', color: '#7DB87D', bg: '#7DB87D0a', text: 'Subscribed. First dispatch arrives tomorrow.' },
                  { type: 'INFO', color: `${PARCHMENT}40`, bg: `${PARCHMENT}05`, text: 'This dispatch runs on daily cadence — 7 sends per week.' },
                  { type: 'ERR', color: OXBLOOD, bg: `${OXBLOOD}0f`, text: 'Last dispatch failed to generate. Will retry at next cycle.' },
                ].map((n) => (
                  <div key={n.type} className="flex gap-3 p-4" style={{ borderLeft: `3px solid ${n.color}`, background: n.bg }}>
                    <span className="text-[10px] font-mono uppercase tracking-widest shrink-0 pt-0.5 w-10" style={{ color: n.color, fontFamily: 'var(--font-mono)' }}>{n.type}</span>
                    <p className="text-sm" style={{ color: `${PARCHMENT}80` }}>{n.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Form inputs</Label>
              <div className="space-y-3 max-w-sm p-5" style={{ border: '1px solid rgba(176,141,87,0.15)' }}>
                <input
                  type="text"
                  placeholder="Dispatch name"
                  className="w-full bg-transparent px-4 py-2.5 text-sm outline-none transition"
                  style={{
                    border: '1px solid rgba(176,141,87,0.2)',
                    color: PARCHMENT,
                  }}
                />
                <textarea
                  placeholder="Describe your lens — what angle should this dispatch take?"
                  rows={3}
                  className="w-full bg-transparent px-4 py-2.5 text-sm outline-none transition resize-none"
                  style={{ border: '1px solid rgba(176,141,87,0.2)', color: PARCHMENT }}
                />
                <select
                  className="w-full px-4 py-2.5 text-sm outline-none"
                  style={{ background: '#141210', border: '1px solid rgba(176,141,87,0.2)', color: `${PARCHMENT}80` }}
                >
                  <option>Daily</option>
                  <option>Twice daily</option>
                  <option>Weekly</option>
                </select>
              </div>
            </div>

          </div>
        </section>

        {/* ── Logo ───────────────────────────────── */}
        <section>
          <SectionLabel>05 / Logo &amp; Nav</SectionLabel>
          <div className="p-6 space-y-6" style={{ border: '1px solid rgba(176,141,87,0.15)' }}>
            <div>
              <Label>Option A — Oswald, brass accent</Label>
              <span className="text-3xl font-bold uppercase tracking-tight" style={{ fontFamily: 'var(--font-oswald), sans-serif' }}>
                <span style={{ color: PARCHMENT }}>MY</span>
                <span style={{ color: BRASS }}>JUNTO</span>
              </span>
            </div>
            <div>
              <Label>Option B — all parchment, no accent</Label>
              <span className="text-3xl font-bold uppercase tracking-tight" style={{ fontFamily: 'var(--font-oswald), sans-serif', color: PARCHMENT }}>
                MYJUNTO
              </span>
            </div>
            <div>
              <Label>Option C — lowercase, brass period</Label>
              <span className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-oswald), sans-serif' }}>
                <span style={{ color: PARCHMENT }}>myjunto</span>
                <span style={{ color: BRASS }}>.</span>
              </span>
            </div>
          </div>
        </section>

        {/* ── Analyst Profile ────────────────────── */}
        <section>
          <SectionLabel>06 / Analyst Profile — Sample</SectionLabel>
          <p className="text-xs mb-6" style={{ color: `${PARCHMENT}40`, fontFamily: 'var(--font-mono)' }}>Dummy data. Showing profile page layout with this palette.</p>

          <div style={{ border: `1px solid rgba(176,141,87,0.2)` }}>

            {/* Profile header */}
            <div className="p-6 flex items-start gap-5" style={{ borderBottom: '1px solid rgba(176,141,87,0.12)' }}>
              <div
                className="w-16 h-16 flex items-center justify-center shrink-0"
                style={{ background: '#222018', border: `1px solid rgba(176,141,87,0.2)` }}
              >
                <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-oswald), sans-serif', color: BRASS }}>SW</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2
                      className="text-2xl font-bold uppercase tracking-tight leading-none mb-1"
                      style={{ fontFamily: 'var(--font-oswald), sans-serif', color: PARCHMENT }}
                    >
                      Santiago Wolfson
                    </h2>
                    <p className="text-xs" style={{ fontFamily: 'var(--font-mono), monospace', color: `${PARCHMENT}45` }}>
                      @santiagoaufund · tracked since Jan 2025
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 text-xs font-mono uppercase" style={{ border: '1px solid #7DB87D40', color: '#7DB87D' }}>Bullish</span>
                    <span className="px-3 py-1 text-xs font-mono uppercase" style={{ border: `1px solid rgba(176,141,87,0.2)`, color: `${PARCHMENT}50` }}>Macro</span>
                  </div>
                </div>
                <p className="text-sm leading-relaxed mt-3 max-w-xl" style={{ color: `${PARCHMENT}70` }}>
                  Global macro focused. Consistent bull on risk assets over 18-month horizon, high-conviction BTC
                  and equity long positions. Contrarian on USD weakness. Tracks EM flows closely.
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4" style={{ borderBottom: '1px solid rgba(176,141,87,0.12)' }}>
              {[
                { label: 'Tweets tracked', val: '1,847' },
                { label: 'Avg conviction', val: 'High' },
                { label: 'Dispatches', val: '3' },
                { label: 'Last active', val: '2h ago' },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className="p-4 text-center"
                  style={{ borderRight: i < 3 ? '1px solid rgba(176,141,87,0.1)' : 'none' }}
                >
                  <div className="text-xl font-bold leading-none mb-1" style={{ fontFamily: 'var(--font-oswald), sans-serif', color: PARCHMENT }}>{s.val}</div>
                  <div className="text-[10px] uppercase tracking-wide font-mono" style={{ color: `${PARCHMENT}35`, fontFamily: 'var(--font-mono)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Positions */}
            <div className="p-5" style={{ borderBottom: '1px solid rgba(176,141,87,0.12)' }}>
              <p className="text-[10px] uppercase tracking-widest font-mono mb-4" style={{ color: `${PARCHMENT}40`, fontFamily: 'var(--font-mono)' }}>
                Current Positions
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { asset: 'BTC', dir: 'LONG', conviction: 'HIGH' },
                  { asset: 'ETH', dir: 'LONG', conviction: 'MED' },
                  { asset: 'USD', dir: 'SHORT', conviction: 'HIGH' },
                  { asset: 'GOLD', dir: 'LONG', conviction: 'MED' },
                ].map((p) => {
                  const isLong = p.dir === 'LONG';
                  const dirColor = isLong ? '#7DB87D' : OXBLOOD;
                  return (
                    <div
                      key={p.asset}
                      className="p-3"
                      style={{
                        border: `1px solid ${dirColor}30`,
                        background: `${dirColor}08`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-oswald), sans-serif', color: PARCHMENT }}>{p.asset}</span>
                        <span className="text-[10px] font-mono" style={{ color: dirColor, fontFamily: 'var(--font-mono)' }}>{p.dir}</span>
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: `${PARCHMENT}30`, fontFamily: 'var(--font-mono)' }}>CONVICTION: {p.conviction}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent takes */}
            <div className="p-5">
              <p className="text-[10px] uppercase tracking-widest font-mono mb-4" style={{ color: `${PARCHMENT}40`, fontFamily: 'var(--font-mono)' }}>
                Recent Takes
              </p>
              <div>
                {[
                  { date: 'Apr 28 · 09:14', text: "Dollar weakness is structural, not cyclical. DXY sub-100 by Q3 is the base case. Risk assets love this.", sentiment: 'BULL' },
                  { date: 'Apr 27 · 17:32', text: "BTC holding 90k on macro fear is the most bullish thing I've seen in two years. This is not 2022.", sentiment: 'BULL' },
                  { date: 'Apr 26 · 11:05', text: "Fed pivots on jobs data. Rate cut in June is back on the table. EM equities about to have a moment.", sentiment: 'NEUTRAL' },
                ].map((t, i, arr) => (
                  <div
                    key={t.date}
                    className="py-3 flex gap-4 items-start"
                    style={{ borderTop: i > 0 ? '1px solid rgba(176,141,87,0.06)' : 'none' }}
                  >
                    <span className="text-[10px] font-mono shrink-0 pt-0.5 w-28" style={{ color: `${PARCHMENT}30`, fontFamily: 'var(--font-mono)' }}>{t.date}</span>
                    <p className="text-sm leading-relaxed flex-1" style={{ color: `${PARCHMENT}75` }}>{t.text}</p>
                    <span className="text-[10px] font-mono shrink-0 pt-0.5" style={{ color: t.sentiment === 'BULL' ? '#7DB87D' : `${PARCHMENT}35`, fontFamily: 'var(--font-mono)' }}>
                      {t.sentiment}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        <div className="pb-12" style={{ borderTop: '1px solid rgba(176,141,87,0.1)', marginTop: '2rem' }} />
      </div>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <h2 className="text-xs uppercase tracking-[0.2em] shrink-0" style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgba(245,239,224,0.35)' }}>
        {children}
      </h2>
      <div className="flex-1 h-px" style={{ background: 'rgba(176,141,87,0.12)' }} />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs mb-3 uppercase tracking-wide" style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgba(245,239,224,0.3)' }}>
      {children}
    </p>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest mb-1" style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgba(176,141,87,0.5)' }}>
      {children}
    </p>
  );
}

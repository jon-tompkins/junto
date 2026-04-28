export default function StylePage() {
  return (
    <main
      className="min-h-screen bg-[#0a0a0a] text-white px-6 py-16"
      style={{ fontFamily: 'var(--font-display), sans-serif' }}
    >
      {/* Subtle grid backdrop */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="max-w-4xl mx-auto space-y-24 relative">

        {/* Header */}
        <div className="border-l-4 border-amber-400 pl-5">
          <p
            className="text-xs text-amber-400/70 uppercase tracking-widest mb-2"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            myjunto / style
          </p>
          <h1
            className="text-6xl font-bold uppercase tracking-tight leading-none mb-3"
            style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
          >
            Design System
          </h1>
          <p className="text-slate-500 text-sm max-w-md">
            Direction: uplifting neo-brutalism. Bold structure, warm amber, sharp edges, no decorative noise.
          </p>
        </div>

        {/* ── Colors ─────────────────────────────── */}
        <section>
          <SectionLabel>01 / Colors</SectionLabel>

          <div className="space-y-10">
            <div>
              <Label>Accent — amber is the proposal. Sky and emerald shown for comparison.</Label>
              <div className="grid grid-cols-3 gap-0 border border-white/10">
                <div className="p-5 border-r border-white/10">
                  <div className="h-12 bg-amber-400 mb-3" />
                  <p className="text-sm font-semibold">Amber <span className="text-amber-400 text-xs">[PROPOSED]</span></p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">#f59e0b · amber-400</p>
                  <p className="text-xs text-slate-600 mt-2">Warm, readable, pops on near-black. Feels premium without being cold.</p>
                </div>
                <div className="p-5 border-r border-white/10 opacity-50">
                  <div className="h-12 bg-sky-400 mb-3" />
                  <p className="text-sm font-semibold text-slate-400">Sky blue</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">#38bdf8 · sky-400</p>
                  <p className="text-xs text-slate-600 mt-2">Cooler, tech-forward. Less distinctive in this space.</p>
                </div>
                <div className="p-5 opacity-50">
                  <div className="h-12 bg-emerald-400 mb-3" />
                  <p className="text-sm font-semibold text-slate-400">Emerald</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">#34d399 · emerald-400</p>
                  <p className="text-xs text-slate-600 mt-2">Finance/growth connotation. Could work for bullish signals.</p>
                </div>
              </div>
            </div>

            <div>
              <Label>Background scale</Label>
              <div className="flex border border-white/10 overflow-hidden">
                {[
                  { label: 'Page', bg: '#0a0a0a' },
                  { label: 'Surface', bg: '#111111' },
                  { label: 'Raised', bg: '#1a1a1a' },
                  { label: 'Hover', bg: '#222222' },
                  { label: 'Border', bg: 'rgba(255,255,255,0.08)' },
                ].map((c, i) => (
                  <div key={c.label} className="flex-1 p-4 border-r border-white/10 last:border-0">
                    <div className="h-8 mb-3 border border-white/10" style={{ background: c.bg }} />
                    <p className="text-xs font-semibold">{c.label}</p>
                    <p className="text-[10px] text-slate-600 font-mono mt-0.5">{c.bg}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Text scale</Label>
              <div className="border border-white/10 divide-y divide-white/5">
                {[
                  { label: 'Primary', cls: 'text-white', s: 'Market intelligence from signal.' },
                  { label: 'Secondary', cls: 'text-slate-400', s: 'Market intelligence from signal.' },
                  { label: 'Muted', cls: 'text-slate-500', s: 'Market intelligence from signal.' },
                  { label: 'Disabled', cls: 'text-slate-700', s: 'Market intelligence from signal.' },
                  { label: 'Accent', cls: 'text-amber-400', s: 'Market intelligence from signal.' },
                  { label: 'Danger', cls: 'text-red-400', s: 'Market intelligence from signal.' },
                  { label: 'Bull', cls: 'text-emerald-400', s: 'Market intelligence from signal.' },
                  { label: 'Bear', cls: 'text-red-400', s: 'Market intelligence from signal.' },
                ].map((t) => (
                  <div key={t.label} className="flex items-center px-4 py-3 gap-8">
                    <span className="text-xs text-slate-600 w-20 shrink-0 font-mono">{t.label}</span>
                    <span className={`text-sm ${t.cls}`}>{t.s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Typography ─────────────────────────── */}
        <section>
          <SectionLabel>02 / Typography</SectionLabel>
          <div className="space-y-8">

            <div className="border border-white/10 p-6 space-y-6">
              <div>
                <span className="text-[10px] text-slate-600 font-mono uppercase tracking-widest block mb-2">Display / H1 — Oswald 700</span>
                <p
                  className="text-7xl font-bold uppercase leading-none tracking-tight text-white"
                  style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  The Signal.
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 font-mono uppercase tracking-widest block mb-2">H2 — Oswald 600</span>
                <p
                  className="text-4xl font-semibold uppercase tracking-tight"
                  style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  Curated Intelligence
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 font-mono uppercase tracking-widest block mb-2">H3 — Oswald 500</span>
                <p
                  className="text-2xl font-medium uppercase tracking-wide"
                  style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  Analyst Profiles
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 font-mono uppercase tracking-widest block mb-2">Body — System sans, 16px</span>
                <p className="text-base text-slate-400 leading-relaxed max-w-lg">
                  AI synthesizes everything into a brief worth reading. Daily, twice daily, or weekly — delivered wherever you want it. Signal from the sources that actually move markets.
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 font-mono uppercase tracking-widest block mb-2">Mono — IBM Plex Mono</span>
                <p
                  className="text-sm text-amber-400/80"
                  style={{ fontFamily: 'var(--font-mono), monospace' }}
                >
                  01 / DISPATCH · BTC: LONG · CONVICTION: HIGH · UPDATED 14:32 UTC
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 font-mono uppercase tracking-widest block mb-2">Section label</span>
                <p
                  className="text-xs uppercase tracking-[0.2em] text-slate-500"
                  style={{ fontFamily: 'var(--font-mono), monospace' }}
                >
                  Dispatches
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* ── Buttons ────────────────────────────── */}
        <section>
          <SectionLabel>03 / Buttons</SectionLabel>
          <div className="border border-white/10 p-6 space-y-8">

            <div>
              <Label>Primary — amber fill, black text, sharp edges</Label>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  className="px-7 py-3 bg-amber-400 hover:bg-amber-300 text-black font-bold text-sm uppercase tracking-wide transition"
                  style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  Create a Dispatch
                </button>
                <button
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs uppercase tracking-wide transition"
                  style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  Subscribe
                </button>
                <button
                  className="px-7 py-3 bg-amber-400/30 text-black/40 font-bold text-sm uppercase tracking-wide cursor-not-allowed"
                  style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                  disabled
                >
                  Disabled
                </button>
              </div>
            </div>

            <div>
              <Label>Secondary — white border, ghost fill</Label>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  className="px-7 py-3 border-2 border-white/20 hover:border-white/50 text-white hover:text-white font-bold text-sm uppercase tracking-wide transition"
                  style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  Browse Juntos
                </button>
                <button
                  className="px-7 py-3 border-2 border-amber-400/40 hover:border-amber-400 text-amber-400 font-bold text-sm uppercase tracking-wide transition"
                  style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  View Profile
                </button>
              </div>
            </div>

            <div>
              <Label>Ghost / inline</Label>
              <div className="flex flex-wrap gap-6 items-center">
                <button className="text-amber-400 hover:text-amber-300 text-sm font-semibold uppercase tracking-wide transition flex items-center gap-2">
                  Browse all Juntos <span className="text-lg leading-none">→</span>
                </button>
                <button className="text-slate-400 hover:text-white text-sm font-semibold uppercase tracking-wide transition flex items-center gap-2">
                  View all <span className="text-lg leading-none">→</span>
                </button>
              </div>
            </div>

            <div>
              <Label>Destructive</Label>
              <button className="px-7 py-3 border-2 border-red-500/30 hover:border-red-500 hover:bg-red-500/10 text-red-400 font-bold text-sm uppercase tracking-wide transition">
                Delete Dispatch
              </button>
            </div>

          </div>
        </section>

        {/* ── Cards / Boxes ──────────────────────── */}
        <section>
          <SectionLabel>04 / Cards &amp; Boxes</SectionLabel>
          <div className="space-y-6">

            <div>
              <Label>Dispatch card — hard border, amber accent on hover</Label>
              <div className="grid md:grid-cols-2 gap-0 border border-white/10">
                <div className="group p-5 border-r border-white/10 hover:bg-white/[0.02] cursor-pointer transition">
                  <div className="flex items-start justify-between mb-3">
                    <h3
                      className="text-lg font-semibold uppercase tracking-wide group-hover:text-amber-400 transition"
                      style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                    >
                      Crypto Daily Brief
                    </h3>
                    <span
                      className="text-[10px] px-2 py-1 border border-white/10 text-slate-500 ml-3 uppercase tracking-wide shrink-0"
                      style={{ fontFamily: 'var(--font-mono), monospace' }}
                    >
                      Daily
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4">Top crypto voices distilled into actionable morning intelligence.</p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <span className="text-[10px] px-2 py-0.5 border border-white/8 text-slate-600 uppercase">crypto</span>
                      <span className="text-[10px] px-2 py-0.5 border border-white/8 text-slate-600 uppercase">defi</span>
                    </div>
                    <span className="text-xs text-slate-600 font-mono">12 sources</span>
                  </div>
                </div>
                <div className="group p-5 hover:bg-white/[0.02] cursor-pointer transition border-l-2 border-l-amber-400">
                  <div className="flex items-start justify-between mb-3">
                    <h3
                      className="text-lg font-semibold uppercase tracking-wide text-amber-400"
                      style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                    >
                      Macro Weekly
                    </h3>
                    <span
                      className="text-[10px] px-2 py-1 border border-amber-400/20 text-amber-400/70 ml-3 uppercase tracking-wide shrink-0"
                      style={{ fontFamily: 'var(--font-mono), monospace' }}
                    >
                      Weekly
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4">Rates, commodities, and global macro from the smartest voices on X.</p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <span className="text-[10px] px-2 py-0.5 border border-amber-400/15 text-amber-400/50 uppercase">macro</span>
                      <span className="text-[10px] px-2 py-0.5 border border-amber-400/15 text-amber-400/50 uppercase">rates</span>
                    </div>
                    <span className="text-xs text-slate-600 font-mono">15 sources</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-2">Left: default state. Right: active/selected state with amber left-border accent.</p>
            </div>

            <div>
              <Label>Stat / pricing box</Label>
              <div className="grid grid-cols-3 border border-white/10 divide-x divide-white/10">
                {[
                  { n: '1,000', label: 'free credits', sub: '$1.00 value' },
                  { n: '1,000', label: 'credits per $1', sub: 'top up anytime' },
                  { n: '50%', label: 'revenue share', sub: 'earn from subscribers' },
                ].map((s) => (
                  <div key={s.label} className="p-6">
                    <div
                      className="text-4xl font-bold text-amber-400 leading-none mb-2"
                      style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                    >
                      {s.n}
                    </div>
                    <div className="text-sm text-white">{s.label}</div>
                    <div className="text-xs text-slate-600 mt-1">{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Notices / callouts</Label>
              <div className="space-y-2">
                <div className="flex gap-3 p-4 border-l-2 border-amber-400 bg-amber-400/5">
                  <span className="text-amber-400 text-xs font-mono uppercase tracking-widest shrink-0 mt-0.5">WARN</span>
                  <p className="text-sm text-amber-300/80">Credits running low. Top up to keep dispatches running.</p>
                </div>
                <div className="flex gap-3 p-4 border-l-2 border-emerald-400 bg-emerald-400/5">
                  <span className="text-emerald-400 text-xs font-mono uppercase tracking-widest shrink-0 mt-0.5">OK</span>
                  <p className="text-sm text-emerald-300/80">Subscribed. First dispatch arrives tomorrow.</p>
                </div>
                <div className="flex gap-3 p-4 border-l-2 border-white/15 bg-white/3">
                  <span className="text-slate-500 text-xs font-mono uppercase tracking-widest shrink-0 mt-0.5">INFO</span>
                  <p className="text-sm text-slate-400">This dispatch runs on daily cadence — 7 sends per week.</p>
                </div>
                <div className="flex gap-3 p-4 border-l-2 border-red-400 bg-red-400/5">
                  <span className="text-red-400 text-xs font-mono uppercase tracking-widest shrink-0 mt-0.5">ERR</span>
                  <p className="text-sm text-red-300/80">Last dispatch failed to generate. Will retry at next cycle.</p>
                </div>
              </div>
            </div>

            <div>
              <Label>Form inputs</Label>
              <div className="space-y-3 max-w-sm border border-white/10 p-5">
                <input
                  type="text"
                  placeholder="Dispatch name"
                  className="w-full bg-transparent border border-white/15 focus:border-amber-400 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition"
                />
                <textarea
                  placeholder="Describe your lens — what angle should this dispatch take?"
                  rows={3}
                  className="w-full bg-transparent border border-white/15 focus:border-amber-400 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition resize-none"
                />
                <select className="w-full bg-[#111] border border-white/15 focus:border-amber-400 px-4 py-2.5 text-sm text-slate-400 outline-none transition">
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
          <div className="border border-white/10 p-6 space-y-6">
            <div>
              <Label>Option A — Oswald, amber accent</Label>
              <span
                className="text-3xl font-bold uppercase tracking-tight"
                style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
              >
                <span className="text-white">MY</span>
                <span className="text-amber-400">JUNTO</span>
              </span>
            </div>
            <div>
              <Label>Option B — Oswald, all white, slash separator</Label>
              <span
                className="text-3xl font-bold uppercase tracking-tight"
                style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
              >
                <span className="text-white">MY</span>
                <span className="text-white/20">/</span>
                <span className="text-white">JUNTO</span>
              </span>
            </div>
            <div>
              <Label>Option C — lowercase, amber dot</Label>
              <span
                className="text-3xl font-bold tracking-tight"
                style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
              >
                <span className="text-white">myjunto</span>
                <span className="text-amber-400">.</span>
              </span>
            </div>
          </div>
        </section>

        {/* ── Analyst Profile Sample ─────────────── */}
        <section>
          <SectionLabel>06 / Analyst Profile — Sample</SectionLabel>
          <p className="text-xs text-slate-500 mb-6">Dummy data. Showing how a profile page / card could look with this system.</p>

          <div className="border border-white/10">

            {/* Profile header */}
            <div className="p-6 border-b border-white/10 flex items-start gap-5">
              <div className="w-16 h-16 bg-[#1a1a1a] border border-white/10 flex items-center justify-center shrink-0">
                <span
                  className="text-2xl font-bold text-amber-400"
                  style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  SW
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2
                      className="text-2xl font-bold uppercase tracking-tight leading-none mb-1"
                      style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                    >
                      Santiago Wolfson
                    </h2>
                    <p
                      className="text-xs text-slate-500 font-mono"
                      style={{ fontFamily: 'var(--font-mono), monospace' }}
                    >
                      @santiagoaufund · tracked since Jan 2025
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 border border-emerald-400/30 text-emerald-400 text-xs font-mono uppercase">
                      Bullish
                    </span>
                    <span className="px-3 py-1 border border-white/10 text-slate-500 text-xs font-mono uppercase">
                      Macro
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-400 mt-3 leading-relaxed max-w-xl">
                  Global macro focused. Consistent bull on risk assets over 18-month horizon, high-conviction BTC and equity long positions. Contrarian on USD weakness. Tracks EM flows closely.
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 divide-x divide-white/10 border-b border-white/10">
              {[
                { label: 'Tweets tracked', val: '1,847' },
                { label: 'Avg conviction', val: 'High' },
                { label: 'Dispatches', val: '3' },
                { label: 'Last active', val: '2h ago' },
              ].map((s) => (
                <div key={s.label} className="p-4 text-center">
                  <div
                    className="text-xl font-bold text-white leading-none mb-1"
                    style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                  >
                    {s.val}
                  </div>
                  <div className="text-[10px] text-slate-600 uppercase tracking-wide font-mono">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Current positions */}
            <div className="p-5 border-b border-white/10">
              <p
                className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mb-4"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Current Positions
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { asset: 'BTC', dir: 'LONG', conviction: 'HIGH', change: '+' },
                  { asset: 'ETH', dir: 'LONG', conviction: 'MED', change: '+' },
                  { asset: 'USD', dir: 'SHORT', conviction: 'HIGH', change: '-' },
                  { asset: 'GOLD', dir: 'LONG', conviction: 'MED', change: '+' },
                ].map((p) => (
                  <div
                    key={p.asset}
                    className={`p-3 border ${p.dir === 'LONG' ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-red-400/20 bg-red-400/5'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-sm font-bold"
                        style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                      >
                        {p.asset}
                      </span>
                      <span className={`text-[10px] font-mono ${p.dir === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {p.dir}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">CONVICTION: {p.conviction}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent takes */}
            <div className="p-5">
              <p
                className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mb-4"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Recent Takes
              </p>
              <div className="space-y-0 divide-y divide-white/5">
                {[
                  {
                    date: 'Apr 28 · 09:14',
                    text: 'Dollar weakness is structural, not cyclical. DXY sub-100 by Q3 is the base case. Risk assets love this.',
                    sentiment: 'bull',
                  },
                  {
                    date: 'Apr 27 · 17:32',
                    text: 'BTC holding 90k on macro fear is the most bullish thing I\'ve seen in two years. This is not 2022.',
                    sentiment: 'bull',
                  },
                  {
                    date: 'Apr 26 · 11:05',
                    text: 'Fed pivots on jobs data. Rate cut in June is back on the table. EM equities about to have a moment.',
                    sentiment: 'neutral',
                  },
                ].map((t) => (
                  <div key={t.date} className="py-3 flex gap-4 items-start">
                    <span
                      className="text-[10px] text-slate-600 font-mono shrink-0 pt-0.5 w-28"
                      style={{ fontFamily: 'var(--font-mono), monospace' }}
                    >
                      {t.date}
                    </span>
                    <p className="text-sm text-slate-400 leading-relaxed flex-1">{t.text}</p>
                    <span className={`text-[10px] font-mono shrink-0 pt-0.5 ${t.sentiment === 'bull' ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {t.sentiment.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        <div className="border-t border-white/5 pb-12" />

      </div>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <h2
        className="text-xs uppercase tracking-[0.2em] text-slate-500 shrink-0"
        style={{ fontFamily: 'var(--font-mono), monospace' }}
      >
        {children}
      </h2>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-slate-600 mb-3 uppercase tracking-wide" style={{ fontFamily: 'var(--font-mono), monospace' }}>
      {children}
    </p>
  );
}

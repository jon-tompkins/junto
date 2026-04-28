export default function StylePage() {
  return (
    <main className="min-h-screen bg-[#080808] text-white px-6 py-16">
      <div className="max-w-4xl mx-auto space-y-20">

        {/* Header */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">myjunto</p>
          <h1 className="text-4xl font-bold mb-2">Style Guide</h1>
          <p className="text-slate-500 text-sm">Proposed design system — review and comment before rolling out sitewide.</p>
        </div>

        {/* ── Colors ─────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-8">Colors</h2>

          <div className="space-y-8">
            {/* Accent options */}
            <div>
              <p className="text-sm text-slate-400 mb-4">
                <strong className="text-white">Accent</strong> — current proposal is amber. Two alternatives below for comparison.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="h-16 rounded-lg bg-amber-400 mb-2" />
                  <p className="text-xs font-medium text-white">Amber <span className="text-slate-500">(current)</span></p>
                  <p className="text-xs text-slate-600 font-mono">#f59e0b</p>
                </div>
                <div>
                  <div className="h-16 rounded-lg bg-sky-400 mb-2" />
                  <p className="text-xs font-medium text-slate-400">Sky blue</p>
                  <p className="text-xs text-slate-600 font-mono">#38bdf8</p>
                </div>
                <div>
                  <div className="h-16 rounded-lg bg-emerald-400 mb-2" />
                  <p className="text-xs font-medium text-slate-400">Emerald</p>
                  <p className="text-xs text-slate-600 font-mono">#34d399</p>
                </div>
              </div>
            </div>

            {/* Background scale */}
            <div>
              <p className="text-sm text-slate-400 mb-4"><strong className="text-white">Backgrounds</strong></p>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'Page', cls: 'bg-[#080808]', hex: '#080808' },
                  { label: 'Surface', cls: 'bg-[#111111]', hex: '#111111' },
                  { label: 'Raised', cls: 'bg-[#1a1a1a]', hex: '#1a1a1a' },
                  { label: 'Border', cls: 'bg-white/8', hex: 'white/8%' },
                  { label: 'Hover', cls: 'bg-white/5', hex: 'white/5%' },
                ].map((c) => (
                  <div key={c.label}>
                    <div className={`h-12 rounded-lg border border-white/10 mb-2 ${c.cls}`} />
                    <p className="text-xs font-medium text-slate-400">{c.label}</p>
                    <p className="text-xs text-slate-600 font-mono">{c.hex}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Text scale */}
            <div>
              <p className="text-sm text-slate-400 mb-4"><strong className="text-white">Text</strong></p>
              <div className="space-y-2">
                {[
                  { label: 'Primary', cls: 'text-white', sample: 'The quick brown fox' },
                  { label: 'Secondary', cls: 'text-slate-400', sample: 'The quick brown fox' },
                  { label: 'Muted', cls: 'text-slate-500', sample: 'The quick brown fox' },
                  { label: 'Disabled', cls: 'text-slate-600', sample: 'The quick brown fox' },
                  { label: 'Accent', cls: 'text-amber-400', sample: 'The quick brown fox' },
                  { label: 'Danger', cls: 'text-red-400', sample: 'The quick brown fox' },
                ].map((t) => (
                  <div key={t.label} className="flex items-center gap-6">
                    <span className="text-xs text-slate-600 w-20 shrink-0">{t.label}</span>
                    <span className={`text-sm ${t.cls}`}>{t.sample}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-white/5" />

        {/* ── Typography ─────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-8">Typography</h2>
          <div className="space-y-6">
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-slate-600 w-24 shrink-0">Display / H1</span>
              <p className="text-5xl font-bold leading-none tracking-tight">The signal.</p>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-slate-600 w-24 shrink-0">H2</span>
              <p className="text-3xl font-bold tracking-tight">Curated intelligence</p>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-slate-600 w-24 shrink-0">H3</span>
              <p className="text-xl font-semibold">Analyst Profiles</p>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-slate-600 w-24 shrink-0">Body</span>
              <p className="text-base text-slate-400 leading-relaxed max-w-md">
                AI synthesizes everything into a brief worth reading. Daily, twice daily, or weekly — delivered wherever you want it.
              </p>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-slate-600 w-24 shrink-0">Small</span>
              <p className="text-sm text-slate-500">12 sources · 847 subscribers</p>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-slate-600 w-24 shrink-0">Label / Cap</span>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Dispatches</p>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-slate-600 w-24 shrink-0">Mono</span>
              <p className="text-xs font-mono text-amber-400/70">01 / 02 / 03</p>
            </div>
          </div>
          <div className="mt-8 p-4 border border-white/5 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Font stack</p>
            <p className="text-sm text-slate-400">
              <span className="text-white">Headings:</span> Space Grotesk (Google Fonts, loaded via next/font) — tracking-tight, letter-spacing -0.02em
            </p>
            <p className="text-sm text-slate-400 mt-1">
              <span className="text-white">Body:</span> System font stack — -apple-system, Segoe UI, Roboto
            </p>
          </div>
        </section>

        <div className="border-t border-white/5" />

        {/* ── Buttons ────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-8">Buttons</h2>
          <div className="space-y-6">

            <div>
              <p className="text-xs text-slate-500 mb-4">Primary — main CTA</p>
              <div className="flex flex-wrap gap-3 items-center">
                <button className="inline-flex items-center justify-center bg-amber-400 hover:bg-amber-300 text-black px-7 py-3 rounded-lg font-semibold transition text-sm">
                  Create a Dispatch
                </button>
                <button className="inline-flex items-center justify-center bg-amber-400 hover:bg-amber-300 text-black px-5 py-2 rounded-lg font-semibold transition text-xs">
                  Small
                </button>
                <button className="inline-flex items-center justify-center bg-amber-400/40 text-black/50 px-7 py-3 rounded-lg font-semibold text-sm cursor-not-allowed" disabled>
                  Disabled
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-4">Secondary — outline</p>
              <div className="flex flex-wrap gap-3 items-center">
                <button className="inline-flex items-center justify-center border border-white/15 hover:border-white/30 text-slate-300 hover:text-white px-7 py-3 rounded-lg font-medium transition text-sm">
                  Browse Juntos
                </button>
                <button className="inline-flex items-center justify-center border border-white/15 hover:border-white/30 text-slate-300 hover:text-white px-5 py-2 rounded-lg font-medium transition text-xs">
                  Small
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-4">Ghost — inline / tertiary</p>
              <div className="flex flex-wrap gap-3 items-center">
                <button className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 text-sm font-medium transition">
                  Browse all Juntos <span>→</span>
                </button>
                <button className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm font-medium transition">
                  View all →
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-4">Destructive</p>
              <div className="flex flex-wrap gap-3 items-center">
                <button className="inline-flex items-center justify-center border border-red-500/30 hover:border-red-500/60 hover:bg-red-500/10 text-red-400 px-7 py-3 rounded-lg font-medium transition text-sm">
                  Delete
                </button>
              </div>
            </div>

          </div>
        </section>

        <div className="border-t border-white/5" />

        {/* ── Cards / Boxes ──────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-8">Cards &amp; Boxes</h2>
          <div className="space-y-6">

            <div>
              <p className="text-xs text-slate-500 mb-4">Content card — e.g. dispatch or junto</p>
              <div className="grid md:grid-cols-2 gap-3">
                {/* Variant A: border only */}
                <div>
                  <p className="text-xs text-slate-600 mb-2">A — border only (current landing)</p>
                  <div className="border border-white/8 hover:border-amber-400/25 rounded-xl p-5 transition cursor-pointer group">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold group-hover:text-amber-400 transition">Crypto Daily Brief</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-slate-500 ml-3">Daily</span>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed">Top crypto voices distilled into actionable morning intelligence.</p>
                    <div className="flex gap-1.5 mt-4">
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-slate-500">crypto</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-slate-500">defi</span>
                    </div>
                  </div>
                </div>

                {/* Variant B: filled surface */}
                <div>
                  <p className="text-xs text-slate-600 mb-2">B — filled surface</p>
                  <div className="bg-[#111] hover:bg-[#161616] border border-white/5 rounded-xl p-5 transition cursor-pointer group">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold group-hover:text-amber-400 transition">Crypto Daily Brief</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-slate-500 ml-3">Daily</span>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed">Top crypto voices distilled into actionable morning intelligence.</p>
                    <div className="flex gap-1.5 mt-4">
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/8 text-slate-500">crypto</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/8 text-slate-500">defi</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-4">Info / stat box</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-white/8 rounded-xl p-5">
                  <div className="text-3xl font-bold mb-1">1,000</div>
                  <div className="text-sm text-slate-400">free credits on signup</div>
                  <div className="text-xs text-slate-600 mt-1">$1.00 value</div>
                </div>
                <div className="border border-white/8 rounded-xl p-5">
                  <div className="text-3xl font-bold mb-1">1,000</div>
                  <div className="text-sm text-slate-400">credits per $1</div>
                  <div className="text-xs text-slate-600 mt-1">top up anytime</div>
                </div>
                <div className="border border-white/8 rounded-xl p-5">
                  <div className="text-3xl font-bold mb-1">50%</div>
                  <div className="text-sm text-slate-400">creator revenue</div>
                  <div className="text-xs text-slate-600 mt-1">earn from subscribers</div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-4">Notice / callout</p>
              <div className="space-y-3">
                <div className="flex gap-3 p-4 rounded-lg bg-amber-400/8 border border-amber-400/15">
                  <span className="text-amber-400 shrink-0 text-sm">⚠</span>
                  <p className="text-sm text-amber-300/80">Your credits are running low. Top up to keep dispatches running.</p>
                </div>
                <div className="flex gap-3 p-4 rounded-lg bg-emerald-400/8 border border-emerald-400/15">
                  <span className="text-emerald-400 shrink-0 text-sm">✓</span>
                  <p className="text-sm text-emerald-300/80">Subscribed. Your first dispatch will arrive tomorrow morning.</p>
                </div>
                <div className="flex gap-3 p-4 rounded-lg bg-white/4 border border-white/8">
                  <span className="text-slate-400 shrink-0 text-sm">ℹ</span>
                  <p className="text-sm text-slate-400">This dispatch runs on the daily cadence — 7 sends per week.</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-4">Form inputs</p>
              <div className="space-y-3 max-w-sm">
                <input
                  type="text"
                  placeholder="Dispatch name"
                  className="w-full bg-transparent border border-white/10 focus:border-amber-400/50 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition"
                />
                <textarea
                  placeholder="Describe your lens — what angle should this dispatch take?"
                  rows={3}
                  className="w-full bg-transparent border border-white/10 focus:border-amber-400/50 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition resize-none"
                />
                <select className="w-full bg-[#111] border border-white/10 focus:border-amber-400/50 rounded-lg px-4 py-2.5 text-sm text-slate-400 outline-none transition">
                  <option>Daily</option>
                  <option>Twice daily</option>
                  <option>Weekly</option>
                </select>
              </div>
            </div>

          </div>
        </section>

        <div className="border-t border-white/5" />

        {/* ── Logo / Nav ─────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-8">Logo &amp; Nav</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-600 mb-3">Option A — amber accent (matches new palette)</p>
              <span className="text-2xl font-bold tracking-tight">
                <span className="text-white">my</span>
                <span className="text-amber-400">junto</span>
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-600 mb-3">Option B — all white, no accent</p>
              <span className="text-2xl font-bold tracking-tight text-white">myjunto</span>
            </div>
            <div>
              <p className="text-xs text-slate-600 mb-3">Option C — white + slash separator</p>
              <span className="text-2xl font-bold tracking-tight">
                <span className="text-white">my</span>
                <span className="text-white/25">/</span>
                <span className="text-white">junto</span>
              </span>
            </div>
          </div>
        </section>

        <div className="border-t border-white/5 pb-12" />

      </div>
    </main>
  );
}

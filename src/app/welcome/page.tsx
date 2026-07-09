'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface Interest {
  key: string;
  label: string;
  description: string;
  defaultTickers: string[];
}

const INTERESTS: Interest[] = [
  {
    key: 'equities',
    label: 'Equity investing',
    description: 'Stocks, ETFs, single names',
    defaultTickers: ['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT'],
  },
  {
    key: 'crypto',
    label: 'Crypto trading',
    description: 'BTC, ETH, alts, on-chain',
    defaultTickers: ['BTC', 'ETH', 'SOL', 'LINK', 'AVAX'],
  },
  {
    key: 'technical',
    label: 'Technical analysis',
    description: 'Levels, momentum, setups',
    defaultTickers: ['SPY', 'QQQ', 'IWM', 'BTC'],
  },
  {
    key: 'fundamentals',
    label: 'Fundamental analysis',
    description: 'Deep-dives, valuation, theses',
    defaultTickers: ['BRK.B', 'COST', 'ASML', 'GOOGL'],
  },
  {
    key: 'macro',
    label: 'Macro',
    description: 'Rates, liquidity, global flows',
    defaultTickers: ['DXY', 'TLT', 'GLD', 'BTC'],
  },
  {
    key: 'smallcaps',
    label: 'Small caps',
    description: 'Under-followed names, asymmetry',
    defaultTickers: ['IWM', 'RKLB', 'IONQ'],
  },
];

interface PresetJunto {
  id: string;
  name: string;
  description: string | null;
  interest_tags: string[];
  source_count: number;
}

const SEND_WINDOWS = [
  { value: 'morning', label: 'Morning (7am local)' },
  { value: 'midday', label: 'Midday (noon local)' },
  { value: 'evening', label: 'Evening (5pm local)' },
];

type Step = 1 | 2 | 3 | 4;

export default function WelcomePage() {
  const { status } = useSession();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [interests, setInterests] = useState<string[]>([]);
  const [presets, setPresets] = useState<PresetJunto[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [selectedJuntoId, setSelectedJuntoId] = useState<string | null>(null);

  const [tickers, setTickers] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState('');

  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [dispatchEmail, setDispatchEmail] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [sendWindow, setSendWindow] = useState('morning');

  const [deliveryEmail, setDeliveryEmail] = useState('');
  const [hasAccountEmail, setHasAccountEmail] = useState(true);

  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/welcome');
    }
  }, [status, router]);

  // Prefill the delivery email from the account (Google supplies one; Twitter
  // doesn't — those users need to enter one here or they get no dispatch).
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/v2/account')
      .then((r) => r.json())
      .then((d) => {
        if (d?.email) {
          setDeliveryEmail(d.email);
          setHasAccountEmail(true);
        } else {
          setHasAccountEmail(false);
        }
      })
      .catch(() => {});
  }, [status]);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(deliveryEmail.trim());

  // When interests change, fetch matching presets and pre-fill tickers
  // from the union of default ticker sets, dedup'd.
  useEffect(() => {
    if (interests.length === 0) {
      setPresets([]);
      return;
    }
    setLoadingPresets(true);
    fetch(`/api/onboarding/wizard/preset-juntos?interests=${interests.join(',')}`)
      .then((r) => r.json())
      .then((d) => setPresets(d.juntos || []))
      .catch(() => setPresets([]))
      .finally(() => setLoadingPresets(false));

    const defaults = new Set<string>();
    for (const key of interests) {
      const i = INTERESTS.find((x) => x.key === key);
      i?.defaultTickers.forEach((t) => defaults.add(t));
    }
    setTickers(Array.from(defaults));
  }, [interests]);

  const toggleInterest = (key: string) => {
    setInterests((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };

  const addTicker = () => {
    const t = tickerInput.trim().toUpperCase().replace(/^\$/, '');
    if (!t) return;
    if (!/^[A-Z0-9.]{1,12}$/.test(t)) return;
    if (tickers.includes(t)) {
      setTickerInput('');
      return;
    }
    setTickers([...tickers, t]);
    setTickerInput('');
  };

  const removeTicker = (t: string) => setTickers(tickers.filter((x) => x !== t));

  const selectedJunto = useMemo(
    () => presets.find((p) => p.id === selectedJuntoId) || null,
    [presets, selectedJuntoId],
  );

  const submit = async () => {
    if (!selectedJuntoId) return;
    if (!disclaimerAccepted) {
      setError('Please confirm you understand myjunto is not financial advice.');
      return;
    }
    if (dispatchEmail && !emailValid) {
      setError('Add a valid email to receive your dispatch — or turn off email delivery.');
      setDeliveryOpen(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/wizard/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interests,
          juntoId: selectedJuntoId,
          tickers,
          dispatchEmail,
          deliveryEmail: deliveryEmail.trim() || undefined,
          audioEnabled,
          sendWindows: [sendWindow],
          disclaimerAccepted: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Setup failed');
        setSubmitting(false);
        return;
      }
      router.push('/today?welcome=1');
    } catch (e: any) {
      setError(e?.message || 'Setup failed');
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return <div className="min-h-screen bg-ink" />;
  }

  return (
    <div className="min-h-screen bg-ink text-parchment">
      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <header className="mb-8">
          <Link href="/" className="text-xs text-brass hover:underline">← Home</Link>
          <div className="flex items-baseline justify-between mt-2">
            <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">
              <span className="text-brass">#</span> Get set up
            </h1>
            <span className="text-xs text-parchment/50 font-mono">Step {step} / 4</span>
          </div>
          <div className="mt-3 h-1 bg-surface rounded">
            <div
              className="h-1 bg-brass rounded transition-all"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </header>

        {error && (
          <div className="mb-6 p-3 rounded border border-red-500/40 bg-red-500/10 text-sm text-red-300">
            {error}
          </div>
        )}

        {step === 1 && (
          <section>
            <h2 className="text-lg font-semibold mb-1">What are you most interested in?</h2>
            <p className="text-sm text-parchment/55 mb-5">Pick up to 3. We&apos;ll match you with the top accounts already in those buckets.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {INTERESTS.map((i) => {
                const on = interests.includes(i.key);
                const atMax = !on && interests.length >= 3;
                return (
                  <button
                    key={i.key}
                    onClick={() => toggleInterest(i.key)}
                    disabled={atMax}
                    className={`text-left p-4 rounded border transition ${
                      on
                        ? 'border-brass bg-brass/10'
                        : atMax
                          ? 'border-[rgb(var(--t-brass) / 0.12)] opacity-40 cursor-not-allowed'
                          : 'border-[rgb(var(--t-brass) / 0.28)] hover:border-[rgb(var(--t-brass) / 0.55)] bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-parchment">{i.label}</span>
                      {on && <span className="text-[10px] text-brass font-mono">SELECTED</span>}
                    </div>
                    <p className="text-xs text-parchment/55">{i.description}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={interests.length === 0}
                className="bg-brass disabled:opacity-30 text-ink px-5 py-2 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)]"
              >
                Next →
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 className="text-lg font-semibold mb-1">Pick your starter junto</h2>
            <p className="text-sm text-parchment/55 mb-5">A curated group of voices in {interests.map(k => INTERESTS.find(i => i.key === k)?.label).filter(Boolean).join(', ')}. You can always change or fork it later.</p>

            {loadingPresets && <div className="text-sm text-parchment/50">Loading…</div>}

            {!loadingPresets && presets.length === 0 && (
              <div className="p-5 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface text-sm text-parchment/65">
                No curated juntos for that combination yet.{' '}
                <Link href="/explore" className="text-brass hover:underline">Browse all public juntos →</Link>
              </div>
            )}

            <div className="space-y-3">
              {presets.map((j) => {
                const on = selectedJuntoId === j.id;
                return (
                  <button
                    key={j.id}
                    onClick={() => setSelectedJuntoId(j.id)}
                    className={`w-full text-left p-4 rounded border transition ${
                      on
                        ? 'border-brass bg-brass/10'
                        : 'border-[rgb(var(--t-brass) / 0.28)] hover:border-[rgb(var(--t-brass) / 0.55)] bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-parchment">{j.name}</span>
                      <span className="text-[10px] text-parchment/45 font-mono">{j.source_count} sources</span>
                    </div>
                    {j.description && (
                      <p className="text-xs text-parchment/55">{j.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {j.interest_tags.map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-brass/15 text-brass font-mono uppercase">{t}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 text-xs text-parchment/45">
              None of these fit? <Link href="/explore" className="text-brass hover:underline">Browse all public juntos</Link>.
            </div>

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep(1)} className="text-sm text-parchment/55 hover:text-parchment">← Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!selectedJuntoId}
                className="bg-brass disabled:opacity-30 text-ink px-5 py-2 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)]"
              >
                Next →
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 className="text-lg font-semibold mb-1">Any tickers you want updates on?</h2>
            <p className="text-sm text-parchment/55 mb-5">We pre-filled some based on your interests. Add or remove as you like — or skip and add them later.</p>

            <div className="flex flex-wrap gap-2 mb-3 min-h-[40px]">
              {tickers.map((t) => (
                <button
                  key={t}
                  onClick={() => removeTicker(t)}
                  className="text-xs px-2 py-1 rounded bg-brass/15 text-brass font-mono hover:bg-red-500/20 hover:text-red-300 transition"
                  title="Click to remove"
                >
                  ${t} ×
                </button>
              ))}
              {tickers.length === 0 && (
                <span className="text-xs text-parchment/40 italic">No tickers added — that&apos;s fine, you can skip.</span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTicker())}
                placeholder="Add ticker (e.g. NVDA)"
                className="flex-1 bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass"
              />
              <button
                onClick={addTicker}
                className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] text-parchment px-4 py-2 rounded text-sm hover:border-brass"
              >
                Add
              </button>
            </div>

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep(2)} className="text-sm text-parchment/55 hover:text-parchment">← Back</button>
              <button
                onClick={() => setStep(4)}
                className="bg-brass text-ink px-5 py-2 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)]"
              >
                Next →
              </button>
            </div>
          </section>
        )}

        {step === 4 && (
          <section>
            <h2 className="text-lg font-semibold mb-1">You&apos;re set.</h2>
            <p className="text-sm text-parchment/55 mb-5">
              Your first dispatch arrives tomorrow morning. Here&apos;s what we&apos;ll send:
            </p>

            <div className="space-y-2 text-sm bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-4">
              <Row label="Junto" value={selectedJunto?.name || '—'} />
              <Row label="Watchlist" value={tickers.length > 0 ? tickers.map((t) => `$${t}`).join(', ') : 'None yet'} />
              <Row label="Email" value={dispatchEmail ? (deliveryEmail.trim() || 'On') : 'Off'} />
              <Row label="Audio" value={audioEnabled ? 'On' : 'Off'} />
              <Row label="When" value={SEND_WINDOWS.find((w) => w.value === sendWindow)?.label || sendWindow} />
            </div>

            {dispatchEmail && (
              <div className="mt-4">
                <label className="text-xs text-parchment/55 font-mono uppercase tracking-wide block mb-1">
                  {hasAccountEmail ? 'Delivery email' : 'Where should we send it?'}
                </label>
                <input
                  type="email"
                  value={deliveryEmail}
                  onChange={(e) => setDeliveryEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass"
                />
                {!hasAccountEmail && (
                  <p className="mt-1 text-xs text-parchment/45">
                    Your account has no email on file — add one so your dispatch can reach you.
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => setDeliveryOpen((o) => !o)}
              className="mt-3 text-xs text-brass hover:underline font-mono uppercase tracking-wide"
            >
              {deliveryOpen ? '▾ Hide delivery options' : '▸ Change delivery options'}
            </button>

            {deliveryOpen && (
              <div className="mt-3 space-y-3 p-4 rounded border border-[rgb(var(--t-brass) / 0.18)] bg-ink">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={dispatchEmail} onChange={(e) => setDispatchEmail(e.target.checked)} />
                  Email
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={audioEnabled} onChange={(e) => setAudioEnabled(e.target.checked)} />
                  Audio (podcast feed + Telegram voice note)
                </label>
                <div>
                  <label className="text-xs text-parchment/55 font-mono uppercase tracking-wide block mb-1">Send window</label>
                  <select
                    value={sendWindow}
                    onChange={(e) => setSendWindow(e.target.value)}
                    className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-1.5 text-sm text-parchment"
                  >
                    {SEND_WINDOWS.map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <label className="mt-6 flex items-start gap-2.5 text-xs text-parchment/65 leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                checked={disclaimerAccepted}
                onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                className="mt-0.5 shrink-0 accent-brass"
              />
              <span>
                I understand myjunto is for informational purposes only and is not financial,
                investment, or trading advice.
              </span>
            </label>

            <div className="mt-8 flex justify-between">
              <button onClick={() => setStep(3)} className="text-sm text-parchment/55 hover:text-parchment">← Back</button>
              <button
                onClick={submit}
                disabled={submitting || !disclaimerAccepted}
                className="bg-brass disabled:opacity-50 text-ink px-6 py-2.5 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)]"
              >
                {submitting ? 'Setting up…' : 'Start receiving'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-[10px] uppercase tracking-wider text-parchment/45 font-mono shrink-0">{label}</span>
      <span className="text-parchment text-right truncate">{value}</span>
    </div>
  );
}

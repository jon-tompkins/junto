'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

interface PreviewMember {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
}

type Stage = 'input' | 'scraping' | 'review' | 'creating' | 'done';

function ListToBriefInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useSession();

  const [stage, setStage] = useState<Stage>('input');
  const [listUrl, setListUrl] = useState(searchParams?.get('url') || '');
  const [name, setName] = useState('');
  const [members, setMembers] = useState<PreviewMember[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v2/prompt-templates')
      .then(r => r.json())
      .then(d => {
        const list: PromptTemplate[] = d.templates || [];
        setTemplates(list);
        if (list[0]) setTemplateId(list[0].id);
      })
      .catch(() => {});
  }, []);

  async function scrape() {
    if (!listUrl.trim()) return;
    setError('');
    setStage('scraping');
    try {
      const res = await fetch('/api/lists/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_url: listUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to scrape list');
        setStage('input');
        return;
      }
      setMembers(data.members || []);
      setRemoved(new Set());
      if (!name.trim()) setName('My List Brief');
      setStage('review');
    } catch (err: any) {
      setError(err?.message || 'Failed to scrape list');
      setStage('input');
    }
  }

  async function create() {
    if (!session?.user) return;
    if (!name.trim()) { setError('Name is required'); return; }
    if (!templateId) { setError('Pick a synthesis style'); return; }
    const keepers = members.filter(m => !removed.has(m.handle));
    if (keepers.length === 0) { setError('Keep at least one source'); return; }

    setError('');
    setStage('creating');
    try {
      const sourceIds: string[] = [];
      for (const m of keepers) {
        const sRes = await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle: m.handle }),
        });
        if (!sRes.ok) continue;
        const sData = await sRes.json();
        if (sData?.id) sourceIds.push(sData.id);
      }
      if (sourceIds.length === 0) throw new Error('Could not add any sources');

      const jRes = await fetch('/api/juntos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${name.trim()} Junto`, source_ids: sourceIds }),
      });
      if (!jRes.ok) throw new Error('Failed to create Junto');
      const jData = await jRes.json();
      const juntoId = jData?.junto?.id;
      if (!juntoId) throw new Error('Failed to create Junto');

      const nRes = await fetch('/api/v2/newsletters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          prompt: '',
          prompt_template_id: templateId,
          labels: [],
          send_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
          default_send_windows: ['morning'],
          is_public: false,
          junto_id: juntoId,
        }),
      });
      if (!nRes.ok) {
        const d = await nRes.json();
        throw new Error(d.error || 'Failed to create dispatch');
      }
      const nData = await nRes.json();
      router.push(`/newsletter/${nData.newsletter.id}`);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
      setStage('review');
    }
  }

  const keeperCount = members.filter(m => !removed.has(m.handle)).length;

  if (authStatus === 'unauthenticated') {
    const back = `/list-to-brief${listUrl ? `?url=${encodeURIComponent(listUrl)}` : ''}`;
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-xl mx-auto px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.2em] mb-3 font-mono" style={{ color: 'rgb(var(--t-brass) / 0.6)' }}>Quick Flow</p>
          <h1 className="text-3xl font-bold uppercase tracking-tight leading-none mb-4" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
            Turn an X list into a daily brief
          </h1>
          <p className="text-sm text-parchment/55 mb-6">
            Sign in to scrape a public list and ship a recurring brief in under a minute.
          </p>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(back)}`}
            className="inline-block px-5 py-2.5 rounded bg-brass text-ink font-bold uppercase tracking-wide hover:bg-brass/85 transition"
            style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-xs uppercase tracking-[0.2em] mb-3 font-mono" style={{ color: 'rgb(var(--t-brass) / 0.6)' }}>Quick Flow</p>
        <h1 className="text-3xl font-bold uppercase tracking-tight leading-none mb-2" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
          X List → Brief
        </h1>
        <p className="text-sm text-parchment/55 mb-8">
          Paste a public X list URL. We surface members who&apos;ve tweeted recently (inactive accounts won&apos;t appear), you review them, and we ship a recurring brief on weekday mornings.
        </p>

        {(stage === 'input' || stage === 'scraping') && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-parchment/55 mb-2" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
                X List URL
              </label>
              <input
                type="text"
                value={listUrl}
                onChange={e => setListUrl(e.target.value)}
                disabled={stage === 'scraping'}
                placeholder="https://x.com/i/lists/1497044363846635523"
                className="w-full bg-surface px-4 py-3 text-sm text-parchment placeholder-parchment/30 focus:outline-none transition disabled:opacity-50"
                style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}
              />
            </div>
            <p className="text-[11px] text-parchment/45">
              Scraping the list can take up to a minute. You&apos;ll review the members before anything is created.
            </p>
            {error && <p className="text-xs text-bear">{error}</p>}
            <button
              onClick={scrape}
              disabled={!listUrl.trim() || stage === 'scraping'}
              className="px-6 py-3 text-sm font-semibold transition disabled:opacity-30"
              style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald, sans-serif)', textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              {stage === 'scraping' ? 'Scraping list…' : 'Scrape list'}
            </button>
          </div>
        )}

        {(stage === 'review' || stage === 'creating') && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-wider text-parchment/55 mb-2" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
                Brief Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={stage === 'creating'}
                className="w-full bg-surface px-4 py-2.5 text-sm text-parchment focus:outline-none transition disabled:opacity-50"
                style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-parchment/55 mb-2" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
                Synthesis Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {templates.map(t => {
                  const selected = templateId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTemplateId(t.id)}
                      disabled={stage === 'creating'}
                      className="text-left px-3 py-2.5 text-xs transition"
                      style={{
                        border: `1px solid ${selected ? 'rgb(var(--t-brass) / 0.55)' : 'rgb(var(--t-brass) / 0.18)'}`,
                        background: selected ? 'rgb(var(--t-brass) / 0.08)' : 'rgb(var(--t-surface))',
                        color: selected ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.6)',
                        fontFamily: 'var(--font-oswald, sans-serif)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-xs uppercase tracking-wider text-parchment/55" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
                  Sources ({keeperCount} of {members.length})
                </label>
                <span className="text-[11px] text-parchment/40">× to remove</span>
              </div>
              <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                {members.map(m => {
                  const isRemoved = removed.has(m.handle);
                  return (
                    <div
                      key={m.handle}
                      className="flex items-center justify-between px-3 py-2 text-xs transition"
                      style={{
                        border: `1px solid ${isRemoved ? 'rgba(232,69,60,0.2)' : 'rgba(62,207,106,0.25)'}`,
                        background: isRemoved ? 'rgba(232,69,60,0.03)' : 'rgba(62,207,106,0.04)',
                        opacity: isRemoved ? 0.4 : 1,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {m.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatarUrl} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-raised flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-mono truncate text-parchment/85">@{m.handle}</div>
                          {m.displayName && <div className="truncate text-[10px] text-parchment/40">{m.displayName}</div>}
                        </div>
                      </div>
                      <button
                        onClick={() => setRemoved(prev => {
                          const next = new Set(prev);
                          if (next.has(m.handle)) next.delete(m.handle);
                          else next.add(m.handle);
                          return next;
                        })}
                        disabled={stage === 'creating'}
                        className="ml-3 flex-shrink-0 text-parchment/40 hover:text-bear transition disabled:opacity-30"
                      >
                        {isRemoved ? '+' : '×'}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-parchment/45 mt-3">
                Need a handle that&apos;s not in the list? You can add more from the dispatch&apos;s edit page after creation.
              </p>
            </div>

            {error && <p className="text-xs text-bear">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={create}
                disabled={stage === 'creating' || keeperCount === 0 || !name.trim()}
                className="px-6 py-3 text-sm font-semibold transition disabled:opacity-30"
                style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald, sans-serif)', textTransform: 'uppercase', letterSpacing: '0.08em' }}
              >
                {stage === 'creating' ? 'Creating…' : `Create brief from ${keeperCount} sources`}
              </button>
              <button
                onClick={() => { setStage('input'); setMembers([]); setRemoved(new Set()); }}
                disabled={stage === 'creating'}
                className="px-4 py-3 text-sm text-parchment/55 hover:text-parchment transition disabled:opacity-30"
              >
                Start over
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ListToBriefPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-ink"><TopNav /></main>}>
      <ListToBriefInner />
    </Suspense>
  );
}

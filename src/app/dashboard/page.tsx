'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { markdownToHtml } from '@/lib/utils/markdown-client';

// ─── Types ──────────────────────────────────────────

interface SubscribedNewsletter {
  id: string;
  newsletter_id: string;
  is_active: boolean;
  delivery_email: string | null;
  send_windows: string[];
  receive_windows: string[];
  receive_days: string[];
  created_at: string;
  newsletter: {
    id: string;
    name: string;
    description: string | null;
    subscriber_count: number;
    send_days?: string[];
  };
}

interface CreatedNewsletter {
  id: string;
  name: string;
  description: string | null;
  subscriber_count: number;
  is_public: boolean;
  created_at: string;
  credit_cost: number | null;
}

interface RunEntry {
  id: string;
  subject: string | null;
  content: string;
  generated_at: string;
  newsletter_id: string;
  newsletter_name?: string;
}

// ─── Constants ──────────────────────────────────────

const WINDOW_OPTIONS = [
  { key: 'morning', label: '6:00 AM', pstLabel: '6 AM PST' },
  { key: 'midday', label: '12:00 PM', pstLabel: '12 PM PST' },
  { key: 'evening', label: '6:00 PM', pstLabel: '6 PM PST' },
  { key: 'night', label: '12:00 AM', pstLabel: '12 AM PST' },
];

const DAY_OPTIONS = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
];

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

// Convert Pacific time hour to user's local timezone label (DST-aware)
function pacificToLocal(pacificHour: number): string {
  // Create a date at the target Pacific hour
  const now = new Date();
  // Get today's date in Pacific time
  const pacificStr = now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [month, day, year] = pacificStr.split('/');
  // Build a date string at the target hour in Pacific
  const targetDate = new Date(`${year}-${month}-${day}T${String(pacificHour).padStart(2, '0')}:00:00`);
  // Get the Pacific offset for this date
  const pacificTime = new Date(targetDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const offsetMs = targetDate.getTime() - pacificTime.getTime();
  const utcDate = new Date(targetDate.getTime() + offsetMs);
  // Display in user's local timezone
  return utcDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const LOCAL_WINDOW_LABELS: Record<string, string> = {
  morning: pacificToLocal(6),
  midday: pacificToLocal(12),
  evening: pacificToLocal(18),
  night: pacificToLocal(0),
};

// ─── Component ──────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [subscriptions, setSubscriptions] = useState<SubscribedNewsletter[]>([]);
  const [created, setCreated] = useState<CreatedNewsletter[]>([]);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'newsletters' | 'subscriptions' | 'history'>('subscriptions');

  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Inline editing state for subscriptions
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editWindows, setEditWindows] = useState<string[]>([]);
  const [editDays, setEditDays] = useState<string[]>([]);
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (session?.user) loadData();
  }, [session]);

  async function loadData() {
    try {
      const [subsRes, createdRes, accountRes] = await Promise.all([
        fetch('/api/v2/dashboard/subscriptions'),
        fetch('/api/v2/dashboard/created'),
        fetch('/api/v2/account'),
      ]);

      if (subsRes.ok) {
        const data = await subsRes.json();
        setSubscriptions(data.subscriptions || []);
      }
      if (createdRes.ok) {
        const data = await createdRes.json();
        setCreated(data.newsletters || []);
      }
      if (accountRes.ok) {
        const data = await accountRes.json();
        setCreditBalance(data.balance ?? null);
        setAccountEmail(data.email ?? null);
        // Redirect to onboarding if not completed
        if (data.isOnboarded === false) {
          router.push('/onboarding');
          return;
        }
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const subsRes = await fetch('/api/v2/dashboard/subscriptions');
      const subsData = subsRes.ok ? await subsRes.json() : { subscriptions: [] };
      const createdRes = await fetch('/api/v2/dashboard/created');
      const createdData = createdRes.ok ? await createdRes.json() : { newsletters: [] };

      const newsletterIds = new Set<string>();
      const nameMap: Record<string, string> = {};

      for (const sub of subsData.subscriptions || []) {
        newsletterIds.add(sub.newsletter.id);
        nameMap[sub.newsletter.id] = sub.newsletter.name;
      }
      for (const nl of createdData.newsletters || []) {
        newsletterIds.add(nl.id);
        nameMap[nl.id] = nl.name;
      }

      const allRuns: RunEntry[] = [];
      await Promise.all(
        Array.from(newsletterIds).map(async (nlId) => {
          try {
            const res = await fetch(`/api/v2/newsletters/${nlId}/runs?limit=10`);
            if (res.ok) {
              const data = await res.json();
              for (const run of data.runs || []) {
                allRuns.push({ ...run, newsletter_id: nlId, newsletter_name: nameMap[nlId] });
              }
            }
          } catch {}
        })
      );

      allRuns.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
      setRuns(allRuns);
    } catch {}
  }

  async function handleSaveEmail() {
    if (!emailInput.trim()) return;
    setSavingEmail(true);
    try {
      const res = await fetch('/api/v2/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      if (res.ok) {
        setAccountEmail(emailInput.trim());
        setEmailInput('');
      }
    } catch {} finally {
      setSavingEmail(false);
    }
  }

  async function handleUpdateSubscription(subId: string) {
    setSaving(true);
    try {
      const body: Record<string, any> = {};
      if (editWindows.length > 0) body.receive_windows = editWindows;
      if (editDays.length > 0) body.receive_days = editDays;
      if (editEmail) body.delivery_email = editEmail;

      const res = await fetch(`/api/v2/subscriptions/${subId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setEditingSubId(null);
        loadData(); // Refresh
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  async function handleToggleSubscription(subId: string, currentActive: boolean) {
    try {
      await fetch(`/api/v2/subscriptions/${subId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      loadData();
    } catch {}
  }

  function startEditSub(sub: SubscribedNewsletter) {
    setEditingSubId(sub.id);
    setEditWindows(sub.receive_windows || sub.send_windows || ['morning']);
    setEditDays(sub.receive_days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    setEditEmail(sub.delivery_email || '');
  }

  function toggleWindow(window: string) {
    setEditWindows(prev =>
      prev.includes(window)
        ? prev.filter(w => w !== window)
        : [...prev, window]
    );
  }

  function toggleDay(day: string) {
    setEditDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  }

  // Switch to history tab and load data
  function switchToHistory() {
    setActiveTab('history');
    if (runs.length === 0) loadHistory();
  }

  const creditColor =
    creditBalance !== null && creditBalance <= 50
      ? 'text-red-400'
      : creditBalance !== null && creditBalance <= 100
        ? 'text-amber-400'
        : 'text-emerald-400';

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Email Collection Banner */}
        {accountEmail === null && !loading && (
          <div className="mb-8 p-4 bg-amber-900/20 border border-amber-700/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-amber-300 font-medium text-sm">Add your email to receive newsletters</p>
              <p className="text-amber-400/60 text-xs mt-0.5">This will be used as the default delivery email for your subscriptions.</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 sm:w-64 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handleSaveEmail}
                disabled={savingEmail || !emailInput.trim()}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
              >
                {savingEmail ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-slate-400">
              Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}.
            </p>
          </div>
          <Link
            href="/create"
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition shadow-lg shadow-blue-600/20 text-sm shrink-0"
          >
            + New Newsletter
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
            <div className={`text-2xl font-bold ${creditColor}`}>
              {creditBalance !== null ? creditBalance.toLocaleString() : '—'}
            </div>
            <div className="text-sm text-slate-400 mt-1">Credits</div>
          </div>
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
            <div className="text-2xl font-bold text-white">{subscriptions.length}</div>
            <div className="text-sm text-slate-400 mt-1">Subscriptions</div>
          </div>
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
            <div className="text-2xl font-bold text-white">{created.length}</div>
            <div className="text-sm text-slate-400 mt-1">My Newsletters</div>
          </div>
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
            <div className="text-2xl font-bold text-white">
              {created.reduce((sum, n) => sum + n.subscriber_count, 0)}
            </div>
            <div className="text-sm text-slate-400 mt-1">Total Subscribers</div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 bg-slate-800/40 rounded-xl p-1 mb-8 w-fit">
          {[
            { key: 'subscriptions', label: `My Subscriptions (${subscriptions.length})` },
            { key: 'newsletters', label: `My Newsletters (${created.length})` },
            { key: 'history', label: 'History' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => tab.key === 'history' ? switchToHistory() : setActiveTab(tab.key as any)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'bg-slate-700 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── My Subscriptions Tab ─────────────────────── */}
        {activeTab === 'subscriptions' && (
          loading ? (
            <LoadingSkeleton />
          ) : subscriptions.length === 0 ? (
            <EmptyState
              icon="mail"
              title="No subscriptions yet"
              subtitle="Discover newsletters to subscribe to."
              actionLabel="Explore Newsletters"
              actionHref="/explore"
            />
          ) : (
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className={`bg-slate-800/30 border rounded-2xl transition-all duration-200 ${
                    sub.is_active ? 'border-slate-700/40' : 'border-slate-700/20 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <Link href={`/newsletter/${sub.newsletter.id}`} className="font-semibold hover:text-blue-400 transition truncate">
                          {sub.newsletter.name}
                        </Link>
                        {!sub.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 shrink-0">
                            Paused
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span>{sub.delivery_email || accountEmail || 'No email set'}</span>
                        <span>·</span>
                        <span>
                          {(sub.receive_windows || sub.send_windows || ['morning']).map(w => LOCAL_WINDOW_LABELS[w] || w).join(', ')}
                        </span>
                        <span>·</span>
                        <span>
                          {(sub.receive_days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']).map(d => DAY_LABELS[d] || d).join(', ')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <button
                        onClick={() => editingSubId === sub.id ? setEditingSubId(null) : startEditSub(sub)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition"
                      >
                        {editingSubId === sub.id ? 'Cancel' : 'Edit'}
                      </button>
                      <button
                        onClick={() => handleToggleSubscription(sub.id, sub.is_active)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition ${
                          sub.is_active
                            ? 'bg-slate-700/50 hover:bg-red-900/30 text-slate-400 hover:text-red-400'
                            : 'bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400'
                        }`}
                      >
                        {sub.is_active ? 'Pause' : 'Reactivate'}
                      </button>
                    </div>
                  </div>

                  {/* Inline edit panel */}
                  {editingSubId === sub.id && (
                    <div className="border-t border-slate-700/30 p-5 space-y-4">
                      {/* Send windows */}
                      <div>
                        <label className="text-xs text-slate-400 font-medium block mb-2">Send times (your local timezone)</label>
                        <div className="flex gap-2 flex-wrap">
                          {WINDOW_OPTIONS.map((w) => (
                            <button
                              key={w.key}
                              onClick={() => toggleWindow(w.key)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                                editWindows.includes(w.key)
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                              }`}
                            >
                              {LOCAL_WINDOW_LABELS[w.key]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Days */}
                      <div>
                        <label className="text-xs text-slate-400 font-medium block mb-2">Days</label>
                        <div className="flex gap-1.5">
                          {DAY_OPTIONS.map((d) => (
                            <button
                              key={d.key}
                              onClick={() => toggleDay(d.key)}
                              className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                                editDays.includes(d.key)
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                              }`}
                              title={DAY_LABELS[d.key]}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Delivery email */}
                      <div>
                        <label className="text-xs text-slate-400 font-medium block mb-2">Delivery email</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder={accountEmail || 'you@example.com'}
                          className="w-full sm:w-80 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <button
                        onClick={() => handleUpdateSubscription(sub.id)}
                        disabled={saving || editWindows.length === 0 || editDays.length === 0}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ─── My Newsletters Tab ───────────────────────── */}
        {activeTab === 'newsletters' && (
          loading ? (
            <LoadingSkeleton />
          ) : created.length === 0 ? (
            <EmptyState
              icon="plus"
              title="No newsletters created"
              subtitle="Create your first newsletter and start building an audience."
              actionLabel="Create Newsletter"
              actionHref="/create"
            />
          ) : (
            <div className="space-y-3">
              {created.map((nl) => (
                <div
                  key={nl.id}
                  className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5 hover:border-slate-600/60 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <Link href={`/newsletter/${nl.id}`} className="font-semibold hover:text-blue-400 transition truncate">
                          {nl.name}
                        </Link>
                        {!nl.is_public && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 shrink-0">
                            Private
                          </span>
                        )}
                      </div>
                      {nl.description && (
                        <p className="text-sm text-slate-400 truncate mb-2">{nl.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>{nl.subscriber_count} subscriber{nl.subscriber_count !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span>~{nl.credit_cost || 5} credits/run (owner cost)</span>
                        <span>·</span>
                        <span>Subscribers earn you ~{Math.round((nl.credit_cost || 5) * 0.25)} credits/send each</span>
                      </div>
                    </div>
                    <Link
                      href={`/newsletter/${nl.id}/edit`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition shrink-0 ml-4"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ─── History Tab ──────────────────────────────── */}
        {activeTab === 'history' && (
          runs.length === 0 && !loading ? (
            <EmptyState
              icon="clock"
              title="No issues yet"
              subtitle="Issues will appear here once newsletters start generating."
            />
          ) : (
            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="bg-slate-800/30 border border-slate-700/40 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                    className="w-full flex items-center justify-between p-5 hover:bg-slate-800/50 transition text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-white truncate">
                          {run.subject || 'Untitled issue'}
                        </h3>
                        {run.newsletter_name && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400 font-medium shrink-0">
                            {run.newsletter_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {new Date(run.generated_at).toLocaleDateString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric',
                          year: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <svg
                      className={`w-5 h-5 text-slate-500 transition-transform shrink-0 ml-4 ${expandedRunId === run.id ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {expandedRunId === run.id && (
                    <div className="border-t border-slate-700/30 p-6">
                      <div
                        className="research-content prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(run.content) }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </main>
  );
}

// ─── Shared Components ──────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-6 animate-pulse">
          <div className="h-5 bg-slate-700 rounded w-1/3 mb-3" />
          <div className="h-3 bg-slate-700/60 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, subtitle, actionLabel, actionHref }: {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  const iconPaths: Record<string, string> = {
    mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    plus: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
    clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  return (
    <div className="text-center py-16 border border-dashed border-slate-700/40 rounded-2xl">
      <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPaths[icon] || iconPaths.mail} />
        </svg>
      </div>
      <p className="text-slate-400 font-medium mb-2">{title}</p>
      <p className="text-slate-500 text-sm mb-6">{subtitle}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-medium transition shadow-lg shadow-blue-600/20"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface Item {
  id: string;
  title: string;
  detail: string | null;
  status: 'backlog' | 'in_progress' | 'done';
  priority: 'low' | 'med' | 'high';
  category: string | null;
  created_at: string;
}

const COLUMNS: { key: Item['status']; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

const PRIO_COLOR: Record<Item['priority'], string> = {
  high: '#e8453c',
  med: '#B08D57',
  low: '#6b7280',
};

export default function AdminBacklogPage() {
  const { status } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [priority, setPriority] = useState<Item['priority']>('med');
  const [category, setCategory] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/admin/backlog')
      .then(async r => {
        if (r.status === 403) throw new Error('You are not a platform admin.');
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json();
      })
      .then(d => setItems(d.items || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [status]);

  async function addItem() {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/admin/backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, detail, priority, category }),
      });
      const d = await res.json();
      if (d.item) {
        setItems(prev => [d.item, ...prev]);
        setTitle(''); setDetail(''); setPriority('med'); setCategory('');
      }
    } finally {
      setAdding(false);
    }
  }

  async function patch(id: string, fields: Partial<Item>) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...fields } : i)));
    await fetch('/api/admin/backlog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    });
  }

  async function move(item: Item, dir: -1 | 1) {
    const order = COLUMNS.map(c => c.key);
    const idx = order.indexOf(item.status);
    const next = order[idx + dir];
    if (!next) return;
    patch(item.id, { status: next });
  }

  async function remove(id: string) {
    if (!confirm('Delete this item?')) return;
    setItems(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/admin/backlog?id=${id}`, { method: 'DELETE' });
  }

  if (status === 'loading' || loading) {
    return <main className="min-h-screen bg-[#080604] text-[#F5EFE0]"><TopNav /><div className="max-w-6xl mx-auto px-6 py-12 text-[#F5EFE0]/45">Loading…</div></main>;
  }
  if (error) {
    return <main className="min-h-screen bg-[#080604] text-[#F5EFE0]"><TopNav /><div className="max-w-6xl mx-auto px-6 py-12 text-[#e8453c]">{error}</div></main>;
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin" className="text-xs text-[#F5EFE0]/45 hover:text-[#F5EFE0]">← Admin</Link>
            <h1 className="text-2xl sm:text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mt-1">Backlog</h1>
          </div>
        </div>

        {/* Add */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-4 mb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="New item title…" className={inputCls} />
            <select value={priority} onChange={e => setPriority(e.target.value as Item['priority'])} className={inputCls}>
              <option value="high">High</option><option value="med">Med</option><option value="low">Low</option>
            </select>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="category (e.g. HL)" className={inputCls} />
          </div>
          <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={2} placeholder="Detail / notes (optional)" className={inputCls} />
          <button onClick={addItem} disabled={adding || !title.trim()} className="px-4 py-2 rounded bg-[#B08D57] text-[#080604] text-sm font-bold uppercase tracking-wide disabled:opacity-50">
            {adding ? 'Adding…' : '+ Add'}
          </button>
        </div>

        {/* Board */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const colItems = items.filter(i => i.status === col.key);
            return (
              <div key={col.key} className="bg-[#0d0b09] border border-[rgba(176,141,87,0.18)] rounded p-3">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)]">{col.label}</span>
                  <span className="text-[10px] text-[#F5EFE0]/30 font-mono">{colItems.length}</span>
                </div>
                <div className="space-y-2">
                  {colItems.length === 0 && <p className="text-xs text-[#F5EFE0]/25 px-1 py-4 text-center">empty</p>}
                  {colItems.map(item => (
                    <div key={item.id} className="bg-[#141210] border border-[rgba(176,141,87,0.22)] rounded p-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: PRIO_COLOR[item.priority] }} title={item.priority} />
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm ${item.status === 'done' ? 'line-through text-[#F5EFE0]/40' : 'text-[#F5EFE0]'}`}>{item.title}</div>
                          {item.detail && <div className="text-xs text-[#F5EFE0]/50 mt-1 whitespace-pre-wrap">{item.detail}</div>}
                          {item.category && <span className="inline-block mt-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#080604] border border-[rgba(176,141,87,0.28)] text-[#B08D57]">{item.category}</span>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#F5EFE0]/8">
                        <div className="flex gap-1">
                          <button onClick={() => move(item, -1)} disabled={item.status === 'backlog'} className="text-xs px-1.5 text-[#F5EFE0]/40 hover:text-[#F5EFE0] disabled:opacity-20">◀</button>
                          <button onClick={() => move(item, 1)} disabled={item.status === 'done'} className="text-xs px-1.5 text-[#F5EFE0]/40 hover:text-[#F5EFE0] disabled:opacity-20">▶</button>
                        </div>
                        <button onClick={() => remove(item.id)} className="text-xs text-[#F5EFE0]/30 hover:text-[#e8453c]">delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

const inputCls = 'w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#B08D57]';

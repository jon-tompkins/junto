'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';

interface ResearchItem {
  filename: string;
  title: string;
  symbol: string | null;
  date: string;
  preview: string;
  size: number;
}

export default function ResearchPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [research, setResearch] = useState<ResearchItem[]>([]);
  const [selected, setSelected] = useState<ResearchItem | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    fetchResearch();
  }, []);

  async function fetchResearch() {
    setLoading(true);
    try {
      const res = await fetch('https://jai-dash.vercel.app/api/research');
      const data = await res.json();
      setResearch(data.research || []);
      if (data.research?.length > 0) {
        loadContent(data.research[0]);
      }
    } catch (e) {
      console.error('Failed to fetch research:', e);
    }
    setLoading(false);
  }

  async function loadContent(item: ResearchItem) {
    setSelected(item);
    try {
      const res = await fetch(`https://jai-dash.vercel.app/api/research?file=${item.filename}`);
      const data = await res.json();
      setContent(data.content || '');
    } catch (e) {
      console.error('Failed to load content:', e);
      setContent('Error loading content');
    }
  }

  // Simple markdown to HTML (basic)
  function renderMarkdown(md: string): string {
    return md
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-8 mb-3 text-white">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-8 mb-4 text-white">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-neutral-800 px-1 rounded text-sm">$1</code>')
      .replace(/^- (.+)$/gm, '<li class="ml-4">• $1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-4">')
      .replace(/^---$/gm, '<hr class="my-6 border-neutral-700" />')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:underline" target="_blank">$1</a>');
  }

  if (status === 'loading' || loading) {
    return (
      <SidebarLayout>
        <div className="p-8 flex items-center justify-center min-h-screen">
          <div className="text-neutral-500">Loading...</div>
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <div className="flex h-screen">
        {/* Research List */}
        <div className="w-80 border-r border-neutral-800 overflow-y-auto">
          <div className="p-4 border-b border-neutral-800">
            <h2 className="text-sm font-medium tracking-wide uppercase text-neutral-400">Research Reports</h2>
            <p className="text-xs text-neutral-600 mt-1">{research.length} reports</p>
          </div>
          <div className="divide-y divide-neutral-800">
            {research.map((item) => (
              <button
                key={item.filename}
                onClick={() => loadContent(item)}
                className={`w-full text-left p-4 transition-colors ${
                  selected?.filename === item.filename
                    ? 'bg-neutral-800'
                    : 'hover:bg-neutral-900'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {item.symbol && (
                    <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-400 rounded">
                      {item.symbol}
                    </span>
                  )}
                  <span className="text-xs text-neutral-500">{item.date}</span>
                </div>
                <div className="text-sm font-medium text-white truncate">
                  {item.title}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <div className="p-8 max-w-4xl">
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  {selected.symbol && (
                    <span className="text-sm px-3 py-1 bg-green-900/50 text-green-400 rounded">
                      {selected.symbol}
                    </span>
                  )}
                  <span className="text-sm text-neutral-500">{selected.date}</span>
                  <span className="text-xs text-neutral-600">{(selected.size / 1024).toFixed(1)}KB</span>
                </div>
                <h1 className="text-2xl font-bold">{selected.title}</h1>
              </div>
              <div 
                className="prose prose-invert prose-sm max-w-none text-neutral-300 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-500">
              Select a research report
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}

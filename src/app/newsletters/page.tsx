'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';

interface Newsletter {
  id: string;
  subject: string;
  content: string;
  generated_at: string;
  tweet_count: number;
}

export default function NewslettersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchNewsletters();
    }
  }, [session]);

  const fetchNewsletters = async () => {
    try {
      const res = await fetch('/api/newsletters');
      const data = await res.json();
      setNewsletters(data.newsletters || []);
    } catch (err) {
      console.error('Failed to fetch newsletters:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (status === 'loading' || loading) {
    return (
      <SidebarLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-neutral-400">Loading...</div>
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <div className="px-8 py-12 max-w-3xl">
        <div className="mb-8">
          <h2 className="text-2xl font-light mb-2">Newsletter Archive</h2>
          <p className="text-neutral-400">
            Your previously generated briefings.
          </p>
        </div>

        {newsletters.length === 0 ? (
          <div className="border border-neutral-800 p-12 text-center">
            <p className="text-neutral-500">No newsletters yet.</p>
            <p className="text-neutral-600 text-sm mt-2">
              Your first briefing will appear here after it's generated.
            </p>
          </div>
        ) : (
          <div className="border border-neutral-800 divide-y divide-neutral-800">
            {newsletters.map((newsletter) => (
              <div key={newsletter.id}>
                {/* Header row */}
                <button
                  onClick={() => toggleExpand(newsletter.id)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-neutral-900/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate pr-4">{newsletter.subject}</div>
                    <div className="text-sm text-neutral-500 mt-1">
                      {formatDate(newsletter.generated_at)} · {newsletter.tweet_count} tweets
                    </div>
                  </div>
                  <div className="text-neutral-500 text-lg">
                    {expandedId === newsletter.id ? '−' : '+'}
                  </div>
                </button>

                {/* Expanded content */}
                {expandedId === newsletter.id && (
                  <div className="px-4 pb-6 pt-2 border-t border-neutral-800 bg-neutral-950">
                    <div 
                      className="text-neutral-300 leading-relaxed whitespace-pre-wrap text-sm"
                      dangerouslySetInnerHTML={{ 
                        __html: formatContent(newsletter.content) 
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}

function formatContent(content: string): string {
  return content
    .replace(/^## (.+)$/gm, '<h3 class="text-lg font-medium mt-6 mb-3 text-white">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 class="font-medium mt-4 mb-2 text-white">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');
}

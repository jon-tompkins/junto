'use client';

import { useState, useRef, useEffect } from 'react';

interface SourceChatProps {
  sourceId?: string;
  handle: string; // display handle, also used to resolve the source server-side
  disabled?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tweetsUsed?: number;
  creditsCharged?: number;
}

export function SourceChat({ sourceId, handle, disabled }: SourceChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    const el = lastMsgRef.current;
    if (!container || !el) return;
    container.scrollTop += el.getBoundingClientRect().top - container.getBoundingClientRect().top;
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;

    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const res = await fetch('/api/v2/source-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, handle, question: q }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        tweetsUsed: data.tweetsUsed,
        creditsCharged: data.creditsCharged,
      }]);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-[rgba(176,141,87,0.18)] bg-[#141210] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-4 py-3 border-b border-[rgba(176,141,87,0.12)] flex items-center justify-between text-left hover:bg-[rgba(176,141,87,0.04)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h3 className="text-sm font-semibold text-[#F5EFE0]">Ask about @{handle}</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#F5EFE0]/40">10 credits/query • Operator/Pro</span>
          <span className={`text-[#F5EFE0]/40 text-xs transition-transform ${collapsed ? '' : 'rotate-180'}`}>▾</span>
        </div>
      </button>

      {!collapsed && (
      <>
      {/* Messages */}
      <div ref={scrollRef} className="h-80 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 text-[#F5EFE0]/30 text-sm">
            <p className="mb-2">Ask about what @{handle} is discussing or positioned in</p>
            <p className="text-xs">e.g. &ldquo;What is their current stance on NVDA?&rdquo;</p>
            <p className="text-xs mt-1">&ldquo;What have they been posting about this week?&rdquo;</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            ref={i === messages.length - 1 ? lastMsgRef : undefined}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[rgba(176,141,87,0.15)] text-[#F5EFE0]'
                  : 'bg-[#1c1a17] text-[#F5EFE0]/90'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.role === 'assistant' && msg.creditsCharged && (
                <div className="mt-1 pt-1 border-t border-[rgba(176,141,87,0.08)] text-[10px] text-[#F5EFE0]/25 flex gap-3">
                  <span>{msg.tweetsUsed} tweets used</span>
                  <span>{msg.creditsCharged} credits</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#1c1a17] rounded-lg px-4 py-3 text-sm text-[#F5EFE0]/40">
              Analyzing @{handle}&rsquo;s content...
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-900/20 border-t border-red-800/30 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-4 py-1.5 border-t border-[rgba(176,141,87,0.08)] text-[10px] text-[#F5EFE0]/20 text-center">
        AI-synthesized from this source&rsquo;s tracked content. Not financial advice. Always DYOR.
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-[rgba(176,141,87,0.12)] flex">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={disabled ? 'Upgrade to Pro or Operator to use source chat' : `Ask about @${handle}...`}
          disabled={disabled || loading}
          maxLength={500}
          className="flex-1 bg-transparent px-4 py-3 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/25 outline-none disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={disabled || loading || !input.trim()}
          className="px-4 text-[#b08d57] hover:text-[#F5EFE0] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          →
        </button>
      </form>
      </>
      )}
    </div>
  );
}

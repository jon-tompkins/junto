'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';

const DEFAULT_PROMPT = `You are a synthesis engine creating a daily intelligence briefing for a crypto/finance professional.

You have access to tweets from a curated group of analysts and thinkers the reader trusts. Your job is to create a newsletter that reads as if these minds collaborated to brief the reader on what matters today.

## Required Structure

SUBJECT: [Punchy subject line]

---

## Sentiment Check

[2-3 sentences on overall mood across all sources. Is sentiment shifting? In what direction? Does this apply to crypto specifically, macro, a particular sector, or broad markets? Note any divergence between sources.]

**Consensus:** [Bullish / Bearish / Mixed / Neutral] on [what specifically]
**Shift from recent:** [More bullish / More bearish / Unchanged / Diverging]

---

## Actionable Intelligence

[What are sources actually doing or recommending? Any specific buys, sells, or positions mentioned? Include:]

- **Ticker mentions with sentiment:** e.g., "$BTC - accumulating (per @handle)" or "$SOL - cautious, reducing exposure"
- **Entry/exit levels** if mentioned
- **Timeframes** if specified

If no specific actionable calls, note what sources are watching or waiting for.

---

## Key Narratives

[Main themes and insights. This is where you synthesize - don't just summarize each person. Find the connections and tensions.]

**Cross-reference where sources align or disagree.**

---

## What's NOT Being Discussed

[Notable silences - what would you expect these sources to be talking about that they're not?]

---

## What to Watch

- [Specific item 1 with why it matters]
- [Specific item 2]
- [Specific item 3]

---

## Guidelines

1. **Be specific** - Include exact tickers, price levels, dates, and percentages when mentioned
2. **Cross-reference aggressively** - Note when multiple sources discuss the same topic
3. **Sentiment over summary** - Focus on how sources FEEL about things
4. **Actionable over analytical** - Prioritize trades, positions, and specific calls

## Tone
- Direct and confident
- Dense with information
- Written for someone who already understands markets
- No filler or generic statements`;

export default function PromptPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchPrompt();
    }
  }, [session]);

  const fetchPrompt = async () => {
    try {
      const res = await fetch('/api/user/prompt');
      const data = await res.json();
      if (data.prompt) {
        setPrompt(data.prompt);
      }
    } catch (err) {
      console.error('Failed to fetch prompt:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/user/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (res.ok) {
        setSuccess('Prompt saved successfully');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save');
      }
    } catch (err) {
      setError('Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(DEFAULT_PROMPT);
    setSuccess('');
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
          <h2 className="text-2xl font-light mb-2">Prompt</h2>
          <p className="text-neutral-400">
            Customize the system prompt used to generate your newsletter.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 border border-red-500 text-red-500 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 border border-green-500 text-green-500 text-sm">
            {success}
          </div>
        )}

        {/* Prompt Editor */}
        <div className="mb-6">
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setSuccess('');
            }}
            className="w-full h-96 px-4 py-3 bg-neutral-950 border border-neutral-700 focus:border-white focus:outline-none transition-colors font-mono text-sm resize-none"
            placeholder="Enter your custom prompt..."
          />
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-8 py-4 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600"
          >
            {saving ? 'Saving...' : 'Save Prompt'}
          </button>
          <button
            onClick={handleReset}
            className="px-8 py-4 border border-neutral-700 hover:border-white transition-colors"
          >
            Reset to Default
          </button>
        </div>

        {/* Tips */}
        <div className="mt-8 p-4 border border-neutral-800 bg-neutral-950 text-sm">
          <div className="font-medium mb-2">Tips</div>
          <ul className="text-neutral-400 space-y-1">
            <li>• Use <code className="text-neutral-300">{"{{keywords}}"}</code> to insert your focus keywords</li>
            <li>• The prompt receives tweets grouped by author</li>
            <li>• Keep the SUBJECT: line format for email subject extraction</li>
          </ul>
        </div>
      </div>
    </SidebarLayout>
  );
}

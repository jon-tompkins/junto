'use client';

import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="mb-10">
          <Link href="/docs" className="text-xs text-[#B08D57] hover:underline">← Docs</Link>
          <h1 className="text-4xl font-bold mt-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> API
          </h1>
          <p className="text-[#F5EFE0]/60 mt-3 max-w-2xl">
            Pay-as-you-go REST API for source profiles, ticker consensus, and public
            dispatches. Charged per call against your credit balance.
          </p>
        </div>

        <Section title="Authentication">
          <p>
            Generate a key at{' '}
            <Link href="/settings/api-keys" className="text-[#B08D57] hover:underline">
              /settings/api-keys
            </Link>
            . Pass it as a bearer token:
          </p>
          <Code>{`Authorization: Bearer mj_live_…`}</Code>
          <p>Keys are shown once at creation — store them somewhere safe. Revoke any time from settings.</p>
        </Section>

        <Section title="Pricing">
          <ul className="space-y-2 text-[#F5EFE0]/80">
            <li><Mono>GET /sources/:handle</Mono> — <strong>1 credit</strong></li>
            <li><Mono>GET /positions/:ticker</Mono> — <strong>1 credit</strong></li>
            <li><Mono>GET /dispatches/:id</Mono> — <strong>5 credits</strong></li>
          </ul>
          <p className="mt-4">
            Credits debit from the key owner's balance. If you hit zero you'll get{' '}
            <Mono>402 Insufficient credits</Mono>. Errors charged at the same rate as
            successes — we don't retry on your behalf.
          </p>
        </Section>

        <Section title="Endpoints">
          <Endpoint
            method="GET"
            path="/api/public/v1/sources/:handle"
            description="Analyst profile for a tracked source: tracked positions with stance, since, optional note. Handle is the X/Twitter handle without the @."
            example={`curl https://www.myjunto.xyz/api/public/v1/sources/crypto_condom \\
  -H "Authorization: Bearer mj_live_…"`}
            response={`{
  "handle": "crypto_condom",
  "display_name": "CryptoCondom",
  "avatar_url": "…",
  "summary": "Contrarian deep-dive analyst…",
  "positions": {
    "BB": { "stance": "bullish", "since": "2026-05-09", "note": "generational make-it trade" },
    "LPTH": { "stance": "bullish", "since": "2026-04-24" }
  },
  "updated_at": "2026-05-26T19:30:00Z"
}`}
          />

          <Endpoint
            method="GET"
            path="/api/public/v1/positions/:ticker"
            description="Cross-source consensus on a ticker: every analyst with a tracked stance, plus aggregate counts."
            example={`curl https://www.myjunto.xyz/api/public/v1/positions/BB \\
  -H "Authorization: Bearer mj_live_…"`}
            response={`{
  "ticker": "BB",
  "source_count": 4,
  "counts": { "bullish": 3, "neutral": 1 },
  "sources": [
    { "handle": "crypto_condom", "stance": "bullish", "since": "2026-05-09" },
    …
  ]
}`}
          />

          <Endpoint
            method="GET"
            path="/api/public/v1/dispatches/:id"
            description="Full content of a single public dispatch (newsletter run). Returns 404 for private dispatches."
            example={`curl https://www.myjunto.xyz/api/public/v1/dispatches/<run_id> \\
  -H "Authorization: Bearer mj_live_…"`}
            response={`{
  "id": "…",
  "newsletter_id": "…",
  "newsletter_name": "Crypto Daily Brief",
  "subject": "Tuesday brief — rotation building",
  "content": "# …",
  "created_at": "2026-05-26T14:00:00Z"
}`}
          />
        </Section>

        <Section title="Errors">
          <ul className="space-y-2 text-[#F5EFE0]/80">
            <li><Mono>401</Mono> — missing, malformed, or revoked key</li>
            <li><Mono>402</Mono> — insufficient credit balance</li>
            <li><Mono>404</Mono> — resource not found or not public</li>
            <li><Mono>500</Mono> — internal error; credit still debited, contact support if persistent</li>
          </ul>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold mb-4 font-[var(--font-oswald)] uppercase tracking-wide">
        <span className="text-[#B08D57]">#</span> {title}
      </h2>
      <div className="space-y-3 text-[#F5EFE0]/80 leading-relaxed text-sm">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-3 text-xs font-mono overflow-x-auto text-[#F5EFE0]/85">
      {children}
    </pre>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs px-1.5 py-0.5 bg-[#141210] rounded text-[#B08D57]">{children}</span>;
}

function Endpoint({
  method,
  path,
  description,
  example,
  response,
}: {
  method: string;
  path: string;
  description: string;
  example: string;
  response: string;
}) {
  return (
    <div className="mb-8 pb-8 border-b border-[rgba(176,141,87,0.18)] last:border-b-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#3ecf6a]/15 text-[#3ecf6a] font-mono">{method}</span>
        <span className="font-mono text-sm text-[#F5EFE0]">{path}</span>
      </div>
      <p className="text-sm text-[#F5EFE0]/65 mb-3">{description}</p>
      <div className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/45 mb-1 mt-3 font-[var(--font-oswald)]">Request</div>
      <Code>{example}</Code>
      <div className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/45 mb-1 mt-3 font-[var(--font-oswald)]">Response</div>
      <Code>{response}</Code>
    </div>
  );
}

import { TopNav } from '@/components/top-nav';

const brass = '#B08D57';
const surface = '#141210';
const raised = '#1c1a17';
const border = 'rgba(176,141,87,0.28)';
const borderInner = 'rgba(176,141,87,0.18)';
const parchment = '#F5EFE0';
const muted = 'rgba(245,239,224,0.5)';
const dimmer = 'rgba(245,239,224,0.3)';

const green = '#3ecf6a';
const greenBg = 'rgba(62,207,106,0.08)';
const greenBorder = 'rgba(62,207,106,0.25)';
const red = '#e8453c';
const redBg = 'rgba(232,69,60,0.08)';
const redBorder = 'rgba(232,69,60,0.3)';
const orange = '#f59e0b';
const orangeBg = 'rgba(245,158,11,0.08)';
const orangeBorder = 'rgba(245,158,11,0.28)';
const blue = '#8899cc';
const blueBg = 'rgba(27,41,81,0.35)';
const blueBorder = 'rgba(27,41,81,0.8)';

function Arrow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
      <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
        <line x1="10" y1="0" x2="10" y2="18" stroke={border} strokeWidth="1.5" />
        <polygon points="10,24 5,14 15,14" fill={brass} opacity="0.6" />
      </svg>
    </div>
  );
}

function ArrowRight() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '0 6px', flexShrink: 0 }}>
      <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
        <line x1="0" y1="10" x2="18" y2="10" stroke={border} strokeWidth="1.5" />
        <polygon points="24,10 14,5 14,15" fill={brass} opacity="0.6" />
      </svg>
    </div>
  );
}

function Badge({ label, color }: { label: string; color?: string }) {
  const styles: Record<string, { bg: string; text: string; bd: string }> = {
    inference: { bg: 'rgba(114,47,55,0.35)', text: '#e07070', bd: 'rgba(114,47,55,0.5)' },
    cron: { bg: blueBg, text: blue, bd: blueBorder },
    data: { bg: greenBg, text: green, bd: greenBorder },
    warn: { bg: orangeBg, text: orange, bd: orangeBorder },
    new: { bg: 'rgba(176,141,87,0.15)', text: brass, bd: border },
    default: { bg: raised, text: muted, bd: borderInner },
  };
  const s = styles[color ?? 'default'];
  return (
    <span style={{
      fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: '3px',
      background: s.bg, color: s.text, border: `1px solid ${s.bd}`,
    }}>
      {label}
    </span>
  );
}

function Box({
  title, subtitle, detail, badges, dimmed, accent,
}: {
  title: string; subtitle?: string; detail?: string;
  badges?: Array<{ label: string; color?: string }>; dimmed?: boolean; accent?: string;
}) {
  const accentBorder = accent ? `1px solid ${accent}40` : `1px solid ${dimmed ? borderInner : border}`;
  return (
    <div style={{
      background: accent ? `${accent}08` : surface,
      border: accentBorder,
      borderRadius: '6px', padding: '12px 16px', opacity: dimmed ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: subtitle || detail ? '4px' : 0 }}>
        <span style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', fontWeight: 600, fontSize: '14px', color: parchment }}>
          {title}
        </span>
        {badges?.map((b, i) => <Badge key={i} label={b.label} color={b.color} />)}
      </div>
      {subtitle && <p style={{ fontSize: '12px', color: muted, margin: 0, marginBottom: detail ? '3px' : 0 }}>{subtitle}</p>}
      {detail && <p style={{ fontSize: '11px', color: dimmer, margin: 0, fontFamily: 'monospace' }}>{detail}</p>}
    </div>
  );
}

function Store({ label, color }: { label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        fontSize: '11px', color: color ? `${color}aa` : dimmer, fontFamily: 'monospace',
        padding: '4px 12px', border: `1px dashed ${color ? `${color}40` : borderInner}`,
        borderRadius: '4px', background: 'rgba(255,255,255,0.01)',
      }}>
        {label}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: brass, margin: '0 0 16px 0',
      fontFamily: 'var(--font-oswald, Oswald, sans-serif)',
    }}>
      {children}
    </p>
  );
}

function ColLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: '10px', color: dimmer, textTransform: 'uppercase',
      letterSpacing: '0.08em', margin: '0 0 12px 0',
    }}>
      {children}
    </p>
  );
}

function FeatureRow({ route, purpose, reads, writes, note }: {
  route: string; purpose: string; reads?: string; writes?: string; note?: string;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '160px 1fr 1fr',
      gap: '12px', padding: '10px 0',
      borderBottom: `1px solid ${borderInner}`,
      alignItems: 'start',
    }}>
      <code style={{ fontSize: '11px', color: brass, fontFamily: 'monospace' }}>{route}</code>
      <div>
        <p style={{ fontSize: '12px', color: parchment, margin: '0 0 2px 0' }}>{purpose}</p>
        {note && <p style={{ fontSize: '11px', color: orange, margin: 0, fontFamily: 'monospace' }}>{note}</p>}
      </div>
      <div>
        {reads && <p style={{ fontSize: '11px', color: muted, margin: '0 0 2px 0' }}>reads: {reads}</p>}
        {writes && <p style={{ fontSize: '11px', color: dimmer, margin: 0 }}>writes: {writes}</p>}
      </div>
    </div>
  );
}

function IssueCard({ title, detail, severity }: { title: string; detail: string; severity: 'warn' | 'info' | 'critical' }) {
  const color = severity === 'critical' ? red : severity === 'warn' ? orange : blue;
  const bg = severity === 'critical' ? redBg : severity === 'warn' ? orangeBg : blueBg;
  const bd = severity === 'critical' ? redBorder : severity === 'warn' ? orangeBorder : blueBorder;
  return (
    <div style={{
      background: bg, border: `1px solid ${bd}`, borderRadius: '6px', padding: '12px 16px',
    }}>
      <p style={{ fontSize: '12px', fontWeight: 600, color, margin: '0 0 4px 0', fontFamily: 'var(--font-oswald, sans-serif)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </p>
      <p style={{ fontSize: '12px', color: muted, margin: 0 }}>{detail}</p>
    </div>
  );
}

export default function FlowPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#080604', color: parchment }}>
      <TopNav />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px 100px' }}>

        {/* Header */}
        <div style={{ marginBottom: '48px', borderLeft: `4px solid ${brass}`, paddingLeft: '20px' }}>
          <p style={{ fontSize: '10px', color: `${brass}99`, textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 6px 0', fontFamily: 'monospace' }}>
            Platform Architecture
          </p>
          <h1 style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', fontSize: '36px', fontWeight: 700, color: parchment, margin: '0 0 10px 0', letterSpacing: '-0.02em' }}>
            System Map
          </h1>
          <p style={{ fontSize: '14px', color: muted, margin: 0, maxWidth: '520px' }}>
            Every feature, how they connect, and what to simplify. Core loop: curated Twitter voices → AI synthesis → subscriber inboxes.
          </p>
        </div>

        {/* ── USER JOURNEYS ──────────────────────────────────────── */}
        <div style={{ marginBottom: '56px' }}>
          <SectionLabel>01 — User Journeys</SectionLabel>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>

            {/* Creator */}
            <div>
              <ColLabel>Curator</ColLabel>
              <Box title="Sign In" subtitle="Twitter or Google OAuth" />
              <Arrow />
              <Box title="Add Sources" subtitle="Twitter handles to follow" />
              <Arrow />
              <Box title="Create Junto" subtitle="Group sources into a collection" />
              <Arrow />
              <Box title="Create Dispatch" subtitle="Name + prompt + cadence (daily / weekly)" />
              <Arrow />
              <Box title="Publish" subtitle="Public = discoverable in /explore" />
              <Arrow />
              <Box title="Earn Credits" subtitle="50% of each subscriber delivery fee" accent={green} />
            </div>

            {/* Consumer */}
            <div>
              <ColLabel>Subscriber</ColLabel>
              <Box title="Discover" subtitle="Browse /explore, junto pages, or direct link" />
              <Arrow />
              <Box title="Preview Dispatch" subtitle="See latest run + sources before subscribing" />
              <Arrow />
              <Box title="Subscribe" subtitle="Choose delivery window(s) and days" />
              <Arrow />
              <Box title="Receive Brief" subtitle="Email (Resend) or Telegram" />
              <Arrow />
              <Box title="Fork (optional)" subtitle="Copy dispatch to own account to customize" dimmed />
            </div>

            {/* Quick Dispatch */}
            <div>
              <ColLabel>Quick Dispatch (Home)</ColLabel>
              <Box title="Open Homepage" subtitle="No account needed to browse" />
              <Arrow />
              <Box title="Select Analysts" subtitle="Pick 1–5 from Featured Junto" />
              <Arrow />
              <Box title="Synthesize" subtitle="5 credits · 1 run per day · requires login" badges={[{ label: 'inference', color: 'inference' }]} />
              <Arrow />
              <Box title="Get Brief" subtitle="Overview · Agreements · Per-analyst insights" />
              <Arrow />
              <Box title="Subscribe (CTA)" subtitle="Discover full dispatches from these analysts" dimmed />
            </div>

          </div>
        </div>

        {/* ── CONTENT PIPELINE ───────────────────────────────────── */}
        <div style={{ marginBottom: '56px' }}>
          <SectionLabel>02 — Content Pipeline (Every 6h)</SectionLabel>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            {/* Pull phase */}
            <div>
              <ColLabel>Phase 1 — Collect (0:45, 6:45, 12:45, 18:45 UTC)</ColLabel>
              <Box
                title="pull-content"
                subtitle="Starts Apify batch job for all active sources"
                detail="/api/cron/pull-content"
                badges={[{ label: 'cron', color: 'cron' }]}
              />
              <Arrow />
              <Store label="apify_batch_runs" />
              <Arrow />
              <Box
                title="collect-twitter"
                subtitle="Polls Apify results, stores tweets, backfills source metadata (avatar, display name)"
                detail="/api/cron/collect-twitter · runs 5min after pull, then every 5min"
                badges={[{ label: 'cron', color: 'cron' }]}
              />
              <Arrow />
              <Store label="content_twitter" color={green} />
              <Arrow />
              <Box
                title="Profile Updater"
                subtitle="Haiku re-analyzes stale analyst profiles (>48h). Extracts positions from tweets."
                badges={[{ label: 'inference', color: 'inference' }]}
              />
              <Arrow />
              <Store label="source_analyst_profiles" color={green} />
            </div>

            {/* Generate phase */}
            <div>
              <ColLabel>Phase 2 — Synthesize & Send</ColLabel>
              <Box
                title="generate-newsletters"
                subtitle="Loads due dispatches, reads tweets from junto sources, synthesizes, delivers"
                detail="/api/cron/generate-newsletters"
                badges={[{ label: 'cron', color: 'cron' }, { label: 'inference', color: 'inference' }]}
              />
              <Arrow />
              <div style={{
                padding: '12px 16px',
                background: 'rgba(114,47,55,0.12)',
                border: '1px solid rgba(114,47,55,0.3)',
                borderRadius: '6px',
                marginBottom: '8px',
              }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#e07070', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px 0' }}>
                  Claude Haiku → Synthesis
                </p>
                <p style={{ fontSize: '11px', color: muted, margin: 0 }}>
                  Reads creator&apos;s prompt + recent tweets. Outputs subject + full dispatch HTML.
                  Cost recorded to supplier_costs. Creator earns 50% of delivery credits.
                </p>
              </div>
              <Arrow />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <Box title="Email" subtitle="Resend → subscriber delivery address" />
                <Box title="Telegram" subtitle="Linked chat ID (optional)" />
              </div>
              <Arrow />
              <Store label="newsletter_runs" color={green} />
              <div style={{ marginTop: '16px' }}>
                <Box
                  title="Credit Settlement"
                  subtitle="Subscriber: −(fee). Creator: +(50% of fee). Platform: +(50%)."
                  detail="credit_transactions table"
                  accent={brass}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── FEATURE MAP ────────────────────────────────────────── */}
        <div style={{ marginBottom: '56px' }}>
          <SectionLabel>03 — All Pages &amp; What They Do</SectionLabel>

          <div style={{
            background: surface, border: `1px solid ${border}`, borderRadius: '6px', overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '160px 1fr 1fr',
              gap: '12px', padding: '8px 16px',
              borderBottom: `1px solid ${border}`,
              background: raised,
            }}>
              {['Route', 'Purpose', 'Data flow'].map(h => (
                <p key={h} style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: dimmer, margin: 0 }}>{h}</p>
              ))}
            </div>
            <div style={{ padding: '0 16px' }}>
              <FeatureRow route="/" purpose="Homepage — Quick Dispatch widget + newsletter grid + creator CTA" reads="newsletters_v2, sources (featured junto)" />
              <FeatureRow route="/explore" purpose="Browse all public dispatches" reads="newsletters_v2" note="↔ overlaps with /newsletters" />
              <FeatureRow route="/newsletters" purpose="Same as /explore — list public dispatches" reads="newsletters_v2" note="⚠ redundant with /explore" />
              <FeatureRow route="/create" purpose="Single-page dispatch creation: name → sources → style → schedule → visibility" reads="juntos, sources, prompt_templates" writes="newsletters_v2, junto_sources, sources" />
              <FeatureRow route="/dashboard" purpose="Authenticated hub: subscriptions, my dispatches, history" reads="subscriptions, newsletters_v2, newsletter_runs" />
              <FeatureRow route="/newsletter/[id]" purpose="Dispatch detail — latest run, subscribe, fork" reads="newsletters_v2, newsletter_runs, subscriptions" writes="newsletter_subscriptions" />
              <FeatureRow route="/juntos" purpose="Browse public juntos (source groups)" reads="juntos" />
              <FeatureRow route="/junto/[id]" purpose="Junto detail — sources + attached dispatches" reads="juntos, sources, newsletters_v2" />
              <FeatureRow route="/sources" purpose="Analyst directory — all tracked Twitter accounts with positions" reads="sources, source_analyst_profiles" />
              <FeatureRow route="/sources/[handle]" purpose="Individual analyst profile with AI summary + positions" reads="source_analyst_profiles, content_twitter" />
              <FeatureRow route="/positions" purpose="Aggregated position heatmap across all analysts" reads="source_analyst_profiles (positions JSONB)" />
              <FeatureRow route="/positions/[ticker]" purpose="Per-ticker breakdown — who is bullish/bearish and why" reads="source_analyst_profiles, content_twitter" />
              <FeatureRow route="/theses/new" purpose="Create structured investment thesis (AI-generated draft)" reads="users" writes="theses, thesis_criteria, thesis_trades" note="new feature" />
              <FeatureRow route="/theses" purpose="Browse your saved theses" reads="theses" />
              <FeatureRow route="/theses/[id]" purpose="Thesis detail — criteria, trades, invalidation tracking" reads="theses, thesis_criteria, thesis_trades" />
              <FeatureRow route="/docs/flow" purpose="This page — system architecture map" />
              <FeatureRow route="/admin" purpose="Platform cost dashboard (admin only)" reads="supplier_costs, credit_transactions" />
            </div>
          </div>
        </div>

        {/* ── EXTERNAL INTEGRATIONS ──────────────────────────────── */}
        <div style={{ marginBottom: '56px' }}>
          <SectionLabel>04 — External Services</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {[
              { name: 'Anthropic (Haiku)', role: 'Dispatch synthesis, analyst profiles, quick dispatch, theses', badge: 'inference' },
              { name: 'Apify', role: 'Tweet fetching for all tracked sources (~$0.25/1000 tweets)', badge: 'cron' },
              { name: 'Resend', role: 'Email delivery of dispatches to subscribers', badge: 'default' },
              { name: 'Stripe', role: 'Credit purchases — /credits → checkout → webhook', badge: 'default' },
              { name: 'Supabase', role: 'Postgres DB + auth token storage', badge: 'data' },
              { name: 'Telegram', role: 'Alternative delivery channel (linked per user)', badge: 'default' },
            ].map(s => (
              <Box key={s.name} title={s.name} subtitle={s.role} badges={[{ label: s.badge, color: s.badge }]} />
            ))}
          </div>
        </div>

        {/* ── CREDIT ECONOMICS ───────────────────────────────────── */}
        <div style={{ marginBottom: '56px' }}>
          <SectionLabel>05 — Credit Economics</SectionLabel>
          <div style={{
            background: surface, border: `1px solid ${border}`, borderRadius: '6px', padding: '20px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              {[
                { label: 'New user bonus', value: '1,000', note: 'credits on signup (~$10)' },
                { label: 'Quick dispatch', value: '5', note: 'credits · 1× per day' },
                { label: 'Subscribe delivery', value: '2+', note: 'credits per send (varies)' },
                { label: 'Creator earns', value: '50%', note: 'of each subscriber fee' },
              ].map(item => (
                <div key={item.label}>
                  <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: dimmer, margin: '0 0 4px 0' }}>{item.label}</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, color: brass, fontFamily: 'var(--font-oswald, sans-serif)', margin: '0 0 2px 0' }}>{item.value}</p>
                  <p style={{ fontSize: '11px', color: muted, margin: 0 }}>{item.note}</p>
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${borderInner}`, paddingTop: '16px' }}>
              <p style={{ fontSize: '11px', color: dimmer, margin: 0 }}>
                100 credits = $1.00 · Stripe checkout at /credits · Credit ledger in credit_transactions · Admin cost tracking in supplier_costs
              </p>
            </div>
          </div>
        </div>

        {/* ── QA / REDUNDANCIES ──────────────────────────────────── */}
        <div>
          <SectionLabel>06 — QA Notes · Redundancies &amp; Conflicts</SectionLabel>
          <p style={{ fontSize: '13px', color: muted, margin: '0 0 20px 0' }}>
            Areas to simplify before focusing on growth. Review and cut.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            <IssueCard
              severity="critical"
              title="/explore and /newsletters are duplicates"
              detail="Both pages list public dispatches with essentially the same query. One should be removed or redirected. /explore is the stronger name — keep it."
            />

            <IssueCard
              severity="critical"
              title="Onboarding has no clear first action"
              detail="New users land on the homepage with Quick Dispatch, Browse, and Create all competing for attention. There's no 'Start here' moment. Recommend: sign-in → single guided step (pick 3 analysts you care about) → show them a quick dispatch result immediately."
            />

            <IssueCard
              severity="warn"
              title="v1 and v2 API routes coexist"
              detail="/api/newsletters/* (v1) and /api/v2/newsletters/* both exist and may be serving the same data. v1 should be audited and removed to avoid drift. Pages should consistently use v2."
            />

            <IssueCard
              severity="warn"
              title="Juntos as a concept adds friction for new users"
              detail="'Junto' is not immediately intuitive. New users need to understand Juntos before they can create a dispatch. Consider surfacing it only as 'Source Group' with Junto as an optional advanced concept, or hiding it entirely from the creation flow."
            />

            <IssueCard
              severity="warn"
              title="Theses is a separate paradigm — consider positioning carefully"
              detail="The Theses feature (investment thesis tracker) is orthogonal to the newsletter platform. It shares the same nav but targets a different use case. This could confuse new users. Either position it clearly as a power feature for investors, or give it its own nav section."
            />

            <IssueCard
              severity="warn"
              title="Watchlists integration is unclear"
              detail="There are watchlist tables, a watchlist-scrape cron, and star endpoints, but it's not obvious how watchlists connect to the dispatch or thesis flow. If not actively used, consider removing to reduce surface area."
            />

            <IssueCard
              severity="info"
              title="Quick Dispatch depends on 'Featured' junto — no fallback"
              detail="If the 'featured' junto (case-insensitive name match) is empty or missing, Quick Dispatch fails silently or shows nothing. Add a fallback: show top 5 sources by dispatch subscriber count, or show a setup prompt for admins."
            />

            <IssueCard
              severity="info"
              title="Credit complexity — three separate contexts"
              detail="Credits are deducted for: Quick Dispatch (5/run), scheduled dispatch delivery (2+/send), and earned by creators (50% of fees). New users may not understand why credits are being consumed. Recommend: single clear explainer modal on first credit spend."
            />

            <IssueCard
              severity="info"
              title="Flow page referenced 'xAI Grok-3-fast' — now using Claude Haiku"
              detail="Thesis ingest was just switched to Claude Sonnet. Dispatch synthesis uses Haiku. This page has been updated, but any other copy (docs, CLAUDE.md, onboarding) should reflect the Anthropic stack."
            />

          </div>
        </div>

      </div>
    </div>
  );
}

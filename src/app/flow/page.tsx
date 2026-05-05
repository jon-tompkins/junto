import { TopNav } from '@/components/top-nav';

const brass = '#B08D57';
const surface = '#141210';
const raised = '#1c1a17';
const border = 'rgba(176,141,87,0.28)';
const borderInner = 'rgba(176,141,87,0.18)';
const parchment = '#F5EFE0';
const muted = 'rgba(245,239,224,0.5)';
const dimmer = 'rgba(245,239,224,0.3)';

function Arrow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
      <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
        <line x1="10" y1="0" x2="10" y2="18" stroke={border} strokeWidth="1.5"/>
        <polygon points="10,24 5,14 15,14" fill={brass} opacity="0.6"/>
      </svg>
    </div>
  );
}

function ArrowRight() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '0 8px' }}>
      <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
        <line x1="0" y1="10" x2="18" y2="10" stroke={border} strokeWidth="1.5"/>
        <polygon points="24,10 14,5 14,15" fill={brass} opacity="0.6"/>
      </svg>
    </div>
  );
}

function Badge({ label, color }: { label: string; color?: string }) {
  return (
    <span style={{
      fontSize: '9px',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      padding: '2px 7px',
      borderRadius: '3px',
      background: color === 'inference' ? 'rgba(114,47,55,0.35)' : color === 'cron' ? 'rgba(27,41,81,0.5)' : raised,
      color: color === 'inference' ? '#e07070' : color === 'cron' ? '#8899cc' : muted,
      border: `1px solid ${color === 'inference' ? 'rgba(114,47,55,0.5)' : color === 'cron' ? 'rgba(27,41,81,0.8)' : borderInner}`,
    }}>
      {label}
    </span>
  );
}

function Box({
  title,
  subtitle,
  detail,
  badges,
  dimmed,
}: {
  title: string;
  subtitle?: string;
  detail?: string;
  badges?: Array<{ label: string; color?: string }>;
  dimmed?: boolean;
}) {
  return (
    <div style={{
      background: surface,
      border: `1px solid ${dimmed ? borderInner : border}`,
      borderRadius: '6px',
      padding: '12px 16px',
      opacity: dimmed ? 0.65 : 1,
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

function Store({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
    }}>
      <div style={{
        fontSize: '11px',
        color: dimmer,
        fontFamily: 'monospace',
        padding: '4px 12px',
        border: `1px dashed ${borderInner}`,
        borderRadius: '4px',
        background: 'rgba(255,255,255,0.01)',
      }}>
        {label}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: '10px',
      fontWeight: 700,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: brass,
      margin: '0 0 16px 0',
      fontFamily: 'var(--font-oswald, Oswald, sans-serif)',
    }}>
      {children}
    </p>
  );
}

export default function FlowPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#080604', color: parchment }}>
      <TopNav />

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 24px 80px' }}>

        <div style={{ marginBottom: '40px' }}>
          <h1 style={{
            fontFamily: 'var(--font-oswald, Oswald, sans-serif)',
            fontSize: '28px',
            fontWeight: 700,
            color: parchment,
            margin: '0 0 8px 0',
            letterSpacing: '-0.02em',
          }}>
            System Flow
          </h1>
          <p style={{ fontSize: '14px', color: muted, margin: 0 }}>
            How content moves through MyJunto — from sources to subscriber inboxes.
          </p>
        </div>

        {/* ── USER FLOWS ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: '48px' }}>
          <SectionLabel>User Flows</SectionLabel>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

            {/* Creator path */}
            <div>
              <p style={{ fontSize: '11px', color: dimmer, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px 0' }}>Creator</p>
              <Box title="Sign up / Log in" subtitle="Twitter or Google OAuth" />
              <Arrow />
              <Box title="Create Dispatch" subtitle="Name, prompt, cadence, credit cost" />
              <Arrow />
              <Box title="Add Sources" subtitle="Twitter accounts, Junto (shared source group)" />
              <Arrow />
              <Box title="Set Labels" subtitle="Topic tags for filtering & search" />
              <Arrow />
              <Box title="Publish" subtitle="Make public — appears in Explore" />
            </div>

            {/* Subscriber path */}
            <div>
              <p style={{ fontSize: '11px', color: dimmer, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px 0' }}>Subscriber</p>
              <Box title="Discover" subtitle="Browse Explore, Junto pages, or direct link" />
              <Arrow />
              <Box title="Subscribe" subtitle="Choose delivery window(s) and days" />
              <Arrow />
              <Box title="Pay Credits" subtitle="Per-delivery fee set by creator" />
              <Arrow />
              <Box title="Receive Dispatch" subtitle="Email (Resend) or Telegram" />
              <Arrow />
              <Box title="Fork (optional)" subtitle="Copy dispatch to own account — name gets (Fork) suffix" dimmed />
            </div>

          </div>
        </div>

        {/* ── CONTENT PIPELINE ───────────────────────────────────────── */}
        <div>
          <SectionLabel>Content Pipeline — runs continuously</SectionLabel>

          <Box
            title="pull-content"
            subtitle="Fetches recent tweets for all active source accounts via Apify. Stores raw tweets in content_twitter."
            detail="cron: every 2 hours"
            badges={[{ label: 'Cron', color: 'cron' }]}
          />
          <Arrow />
          <Store label="content_twitter" />
          <Arrow />
          <Box
            title="generate-newsletters"
            subtitle="Reads pending dispatches. For each due dispatch, loads matching tweets from content_twitter, runs synthesis, and delivers."
            detail="cron: every 5 minutes"
            badges={[{ label: 'Cron', color: 'cron' }, { label: 'Inference', color: 'inference' }]}
          />

          {/* Inference detail */}
          <div style={{
            margin: '12px 0',
            padding: '12px 16px',
            background: 'rgba(114,47,55,0.12)',
            border: '1px solid rgba(114,47,55,0.3)',
            borderRadius: '6px',
            marginLeft: '20px',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#e07070', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px 0' }}>
              Inference — xAI Grok-3-fast
            </p>
            <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px 0' }}>
              Synthesizes tweet content into a structured dispatch using the creator&apos;s custom prompt. Generates subject line + body.
            </p>
            <p style={{ fontSize: '11px', color: dimmer, margin: 0, fontFamily: 'monospace' }}>
              Cost recorded to supplier_costs. Creator earns 50% of credit fee.
            </p>
          </div>

          <Arrow />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Box
              title="Email delivery"
              subtitle="Sent via Resend to subscriber's delivery address"
            />
            <Box
              title="Telegram delivery"
              subtitle="Sent to linked Telegram chat ID"
            />
          </div>

          <Arrow />
          <Store label="newsletter_runs (delivery log)" />
        </div>

        {/* ── CREDIT MODEL ───────────────────────────────────────────── */}
        <div style={{ marginTop: '48px' }}>
          <SectionLabel>Credit Economics</SectionLabel>
          <div style={{
            background: surface,
            border: `1px solid ${border}`,
            borderRadius: '6px',
            padding: '16px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              {[
                { label: 'Subscriber pays', value: 'fee per delivery', note: 'set by creator' },
                { label: 'Platform keeps', value: '50%', note: 'covers inference + ops' },
                { label: 'Creator earns', value: '50%', note: 'per delivery' },
              ].map((item) => (
                <div key={item.label}>
                  <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: dimmer, margin: '0 0 4px 0' }}>{item.label}</p>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: brass, fontFamily: 'var(--font-oswald, sans-serif)', margin: '0 0 2px 0' }}>{item.value}</p>
                  <p style={{ fontSize: '11px', color: muted, margin: 0 }}>{item.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

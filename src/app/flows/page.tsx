'use client';

import Link from 'next/link';

const BG = '#080604';
const PANEL = '#0e0c09';
const CREAM = '#F5EFE0';
const DIM = 'rgba(245,239,224,0.55)';
const FAINT = 'rgba(245,239,224,0.35)';
const BRASS = '#B08D57';
const BRASS_DIM = 'rgba(176,141,87,0.28)';
const STROKE = 'rgba(176,141,87,0.45)';

function SectionHeader({ kicker, title, blurb }: { kicker: string; title: string; blurb: string }) {
  return (
    <div className="mb-8">
      <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: BRASS, fontFamily: 'var(--font-mono)' }}>
        {kicker}
      </p>
      <h2 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: CREAM, fontFamily: 'var(--font-oswald)' }}>
        {title}
      </h2>
      <p className="max-w-3xl text-sm md:text-base leading-relaxed" style={{ color: DIM }}>
        {blurb}
      </p>
    </div>
  );
}

function Box({
  x, y, w, h, label, sub, accent,
}: { x: number; y: number; w: number; h: number; label: string; sub?: string; accent?: boolean }) {
  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx={4}
        fill={accent ? 'rgba(176,141,87,0.10)' : PANEL}
        stroke={accent ? BRASS : STROKE}
        strokeWidth={accent ? 1.5 : 1}
      />
      <text
        x={x + w / 2} y={sub ? y + h / 2 - 4 : y + h / 2 + 4}
        textAnchor="middle"
        fontFamily="var(--font-oswald)"
        fontSize={14}
        fontWeight={600}
        fill={CREAM}
      >
        {label}
      </text>
      {sub && (
        <text
          x={x + w / 2} y={y + h / 2 + 13}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize={10}
          fill={FAINT}
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8" markerHeight="8"
          refX="7" refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill={BRASS} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={BRASS} strokeWidth={1.2} markerEnd="url(#arrowhead)" />
      {label && (
        <text
          x={mx} y={my - 6}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize={10}
          fill={DIM}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function ObjectModelDiagram() {
  return (
    <svg viewBox="0 0 900 520" className="w-full h-auto" style={{ maxHeight: 560 }}>
      {/* User */}
      <Box x={380} y={20} w={140} h={56} label="User" sub="signs in via X / Google" accent />

      {/* Junto */}
      <Box x={60} y={150} w={160} h={70} label="Junto" sub="curated source set" />
      {/* Watchlist */}
      <Box x={260} y={150} w={160} h={70} label="Watchlist" sub="tickers to track" />
      {/* Dispatch */}
      <Box x={460} y={150} w={160} h={70} label="Dispatch" sub="prompt + schedule" />
      {/* Subscription */}
      <Box x={660} y={150} w={180} h={70} label="Subscription" sub="user ↔ dispatch + channels" />

      {/* Sources */}
      <Box x={40} y={300} w={200} h={56} label="Sources" sub="X handles, RSS, sites" />
      {/* Tickers */}
      <Box x={260} y={300} w={160} h={56} label="Tickers" sub="symbols" />
      {/* Run */}
      <Box x={460} y={300} w={160} h={56} label="Run" sub="generated brief + audio" />

      {/* Positions */}
      <Box x={150} y={420} w={260} h={60} label="Positions" sub="aggregated stances per ticker, across sources" accent />
      {/* Channels */}
      <Box x={620} y={420} w={240} h={60} label="Delivery" sub="Email · Telegram · Podcast · On-site" />

      {/* User → Junto / Watchlist / Subscription */}
      <Arrow x1={420} y1={76} x2={170} y2={150} label="owns" />
      <Arrow x1={450} y1={76} x2={340} y2={150} label="owns" />
      <Arrow x1={470} y1={76} x2={540} y2={150} label="creates" />
      <Arrow x1={490} y1={76} x2={750} y2={150} label="subscribes" />

      {/* Junto → Sources */}
      <Arrow x1={140} y1={220} x2={140} y2={300} label="contains" />
      {/* Watchlist → Tickers */}
      <Arrow x1={340} y1={220} x2={340} y2={300} label="contains" />
      {/* Dispatch → Run */}
      <Arrow x1={540} y1={220} x2={540} y2={300} label="produces" />

      {/* Dispatch uses junto + watchlist */}
      <Arrow x1={460} y1={185} x2={420} y2={185} label="reads" />
      <Arrow x1={620} y1={185} x2={660} y2={185} label="" />

      {/* Run → Delivery (via subscription) */}
      <Arrow x1={620} y1={328} x2={740} y2={420} label="fans out" />

      {/* Sources → Positions */}
      <Arrow x1={170} y1={356} x2={250} y2={420} label="stances" />
      {/* Tickers → Positions */}
      <Arrow x1={340} y1={356} x2={310} y2={420} label="" />
    </svg>
  );
}

function OnboardingFlowDiagram() {
  return (
    <svg viewBox="0 0 900 380" className="w-full h-auto" style={{ maxHeight: 420 }}>
      <Box x={20} y={30} w={140} h={56} label="Sign in" sub="X or Google" accent />
      <Box x={200} y={30} w={160} h={56} label="Pick junto mode" sub="own follows · list · public · manual" />
      <Box x={400} y={30} w={160} h={56} label="Seed watchlist" sub="comma-sep tickers" />
      <Box x={600} y={30} w={160} h={56} label="Pick channels" sub="Email · TG · Podcast" />

      <Arrow x1={160} y1={58} x2={200} y2={58} />
      <Arrow x1={360} y1={58} x2={400} y2={58} />
      <Arrow x1={560} y1={58} x2={600} y2={58} />

      <Box x={80} y={160} w={200} h={70} label="Junto created" sub="${handle}'s Junto by default" />
      <Box x={320} y={160} w={200} h={70} label="Watchlist created" sub="${handle}'s Watchlist" />
      <Box x={560} y={160} w={220} h={70} label="Personal Dispatch created" sub="Investment Brief template" accent />

      <Arrow x1={250} y1={86} x2={170} y2={160} />
      <Arrow x1={470} y1={86} x2={420} y2={160} />
      <Arrow x1={690} y1={86} x2={670} y2={160} />

      <Box x={280} y={290} w={340} h={60} label="First send queued at next window" sub="6 AM · 12 PM · 6 PM · 12 AM Pacific" accent />
      <Arrow x1={180} y1={230} x2={400} y2={290} />
      <Arrow x1={420} y1={230} x2={460} y2={290} />
      <Arrow x1={670} y1={230} x2={500} y2={290} />
    </svg>
  );
}

function DispatchFlowDiagram() {
  return (
    <svg viewBox="0 0 900 420" className="w-full h-auto" style={{ maxHeight: 460 }}>
      <Box x={20} y={20} w={180} h={60} label="Refresh cron" sub="every 6 hours" accent />
      <Box x={240} y={20} w={200} h={60} label="Pull source content" sub="X / RSS / sites → DB" />
      <Box x={480} y={20} w={200} h={60} label="Store content" sub="content_twitter, content_*" />

      <Arrow x1={200} y1={50} x2={240} y2={50} />
      <Arrow x1={440} y1={50} x2={480} y2={50} />

      <Box x={20} y={140} w={200} h={60} label="Send window cron" sub="4× daily Pacific" accent />
      <Box x={260} y={140} w={220} h={60} label="Gather inputs" sub="fresh content + watchlist + prompt" />
      <Box x={520} y={140} w={200} h={60} label="Grok synthesis" sub="grok-3-fast" />

      <Arrow x1={220} y1={170} x2={260} y2={170} />
      <Arrow x1={480} y1={170} x2={520} y2={170} />

      <Box x={300} y={260} w={220} h={60} label="Audio script (optional)" sub="Claude Haiku 4.5" />
      <Box x={560} y={260} w={200} h={60} label="Render audio" sub="ElevenLabs → mp3" />

      <Arrow x1={620} y1={200} x2={410} y2={260} label="if voice" />
      <Arrow x1={520} y1={290} x2={560} y2={290} />

      <Box x={300} y={360} w={420} h={50} label="Run row written, fan out to subscribers" accent />
      <Arrow x1={620} y1={200} x2={620} y2={360} label="text" />
      <Arrow x1={660} y1={320} x2={580} y2={360} label="audio_url" />
    </svg>
  );
}

function ConsumptionFlowDiagram() {
  return (
    <svg viewBox="0 0 900 320" className="w-full h-auto" style={{ maxHeight: 360 }}>
      <Box x={340} y={30} w={220} h={60} label="Run" sub="one per dispatch per window" accent />

      <Box x={40} y={180} w={170} h={70} label="Email" sub="Resend · myjunto.xyz" />
      <Box x={240} y={180} w={170} h={70} label="Telegram" sub="text + voice memo" />
      <Box x={440} y={180} w={170} h={70} label="Podcast" sub="user-private RSS" />
      <Box x={640} y={180} w={220} h={70} label="On-site permalink" sub="/today, /d/[id]" />

      <Arrow x1={400} y1={90} x2={125} y2={180} />
      <Arrow x1={430} y1={90} x2={325} y2={180} />
      <Arrow x1={470} y1={90} x2={525} y2={180} />
      <Arrow x1={500} y1={90} x2={750} y2={180} />
    </svg>
  );
}

function DiagramFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-sm p-5 md:p-7 mb-10"
      style={{ background: PANEL, border: `1px solid ${BRASS_DIM}` }}
    >
      <h3 className="text-lg mb-4" style={{ color: CREAM, fontFamily: 'var(--font-oswald)', fontWeight: 600 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function FlowsPage() {
  return (
    <main style={{ background: BG, minHeight: '100vh' }}>
      <div className="container mx-auto px-4 py-12 md:py-16 max-w-6xl">
        {/* Hero */}
        <div className="mb-14">
          <p className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: BRASS, fontFamily: 'var(--font-mono)' }}>
            Flows
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: CREAM, fontFamily: 'var(--font-oswald)' }}>
            How myjunto fits together
          </h1>
          <p className="max-w-2xl text-base md:text-lg leading-relaxed" style={{ color: DIM }}>
            A map of the objects, the onboarding path, how a dispatch is generated, and how it reaches you.
            For prose explanations, see <Link href="/docs" style={{ color: BRASS }}>the docs</Link>.
          </p>
        </div>

        {/* Object model */}
        <SectionHeader
          kicker="01 · Object model"
          title="The pieces"
          blurb="Every dispatch is a tuple: a Junto (who to listen to), a Watchlist (what to watch), and a prompt (what to ask). A Subscription connects a User to a Dispatch via one or more channels. Positions are a derived view across sources and tickers."
        />
        <DiagramFrame title="Users · Juntos · Watchlists · Dispatches · Runs · Positions">
          <ObjectModelDiagram />
        </DiagramFrame>

        {/* Onboarding */}
        <SectionHeader
          kicker="02 · Onboarding"
          title="From sign-in to first send"
          blurb="Every new user gets a personal Junto, a personal Watchlist, and a personal Dispatch pre-wired with the Investment Brief template. The first send lands at the next active window."
        />
        <DiagramFrame title="Onboarding flow">
          <OnboardingFlowDiagram />
        </DiagramFrame>

        {/* Dispatch generation */}
        <SectionHeader
          kicker="03 · Dispatch generation"
          title="How a Run is built"
          blurb="Source content refreshes every 6 hours. At each send window the dispatch gathers fresh content, the user's watchlist, and its prompt, then hands it to Grok. Voice dispatches also get a Haiku-written audio script rendered by ElevenLabs."
        />
        <DiagramFrame title="Refresh + synthesis + render">
          <DispatchFlowDiagram />
        </DiagramFrame>

        {/* Consumption */}
        <SectionHeader
          kicker="04 · Consumption"
          title="One Run, many channels"
          blurb="A Run is generated once per dispatch per window and reused across every subscriber. Each subscription decides which channels it wants — email, Telegram (text + voice), private podcast feed, on-site, or all of the above."
        />
        <DiagramFrame title="Delivery fan-out">
          <ConsumptionFlowDiagram />
        </DiagramFrame>

        {/* CTA */}
        <div
          className="rounded-sm p-6 md:p-8 mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
          style={{ background: PANEL, border: `1px solid ${BRASS_DIM}` }}
        >
          <div>
            <h3 className="text-xl mb-1" style={{ color: CREAM, fontFamily: 'var(--font-oswald)', fontWeight: 600 }}>
              Want the words behind the boxes?
            </h3>
            <p className="text-sm" style={{ color: DIM }}>
              The docs walk through each object, the schedule, pricing, and the synthesis layer in detail.
            </p>
          </div>
          <Link
            href="/docs"
            className="px-5 py-2 rounded-sm text-sm font-semibold uppercase tracking-wide whitespace-nowrap"
            style={{ background: BRASS, color: '#080604', fontFamily: 'var(--font-oswald)' }}
          >
            Read the docs
          </Link>
        </div>
      </div>
    </main>
  );
}

# CLAUDE.md - Junto Project Context

> This file provides context for Claude Code to understand and build the Junto project.

## Project Overview

**Junto** is an AI-powered newsletter app that synthesizes tweets from curated Twitter profiles into a daily "shared consciousness" briefing. Named after Ben Franklin's intellectual discussion groups.

### Core Value Proposition
Instead of scrolling Twitter, users select voices they trust and receive a daily newsletter written as if those minds collaborated to brief them personally.

### Target User
Financial/crypto professionals who follow specific analysts and want synthesized insights without the noise.

---

## Technical Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Framework | Next.js 14+ (App Router) | Vercel integration, full-stack, great DX |
| Language | TypeScript | Type safety for complex data flows |
| Database | Supabase (Postgres) | Free tier, built-in auth option, pgvector for future RAG |
| Hosting | Vercel | Easy deploys, native cron jobs, edge functions |
| Email | Resend | Developer-friendly, good free tier |
| AI | Anthropic Claude API | Best synthesis quality |
| Twitter Data | TBD (Apify or RapidAPI) | Cost-effective for testing, switch to official API later |
| Auth | Clerk | Simple, good Next.js integration |

---

## Current Phase: Phase 1 - Proof of Concept

**Goal:** Get a working daily newsletter sending to a single user (the founder) to validate that AI synthesis produces genuinely valuable output.

**Success Criteria:** The founder looks forward to reading the newsletter instead of scrolling Twitter.

### Phase 1 Scope
- Hardcoded list of 3 Twitter profiles
- Daily cron job fetches tweets
- Claude synthesizes into newsletter
- Email sent to single recipient
- No auth, no UI (just the pipeline)

---

## Initial Twitter Profiles

These are the 3 profiles to start with:

1. **@crypto_condom** - High-frequency crypto trader, lots of market commentary and chart callouts. High volume (10-30+ tweets/day). Need to filter for signal.

2. **@cburniske** - Chris Burniske, Partner at Placeholder VC, author of "Cryptoassets". Thoughtful macro takes, thesis-driven. Often posts threads. Moderate volume (1-5/day).

3. **@krugman87** - Crypto-focused account with market reactions and commentary. Lower volume.

### Profile-Specific Handling
- **High volume accounts**: Weight by engagement (likes/RTs) to filter noise
- **Thread detection**: Keep multi-tweet threads together as single context unit
- **Quote tweets**: Include the content being quoted for context

---

## Database Schema

```sql
-- Run in Supabase SQL editor

-- Profiles table: Twitter accounts we're tracking
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_handle TEXT UNIQUE NOT NULL,
  twitter_id TEXT UNIQUE, -- Twitter's numeric ID
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_fetched_at TIMESTAMPTZ,
  fetch_config JSONB DEFAULT '{}' -- per-profile settings like min_engagement
);

-- Tweets table: Individual tweets
CREATE TABLE tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_id TEXT UNIQUE NOT NULL, -- Twitter's tweet ID
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  
  -- Engagement metrics for filtering
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  
  -- Tweet metadata
  is_retweet BOOLEAN DEFAULT FALSE,
  is_reply BOOLEAN DEFAULT FALSE,
  is_quote_tweet BOOLEAN DEFAULT FALSE,
  quoted_tweet_content TEXT, -- Content of quoted tweet if applicable
  
  -- Thread handling
  thread_id TEXT, -- Groups tweets in same thread
  thread_position INTEGER, -- Order within thread
  
  -- Processing metadata
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  raw_data JSONB -- Store full API response for debugging
);

-- Newsletters table: Generated newsletters
CREATE TABLE newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Content
  subject TEXT NOT NULL,
  content TEXT NOT NULL, -- Full newsletter body (markdown or HTML)
  
  -- Generation metadata
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  tweet_ids UUID[], -- References to source tweets used
  tweet_count INTEGER,
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  
  -- AI metadata
  model_used TEXT DEFAULT 'claude-sonnet-4-20250514',
  prompt_version TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  
  -- Delivery status
  sent_at TIMESTAMPTZ,
  sent_to TEXT[], -- Email addresses
  
  metadata JSONB DEFAULT '{}'
);

-- Users table (for Phase 2)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  clerk_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settings JSONB DEFAULT '{
    "delivery_time": "07:00",
    "timezone": "America/New_York",
    "frequency": "daily"
  }'
);

-- User-Profile junction (for Phase 2)
CREATE TABLE user_profiles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, profile_id)
);

-- Indexes for common queries
CREATE INDEX idx_tweets_profile_posted ON tweets(profile_id, posted_at DESC);
CREATE INDEX idx_tweets_posted_at ON tweets(posted_at DESC);
CREATE INDEX idx_tweets_thread ON tweets(thread_id, thread_position);
CREATE INDEX idx_newsletters_generated ON newsletters(generated_at DESC);
```

---

## Project Structure

```
junto/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cron/
│   │   │   │   └── daily-newsletter/
│   │   │   │       └── route.ts      # Daily cron endpoint
│   │   │   ├── tweets/
│   │   │   │   └── fetch/
│   │   │   │       └── route.ts      # Manual tweet fetch trigger
│   │   │   └── newsletter/
│   │   │       └── generate/
│   │   │           └── route.ts      # Manual newsletter generation
│   │   ├── layout.tsx
│   │   └── page.tsx                  # Simple status page for Phase 1
│   │
│   ├── lib/
│   │   ├── twitter/
│   │   │   ├── client.ts             # Twitter API client (Apify/RapidAPI)
│   │   │   ├── fetcher.ts            # Fetch tweets for a profile
│   │   │   ├── thread-detector.ts    # Group tweets into threads
│   │   │   └── types.ts              # Twitter-related types
│   │   │
│   │   ├── synthesis/
│   │   │   ├── client.ts             # Anthropic client wrapper
│   │   │   ├── prompts.ts            # System prompts for newsletter generation
│   │   │   ├── generator.ts          # Main synthesis logic
│   │   │   └── types.ts              # Synthesis-related types
│   │   │
│   │   ├── email/
│   │   │   ├── client.ts             # Resend client wrapper
│   │   │   ├── templates/
│   │   │   │   └── newsletter.tsx    # React Email template
│   │   │   └── sender.ts             # Send newsletter emails
│   │   │
│   │   ├── db/
│   │   │   ├── client.ts             # Supabase client
│   │   │   ├── profiles.ts           # Profile CRUD operations
│   │   │   ├── tweets.ts             # Tweet CRUD operations
│   │   │   └── newsletters.ts        # Newsletter CRUD operations
│   │   │
│   │   └── utils/
│   │       ├── date.ts               # Date formatting utilities
│   │       └── config.ts             # Environment config
│   │
│   └── types/
│       └── index.ts                  # Shared types
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql    # Database schema
│
├── .env.example                      # Environment variable template
├── .env.local                        # Local environment (gitignored)
├── vercel.json                       # Vercel config including cron
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

---

## Environment Variables

```bash
# .env.example

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Twitter Data (choose one)
APIFY_API_KEY=apify_api_...
# OR
RAPIDAPI_KEY=...

# Resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=junto@yourdomain.com

# App Config
NEWSLETTER_RECIPIENT=your@email.com
CRON_SECRET=random-secret-for-cron-auth
```

---

## Vercel Cron Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/daily-newsletter",
      "schedule": "0 11 * * *"
    }
  ]
}
```

Note: Schedule is UTC. `0 11 * * *` = 6am ET / 3am PT daily.

---

## Key Implementation Details

### Tweet Fetching Strategy

```typescript
// Pseudocode for daily fetch

async function fetchDailyTweets() {
  const profiles = await getActiveProfiles();
  
  for (const profile of profiles) {
    // Fetch tweets since last fetch (or last 24h)
    const since = profile.last_fetched_at || dayjs().subtract(24, 'hours');
    
    const tweets = await twitterClient.getTweets({
      username: profile.twitter_handle,
      since: since.toISOString(),
    });
    
    // Detect and group threads
    const tweetsWithThreads = detectThreads(tweets);
    
    // Store in database
    await storeTweets(profile.id, tweetsWithThreads);
    
    // Update last_fetched_at
    await updateProfileFetchTime(profile.id);
  }
}
```

### Newsletter Synthesis Prompt

```typescript
// src/lib/synthesis/prompts.ts

export const NEWSLETTER_SYSTEM_PROMPT = `You are a synthesis engine creating a daily intelligence briefing for a crypto/finance professional.

You have access to tweets from a curated group of analysts and thinkers the reader trusts. Your job is to create a newsletter that reads as if these minds collaborated to brief the reader on what matters today.

## Guidelines

1. **Lead with the most important insight** - What's the single most actionable or significant thing from the last 24 hours?

2. **Synthesize, don't summarize** - Don't just list what each person said. Find the connections, tensions, and through-lines.

3. **Maintain distinct voices when relevant** - If two sources disagree, highlight that tension. "Burniske sees X while Condom is positioned for Y."

4. **Be specific** - Include tickers, price levels, dates, and concrete details when mentioned.

5. **Note what's NOT being discussed** - Sometimes the silence is informative.

6. **End with "What to Watch"** - 2-3 things to monitor in the coming day/week.

## Tone
- Confident but not arrogant
- Dense with information, no filler
- Written for someone who already understands crypto/markets
- Occasional dry wit is fine, but substance over style

## Format
- Use markdown
- Keep it scannable but not bullet-point heavy
- Aim for 400-600 words
- Include a punchy subject line suggestion at the top

## Sources
You'll receive tweets grouped by author. Each tweet includes engagement metrics - higher engagement often (but not always) indicates more signal.`;

export const NEWSLETTER_USER_PROMPT = (tweets: GroupedTweets, dateRange: string) => `
Generate today's briefing based on tweets from ${dateRange}.

${Object.entries(tweets).map(([handle, tweets]) => `
## @${handle}
${tweets.map(t => `- [${t.likes} likes] ${t.content}${t.quoted_tweet_content ? `\n  > Quoting: "${t.quoted_tweet_content}"` : ''}`).join('\n')}
`).join('\n')}

Write the newsletter:`;
```

### Email Template Structure

```tsx
// src/lib/email/templates/newsletter.tsx

import { Html, Head, Body, Container, Section, Text, Link } from '@react-email/components';

interface NewsletterEmailProps {
  subject: string;
  content: string; // Markdown content
  date: string;
  sources: string[]; // Twitter handles
}

export function NewsletterEmail({ subject, content, date, sources }: NewsletterEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Text style={logoStyle}>JUNTO</Text>
            <Text style={dateStyle}>{date}</Text>
          </Section>
          
          <Section style={contentStyle}>
            {/* Render markdown content as HTML */}
            <div dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
          </Section>
          
          <Section style={footerStyle}>
            <Text style={sourcesStyle}>
              Sources: {sources.map(s => `@${s}`).join(', ')}
            </Text>
            <Text style={unsubscribeStyle}>
              <Link href="{{unsubscribe_url}}">Unsubscribe</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

---

## Development Workflow

### Initial Setup
```bash
# Create Next.js project
npx create-next-app@latest junto --typescript --tailwind --eslint --app --src-dir

# Install dependencies
cd junto
npm install @supabase/supabase-js @anthropic-ai/sdk resend @react-email/components dayjs

# Set up environment
cp .env.example .env.local
# Fill in API keys
```

### Testing the Pipeline
```bash
# 1. Seed initial profiles
npm run seed:profiles

# 2. Fetch tweets manually
curl http://localhost:3000/api/tweets/fetch

# 3. Generate newsletter manually  
curl http://localhost:3000/api/newsletter/generate

# 4. Check email delivery
```

---

## Phase 1 Completion Checklist

- [ ] GitHub repo created and connected to Vercel
- [ ] Supabase project with schema deployed
- [ ] Twitter data provider configured (Apify or RapidAPI)
- [ ] Tweet fetching working for all 3 profiles
- [ ] Thread detection working
- [ ] Anthropic synthesis producing good output
- [ ] Email template rendering correctly
- [ ] Resend delivering emails
- [ ] Daily cron job running reliably
- [ ] Founder receiving and finding value in daily newsletter

---

## Future Phases (Context Only)

### Phase 2: Web App MVP
- Clerk auth
- Profile picker UI
- Newsletter archive with search
- Settings page
- Multi-user support

### Phase 3: Interactive Chat
- Vector database (pgvector)
- Tweet + newsletter embeddings
- Chat interface
- RAG-powered Q&A with the "shared consciousness"

### Phase 4: Multi-Source & Scale
- Substack RSS ingestion
- Podcast transcription
- Stripe billing
- X API Pro migration

---

## Commands for Claude Code

When working on this project, useful commands:

```bash
# Start dev server
npm run dev

# Type check
npm run typecheck

# Run specific file
npx ts-node src/scripts/[script].ts

# Supabase CLI (if installed)
supabase db push
supabase gen types typescript --local > src/types/supabase.ts
```

---

## Notes for AI Assistant

1. **Start simple** - Get the pipeline working end-to-end before optimizing
2. **Log everything** - Add console.logs liberally during development
3. **Test incrementally** - Don't build the whole pipeline before testing each piece
4. **Hardcode first** - Hardcode values (like recipient email) before making configurable
5. **Error handling matters** - The cron job needs to be reliable; handle failures gracefully

When in doubt, ask the user for clarification rather than making assumptions about business logic.

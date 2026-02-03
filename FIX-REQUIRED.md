# MyJunto - Fixes Required

## Current Status: DEGRADED

The newsletter scheduling logic is now **working** but the system cannot deliver newsletters due to missing infrastructure.

## What's Working ✅

1. **User scheduling detection**: The `/api/newsletter/check-scheduled` endpoint correctly identifies users who are due for newsletters based on:
   - Their preferred send time (in their timezone)
   - Frequency settings (daily/weekly/bi-weekly)
   - Weekend delivery preferences
   - Last newsletter sent date

2. **Database connection**: Supabase connectivity is working

3. **Core tables exist**: `users`, `newsletters`, `scheduling_logs`

## What's Broken ❌

### 1. Missing Database Tables (CRITICAL)

The following tables don't exist but are required:

- **`profiles`** - Twitter accounts to track
- **`user_profiles`** - Links users to their selected profiles  
- **`tweets`** - Stores fetched tweets for newsletter generation

**To fix**: Run the migrations in Supabase SQL Editor:
```
https://supabase.com/dashboard/project/lsqlqssigerzghlxfxjl/sql/new
```

Migration files (in order):
1. `/home/ubuntu/clawd/junto/migrations/001_add_tweet_tables.sql`
2. `/home/ubuntu/clawd/junto/migrations/002_tweet_freshness_fix.sql`
3. `/home/ubuntu/clawd/junto/migrations/003_fix_user_columns.sql`

### 2. Missing Environment Variables

Add these to `.env.local` or Vercel environment:

```bash
# Email sending (Required for delivery)
RESEND_API_KEY=re_xxxxxxxx

# AI newsletter generation (Required)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

# Tweet fetching (Required for content)
TWITTER_PROXY_URL=https://your-twitter-proxy.com
TWITTER_PROXY_TOKEN=your_token_here
```

### 3. User Has No Profiles (Workaround Applied)

The test user has profiles set in `settings.profiles` as a workaround:
- cburniske
- balajis  
- naval

But ideally these should be in the `user_profiles` table once migrations are run.

## Testing After Fixes

1. **Check system status**:
   ```
   curl http://localhost:3000/api/status/full | jq .
   ```

2. **Test scheduling check**:
   ```
   curl http://localhost:3000/api/newsletter/check-scheduled | jq .
   ```

3. **Force send a newsletter**:
   ```
   curl -X POST http://localhost:3000/api/newsletter/send-now \
     -H "Content-Type: application/json" \
     -d '{"email": "jonto2121@gmail.com"}'
   ```

4. **Fetch tweets**:
   ```
   curl -X POST http://localhost:3000/api/tweets/fetch \
     -H "Content-Type: application/json" \
     -d '{"seed": true}'
   ```

## Quick Fix Order

1. **Apply migrations** in Supabase SQL Editor
2. **Add ANTHROPIC_API_KEY** to .env.local
3. **Add RESEND_API_KEY** to .env.local
4. **Add TWITTER_PROXY_URL and TOKEN** to .env.local
5. **Fetch tweets** using `/api/tweets/fetch`
6. **Test newsletter delivery** using `/api/newsletter/check-scheduled`

## Code Changes Made

1. **Fixed scheduling logic** in `/api/newsletter/check-scheduled/route.ts`:
   - Now correctly finds users where delivery time has passed (not just 5-min window)
   - Added detailed debug logging
   - Made email/AI config optional for testing
   - Falls back to `settings.profiles` when `user_profiles` table missing

2. **Made tweet functions fault-tolerant** in `/lib/db/tweets.ts`:
   - Returns empty instead of crashing when table doesn't exist

3. **Added full status endpoint** at `/api/status/full`:
   - Shows all env vars and table status
   - Provides actionable items

---

*Last updated: 2026-02-03*
*Contact: Debug via Telegram to Jai*

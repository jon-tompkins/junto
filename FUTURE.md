# Future Features

Parking lot for ideas we want to come back to. Add a date when shelving so we know how stale things are.

## Twitter list import at signup

**Shelved:** 2026-05-26
**Idea:** When a user connects with X/Twitter, let them import sources directly from one of their existing X Lists ("Import sources from list → @jon/finance-twitter"). Massive onboarding win — most power users already curate lists.

**Blocker:** X API v2 list endpoints (`GET /2/lists/:id/members`, `GET /2/users/:id/owned_lists`) require **Basic tier ($200/mo)**. Free tier doesn't expose lists at all.

**What we'd need when we revisit:**
- Subscribe to X API Basic tier
- Add `list.read` (or equivalent `tweet.read users.read list.read`) scope to NextAuth Twitter provider config
- Persist the user's OAuth access token (currently we discard it after auth)
- New flow: fetch owned + subscribed lists → user picks one → fetch members → bulk-add as tracked sources
- Fallback for free-tier users: paste a public list URL, scrape via Apify or similar

**Cheaper interim option:** ship the paste-list-URL + Apify scrape path now, skip the OAuth integration entirely. ~$0.01/list scrape, no monthly floor.

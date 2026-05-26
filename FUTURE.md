# Future Features

Parking lot for ideas we want to come back to. Add a date when shelving so we know how stale things are.

## Twitter list import via OAuth (auto-detect user's own lists)

**Shelved:** 2026-05-26
**Status:** paste-a-URL path shipped 2026-05-26 via Apify scrape (`/api/juntos/[id]/import-list`). What remains shelved is the OAuth-driven "pick from your own lists" UX.

**Idea:** When a user connects with X/Twitter, auto-detect their owned + subscribed lists and let them pick one without ever pasting a URL. Significantly smoother than the current paste-URL flow.

**Blocker:** X API v2 list endpoints (`GET /2/lists/:id/members`, `GET /2/users/:id/owned_lists`) require **Basic tier ($200/mo)**. Free tier doesn't expose lists at all.

**What we'd need when we revisit:**
- Subscribe to X API Basic tier
- Add `list.read` (or equivalent `tweet.read users.read list.read`) scope to NextAuth Twitter provider config
- Persist the user's OAuth access token (currently we discard it after auth)
- New flow: fetch owned + subscribed lists → user picks one → reuse the existing import endpoint with the listId

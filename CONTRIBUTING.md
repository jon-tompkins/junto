# Contributing

`main` changes only through a pull request with green CI. Do not push straight to `main`, force-push it, or delete it.

## CI

Pull requests and pushes to `main` run [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Every check has to pass:

| Check | Command |
| --- | --- |
| `typecheck` | `npm run typecheck` (`tsc --noEmit`) |
| `lint` | `npm run lint` |
| `test` | `npm test` |
| `state:check` | `npm run state:check` |
| `gitleaks` | secret scan of git history |

This repo does not change GitHub settings. Apply the ruleset in the CI pull request so those check names are required on `main`, with no bypass.

## Protected paths

These paths need Jonto's approval (`@jon-tompkins` in [`.github/CODEOWNERS`](.github/CODEOWNERS)):

- `src/lib/trading/**`
- `src/app/trading/**`
- `src/app/api/admin/trading/**`
- `src/app/api/cron/trade-*`
- `src/lib/stripe/**`
- `src/app/api/v2/billing/**`
- `src/app/api/v2/credits/**`
- `src/lib/db/credits.ts`
- `src/lib/auth.ts`
- `src/app/api/auth/**`
- `migrations/**`
- `supabase/migrations/**`
- `vercel.json`

Leave them out of unrelated changes. After the ruleset is on, GitHub will block a merge that touches them until Jonto approves.

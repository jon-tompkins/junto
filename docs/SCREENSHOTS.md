# Screenshotting the live app (for verifying UI changes)

How Benji grabs the screenshots you've seen. It's just Playwright driving headless
Chromium against the deployed site, then reading the PNG back to "see" it.

## One-time
Playwright + Chromium are already installed in `repos/junto/node_modules`. Run the
script **from inside `repos/junto`** (or Node can't resolve `playwright`). If the
browser binary is missing: `npx playwright install chromium`.

## The template
Write a throwaway `.mjs` **inside repos/junto** (not /tmp — module resolution),
run it, then delete it. Then Read the output PNG to view it inline.

```js
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

// LIGHT MODE: seed the theme before app scripts run (app reads localStorage 'theme')
await p.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch (e) {} });

await p.goto('https://www.myjunto.xyz/positions/BTC', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(6000);                    // let client render / widgets load
await p.screenshot({ path: '/tmp/shot.png', fullPage: false });
await b.close();
```

Then in the agent: `Read /tmp/shot.png` — it renders the image so you can eyeball it.

## Gotchas learned the hard way
- **Pages that poll live data never go `networkidle`** (`/positions`, `/trades`, a
  mandate page). Use `waitUntil: 'domcontentloaded'` + a fixed `waitForTimeout`,
  NOT `networkidle` (it times out at 60s).
- **Interact before shooting** when the thing is behind a tab/click:
  `await p.getByRole('button', { name: 'Portfolio' }).first().click();` then wait.
- **Third-party widgets (TradingView) load async** — wait ~8s.
- **deviceScaleFactor: 2** = crisp retina screenshots. Worth it.
- **Mobile**: `newContext({ viewport: { width: 390, height: 844 }, isMobile: true })`.
- **fullPage: true** captures the whole scroll height; default is just the viewport.

## Authenticated pages (dashboard, settings, a user's mandates)
Public pages (`/sources`, `/positions`, `/juntos`, `/trades`, dispatch views) need
NO auth. For a logged-in view, add the NextAuth session cookie:

```js
await ctx.addCookies([{
  name: '__Secure-next-auth.session-token',
  value: process.env.MYJUNTO_SESSION_COOKIE,   // Jon's session token, from the env
  domain: 'www.myjunto.xyz', path: '/', httpOnly: true, secure: true,
}]);
```

Caveat: that cookie is a *specific* logged-in account — it only sees mandates/dispatches
that account owns. For anything account-scoped, screenshot a resource that account owns.

## Verify loop I use on every UI change
1. push → wait for Vercel green (`gh api repos/jon-tompkins/junto/commits/<sha>/status --jq .state`)
2. run the script (light and/or dark), Read the PNG
3. if wrong, fix + repush; if right, ship the screenshot to Jon as proof

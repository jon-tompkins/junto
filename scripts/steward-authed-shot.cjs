// Authed variant of steward-public-shot.cjs: loads logged-in pages with MYJUNTO_SESSION_COOKIE.
// Read/screenshot only. Env: BASE, TAG, ONLY (m|d), FULL=1, PAGES='[["name","/path"],...]'
const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE || 'https://www.myjunto.xyz';
  const tag = process.env.TAG || 'authed';
  const out = '/home/ubuntu/.openclaw/workspace/state/steward-shots/';
  const pages = JSON.parse(process.env.PAGES);
  const host = new URL(base).hostname;
  const secure = base.startsWith('https');
  const b = await chromium.launch();
  for (const [vw, vh, suffix] of [[390, 844, 'm'], [1280, 800, 'd']]) {
    if (process.env.ONLY && process.env.ONLY !== suffix) continue;
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await ctx.addCookies([{ name: secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token', value: process.env.MYJUNTO_SESSION_COOKIE, domain: host, path: '/', httpOnly: true, secure, sameSite: 'Lax' }]);
    const p = await ctx.newPage();
    for (const [name, path] of pages) {
      try {
        await p.goto(base + path, { waitUntil: 'networkidle', timeout: 45000 });
      } catch (e) { console.log('nav-timeout', path); }
      await p.waitForTimeout(1200);
      const m = await p.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > cw + 4; }).slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 60));
        return { url: location.pathname, sw: document.documentElement.scrollWidth, cw, h: document.documentElement.scrollHeight, title: document.title, wide };
      });
      console.log(suffix, name, JSON.stringify(m));
      await p.screenshot({ path: `${out}${tag}-${name}-${suffix}.png`, fullPage: process.env.FULL === '1', clip: process.env.FULL === '1' ? undefined : { x: 0, y: 0, width: vw, height: Math.min(m.h, 2600) } });
    }
    await ctx.close();
  }
  await b.close();
})();

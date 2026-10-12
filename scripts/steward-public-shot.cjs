const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE || 'https://www.myjunto.xyz';
  const tag = process.env.TAG || 'prod';
  const out = '/home/ubuntu/.openclaw/workspace/state/steward-shots/';
  const pages = JSON.parse(process.env.PAGES);
  const b = await chromium.launch();
  for (const [vw, vh, suffix] of [[390, 844, 'm'], [1280, 800, 'd']]) {
    if (process.env.ONLY && process.env.ONLY !== suffix) continue;
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, colorScheme: 'dark' });
    const p = await ctx.newPage();
    for (const [name, path] of pages) {
      try {
        await p.goto(base + path, { waitUntil: 'networkidle', timeout: 45000 });
      } catch (e) { console.log('nav-timeout', path); }
      await p.waitForTimeout(800);
      const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight, title: document.title }));
      console.log(suffix, name, JSON.stringify(m));
      await p.screenshot({ path: `${out}${tag}-${name}-${suffix}.png`, fullPage: process.env.FULL === '1', clip: process.env.FULL === '1' ? undefined : { x: 0, y: 0, width: vw, height: Math.min(m.h, 2600) } });
    }
    await ctx.close();
  }
  await b.close();
})();

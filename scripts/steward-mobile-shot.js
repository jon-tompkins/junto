const { chromium } = require('playwright');

(async () => {
  const cookie = process.env.MYJUNTO_SESSION_COOKIE;
  if (!cookie) { console.error('no cookie'); process.exit(1); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 12-ish
    deviceScaleFactor: 2,
  });
  await ctx.addCookies([{
    name: '__Secure-next-auth.session-token',
    value: cookie,
    domain: 'www.myjunto.xyz',
    path: '/',
    httpOnly: true,
    secure: true,
  }]);
  const page = await ctx.newPage();
  const tag = process.env.SHOT_TAG || '';
  const paths = (process.env.SHOT_PATHS || '/dashboard,/positions').split(',');
  const pages = paths.map((p) => [p.replace(/\//g, '_').replace(/^_/, '') || 'root', 'https://www.myjunto.xyz' + p]);
  for (const [name, url] of pages) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(2500);
      const suffix = tag ? `-${tag}` : '';
      const out = `/home/ubuntu/.openclaw/workspace/.openclaw-cli-images/steward-mobile-${name}${suffix}.png`;
      await page.screenshot({ path: out, fullPage: true });
      // detect horizontal overflow
      const overflow = await page.evaluate(() => ({
        docW: document.documentElement.scrollWidth,
        winW: window.innerWidth,
      }));
      console.log(`${name}: ${out} overflow=${JSON.stringify(overflow)}`);
    } catch (e) {
      console.log(`${name}: ERROR ${e.message}`);
    }
  }
  await browser.close();
})();

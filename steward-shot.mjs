import { chromium } from 'playwright';
import fs from 'fs';

const COOKIE = process.env.MYJUNTO_SESSION_COOKIE;
const OUT = '/home/ubuntu/.openclaw/workspace/state/steward-shots';
const pages = [
  ['/positions', 'positions'],
  ['/trading/portfolio', 'portfolio'],
  ['/dashboard', 'dashboard'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
});
await ctx.addCookies([{
  name: '__Secure-next-auth.session-token', value: COOKIE,
  domain: 'www.myjunto.xyz', path: '/', httpOnly: true, secure: true,
}]);

for (const [path, tag] of pages) {
  const page = await ctx.newPage();
  try {
    await page.goto('https://www.myjunto.xyz' + path, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    const f = `${OUT}/mobile-${tag}.png`;
    await page.screenshot({ path: f, fullPage: true });
    // detect horizontal overflow
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    console.log(`${tag}: ${f} overflow=${overflow.scrollW - overflow.clientW}px (scrollW=${overflow.scrollW})`);
  } catch (e) {
    console.log(`${tag}: ERROR ${e.message}`);
  }
  await page.close();
}
await browser.close();

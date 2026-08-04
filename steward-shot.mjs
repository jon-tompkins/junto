import { chromium } from 'playwright';
const cookie = process.env.MYJUNTO_SESSION_COOKIE;
const paths = (process.env.SHOT_PATHS || '/positions').split(',');
const tag = process.env.SHOT_TAG || 'shot';
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
await ctx.addCookies([{ name: '__Secure-next-auth.session-token', value: cookie, domain: 'www.myjunto.xyz', path: '/', httpOnly: true, secure: true }]);
const page = await ctx.newPage();
for (const p of paths) {
  const url = 'https://www.myjunto.xyz' + p;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    const out = `/tmp/${tag}-${p.replace(/\W+/g,'_')}.png`;
    await page.screenshot({ path: out, fullPage: true });
    console.log('OK', p, '->', out);
  } catch (e) { console.log('ERR', p, e.message); }
}
await b.close();

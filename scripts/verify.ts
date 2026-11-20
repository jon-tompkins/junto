/**
 * End-to-end smoke for MyJunto.
 *
 * Public (default) is read-only and safe to point at production:
 *   npm run verify
 *   npm run verify -- --base-url https://myjunto.xyz --out verify-output
 *
 * Signed-in loop (creates a private junto, runs one paid Quick Dispatch, then
 * deletes the junto). Needs a Playwright storage state captured for a test user:
 *
 *   npx playwright codegen https://www.myjunto.xyz --save-storage=verify-storage.json
 *
 * Sign in with the test user, wait until /dashboard loads, then close the window.
 * The cookie is host-scoped, so capture it on the host you will verify (apex
 * https://myjunto.xyz redirects to https://www.myjunto.xyz). Do not commit the file.
 *
 *   VERIFY_STORAGE_STATE=$PWD/verify-storage.json npm run verify -- --authed
 *
 * Quick Dispatch bills once per UTC day per user. A second --authed run the same
 * day records the junto check and fails the credit check without charging again.
 *
 * Preview deployments keep Vercel Authentication. Set VERCEL_AUTOMATION_BYPASS_SECRET
 * to send the official protection-bypass header. That does not change SSO settings.
 * Minting a session without OAuth is a separate, preview-only auth change and is
 * intentionally not implemented here.
 *
 * Flags:
 *   --base-url <url>                 default https://myjunto.xyz (or VERIFY_BASE_URL)
 *   --out <dir>                      default verify-output (or VERIFY_OUT)
 *   --authed                         run the signed-in loop
 *   --keep-junto                     do not delete the junto created by --authed
 *   --leaderboard-budget-ms <n>      default 3000
 *   --leaderboard-strict             fail (instead of warn) when the leaderboard is slow
 *   --help
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { resolveQuickDispatchBilledCredits, type BilledQuickDispatchCost } from '../src/lib/verify/credit-delta';
import {
  DEFAULT_LEADERBOARD_BUDGET_MS,
  flagSlowLoad,
  healthTweetCapWarning,
  type LoadFlag,
} from '../src/lib/verify/smoke-rules';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Status = 'pass' | 'warn' | 'fail';

interface Check {
  name: string;
  status: Status;
  detail: string;
  httpStatus?: number;
  finalUrl?: string;
  loadMs?: number;
  screenshot?: string;
  redirects?: string[];
}

interface Cli {
  baseUrl: string;
  outDir: string;
  authed: boolean;
  keepJunto: boolean;
  leaderboardBudgetMs: number;
  leaderboardMode: 'warn' | 'fail';
  help: boolean;
}

function usage(): string {
  return `Usage: npm run verify -- [options]

Public read-only smoke (default base https://myjunto.xyz):
  npm run verify

Signed-in loop (session storage state required):
  npx playwright codegen https://www.myjunto.xyz --save-storage=verify-storage.json
  VERIFY_STORAGE_STATE=$PWD/verify-storage.json npm run verify -- --authed

Options:
  --base-url <url>              Target origin (env VERIFY_BASE_URL)
  --out <dir>                   Output directory for JSON + screenshots (env VERIFY_OUT)
  --authed                      Create a junto, run Quick Dispatch, assert the credit drop
  --keep-junto                  Leave the verify junto in place
  --leaderboard-budget-ms <n>   Slow-leaderboard threshold in ms (default ${DEFAULT_LEADERBOARD_BUDGET_MS})
  --leaderboard-strict          Fail the run when the leaderboard exceeds the budget
  --help
`;
}

function parseCli(argv: string[]): Cli {
  const cli: Cli = {
    baseUrl: process.env.VERIFY_BASE_URL || 'https://myjunto.xyz',
    outDir: process.env.VERIFY_OUT || 'verify-output',
    authed: false,
    keepJunto: false,
    leaderboardBudgetMs: Number(process.env.VERIFY_LEADERBOARD_BUDGET_MS || DEFAULT_LEADERBOARD_BUDGET_MS),
    leaderboardMode: process.env.VERIFY_LEADERBOARD_MODE === 'fail' ? 'fail' : 'warn',
    help: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const take = (name: string): string => {
      const eq = arg.indexOf('=');
      if (arg.startsWith(`${name}=`) && eq !== -1) return arg.slice(eq + 1);
      const next = args[++i];
      if (!next || next.startsWith('--')) throw new Error(`${name} requires a value`);
      return next;
    };
    if (arg === '--help' || arg === '-h') cli.help = true;
    else if (arg === '--authed') cli.authed = true;
    else if (arg === '--keep-junto') cli.keepJunto = true;
    else if (arg === '--leaderboard-strict') cli.leaderboardMode = 'fail';
    else if (arg === '--base-url' || arg.startsWith('--base-url=')) cli.baseUrl = take('--base-url');
    else if (arg === '--out' || arg.startsWith('--out=')) cli.outDir = take('--out');
    else if (arg === '--leaderboard-budget-ms' || arg.startsWith('--leaderboard-budget-ms=')) {
      cli.leaderboardBudgetMs = Number(take('--leaderboard-budget-ms'));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  cli.baseUrl = cli.baseUrl.replace(/\/$/, '');
  if (!Number.isFinite(cli.leaderboardBudgetMs) || cli.leaderboardBudgetMs <= 0) {
    throw new Error('--leaderboard-budget-ms must be a positive number');
  }
  return cli;
}

function worse(a: Status, b: Status): Status {
  const rank: Record<Status, number> = { pass: 0, warn: 1, fail: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function loadBilledCost(): BilledQuickDispatchCost {
  const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  return resolveQuickDispatchBilledCredits({
    routeSource: read('src/app/api/quick-dispatch/route.ts'),
    pricingSource: read('src/lib/pricing.ts'),
    creditsSource: read('src/lib/db/credits.ts'),
  });
}

function redirectUrls(response: Response | null): string[] {
  const urls: string[] = [];
  let request = response?.request().redirectedFrom() ?? null;
  while (request) {
    urls.push(request.url());
    request = request.redirectedFrom();
  }
  return urls.reverse();
}

async function navigationLoadMs(page: Page, wallMs: number): Promise<number> {
  try {
    const timing = await page.evaluate(() => {
      const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (!entry || entry.loadEventEnd <= 0) return null;
      return Math.round(entry.loadEventEnd - entry.startTime);
    });
    return timing ?? wallMs;
  } catch {
    return wallMs;
  }
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Executable doesn't exist")) throw error;
    return chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  }
}

function protectionHeaders(): Record<string, string> | undefined {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return undefined;
  return {
    'x-vercel-protection-bypass': secret,
    'x-vercel-set-bypass-cookie': 'true',
  };
}

interface PageSpec {
  name: string;
  path: string;
  heading: RegExp;
  also: RegExp;
  budget?: boolean;
}

const PAGES: PageSpec[] = [
  {
    name: 'home',
    path: '/',
    heading: /smartest voices/i,
    also: /Live\s*·\s*Market Pulse|Start free/i,
  },
  {
    name: 'signal',
    path: '/signal',
    heading: /smartest voices|signal/i,
    also: /Live\s*·\s*Market Pulse|Start free|Market Pulse/i,
  },
  {
    name: 'leaderboard',
    path: '/leaderboard',
    heading: /leaderboard/i,
    also: /Hit rate|Nothing to rank yet/i,
    budget: true,
  },
  {
    name: 'top-calls',
    path: '/top-calls',
    heading: /top calls/i,
    also: /calls tracked|No scored calls|No calls yet/i,
  },
  {
    name: 'pricing',
    path: '/pricing',
    heading: /billing/i,
    also: /Quick synthesis/i,
  },
];

async function smokePage(page: Page, baseUrl: string, spec: PageSpec, outDir: string, cli: Cli): Promise<Check> {
  const url = `${baseUrl}${spec.path}`;
  const shot = path.join(outDir, `${spec.name}.png`);
  const started = Date.now();
  let response: Response | null = null;
  try {
    response = await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { await page.screenshot({ path: shot }); } catch { /* page may not exist */ }
    return {
      name: `page:${spec.path}`,
      status: 'fail',
      detail: `Navigation failed: ${message}`,
      loadMs: Date.now() - started,
      screenshot: path.relative(process.cwd(), shot),
    };
  }

  const wallMs = Date.now() - started;
  const loadMs = await navigationLoadMs(page, wallMs);
  const httpStatus = response?.status();
  const finalUrl = response?.url() ?? page.url();
  const redirects = redirectUrls(response);

  let status: Status = httpStatus === 200 ? 'pass' : 'fail';
  const notes: string[] = [];
  if (httpStatus !== 200) notes.push(`final HTTP ${httpStatus ?? 'none'}, expected 200`);
  if (redirects.length > 0) notes.push(`followed redirect from ${redirects.join(' -> ')}`);

  try {
    await page.getByRole('heading', { name: spec.heading }).first().waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    status = 'fail';
    notes.push(`heading ${spec.heading} was not visible`);
  }

  const extra = page.getByText(spec.also).first();
  if (await extra.count() === 0) {
    status = 'fail';
    notes.push(`key text ${spec.also} was not found`);
  }

  if (spec.budget) {
    const flag: LoadFlag = flagSlowLoad(loadMs, cli.leaderboardBudgetMs, cli.leaderboardMode);
    if (flag !== 'pass') {
      status = worse(status, flag);
      notes.push(`load ${loadMs}ms exceeds ${cli.leaderboardBudgetMs}ms budget (${flag})`);
    } else {
      notes.push(`load ${loadMs}ms within ${cli.leaderboardBudgetMs}ms budget`);
    }
  }

  try { await page.screenshot({ path: shot }); } catch { /* ignore */ }

  return {
    name: `page:${spec.path}`,
    status,
    detail: notes.join('; ') || `HTTP ${httpStatus}, key elements rendered`,
    httpStatus,
    finalUrl,
    loadMs,
    screenshot: path.relative(process.cwd(), shot),
    redirects: redirects.length > 0 ? redirects : undefined,
  };
}

interface HealthBody {
  status?: string;
  checks?: {
    tweets_last_24h?: { count?: number; source_count?: number; status?: string };
    newsletter_runs_last_24h?: { total?: number; delivered?: number; errored?: number; status?: string };
    last_fetch?: { status?: string; hours_since_fetched?: number | null };
  };
}

async function smokeHealth(context: BrowserContext, baseUrl: string): Promise<Check> {
  const started = Date.now();
  try {
    const response = await context.request.get(`${baseUrl}/api/health`, { timeout: 30_000 });
    const loadMs = Date.now() - started;
    const httpStatus = response.status();
    let body: HealthBody = {};
    try { body = await response.json() as HealthBody; } catch { /* leave empty */ }
    const tweets = body.checks?.tweets_last_24h;
    const count = tweets?.count;
    const notes: string[] = [];
    let status: Status = 'pass';

    if (httpStatus !== 200) {
      status = 'fail';
      notes.push(`HTTP ${httpStatus}, expected 200`);
    }
    if (body.status !== 'ok') {
      status = 'fail';
      notes.push(`health status ${body.status ?? 'missing'}, expected ok`);
    }
    if (typeof count !== 'number') {
      status = 'fail';
      notes.push('tweets_last_24h.count missing');
    } else {
      notes.push(`tweets_last_24h.count=${count} sources=${tweets?.source_count ?? '?'} tweet_status=${tweets?.status ?? '?'}`);
      const cap = healthTweetCapWarning(count);
      if (cap) {
        status = worse(status, 'warn');
        notes.push(cap);
      }
    }
    const runs = body.checks?.newsletter_runs_last_24h;
    if (runs) notes.push(`newsletter_runs_last_24h.total=${runs.total ?? '?'}`);

    return {
      name: 'api:health',
      status,
      detail: notes.join('; '),
      httpStatus,
      finalUrl: response.url(),
      loadMs,
    };
  } catch (error) {
    return {
      name: 'api:health',
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
      loadMs: Date.now() - started,
    };
  }
}

interface ApiResult<T> {
  status: number;
  body: T;
}

async function api<T>(page: Page, apiPath: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<ApiResult<T>> {
  return page.evaluate(async (arg) => {
    const res = await fetch(arg.path, {
      method: arg.method,
      headers: arg.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: arg.body === undefined ? undefined : JSON.stringify(arg.body),
      signal: AbortSignal.timeout(arg.timeoutMs),
    });
    const text = await res.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
    return { status: res.status, body: body as T };
  }, {
    path: apiPath,
    method: init?.method ?? 'GET',
    body: init?.body,
    timeoutMs: init?.timeoutMs ?? 30_000,
  });
}

async function runAuthed(browser: Browser, baseUrl: string, outDir: string, billed: BilledQuickDispatchCost, keepJunto: boolean): Promise<Check[]> {
  const storage = process.env.VERIFY_STORAGE_STATE;
  if (!storage) {
    return [{
      name: 'authed:session',
      status: 'fail',
      detail: 'VERIFY_STORAGE_STATE is not set. Capture one with: npx playwright codegen https://www.myjunto.xyz --save-storage=verify-storage.json',
    }];
  }
  if (!fs.existsSync(storage)) {
    return [{
      name: 'authed:session',
      status: 'fail',
      detail: `VERIFY_STORAGE_STATE file not found: ${storage}`,
    }];
  }

  const headers = protectionHeaders();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    storageState: storage,
    extraHTTPHeaders: headers,
  });
  const page = await context.newPage();
  const checks: Check[] = [];

  try {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'load', timeout: 45_000 });
    const account = await api<{ balance?: number; userId?: string; error?: string }>(page, '/api/v2/account');
    const sessionShot = path.join(outDir, 'authed-dashboard.png');
    try { await page.screenshot({ path: sessionShot }); } catch { /* ignore */ }
    if (account.status !== 200 || typeof account.body?.balance !== 'number') {
      checks.push({
        name: 'authed:session',
        status: 'fail',
        httpStatus: account.status,
        detail: `GET /api/v2/account returned ${account.status}. The storage state is missing or expired for ${baseUrl}.`,
        screenshot: path.relative(process.cwd(), sessionShot),
        finalUrl: page.url(),
      });
      return checks;
    }
    checks.push({
      name: 'authed:session',
      status: 'pass',
      httpStatus: account.status,
      detail: `Signed in as ${account.body.userId}. Balance ${account.body.balance}.`,
      screenshot: path.relative(process.cwd(), sessionShot),
      finalUrl: page.url(),
    });

    const featured = await api<{
      sources?: { id: string; handle: string }[];
      used_today?: boolean;
      credit_cost?: number;
      error?: string;
    }>(page, '/api/quick-dispatch');
    const sources = (featured.body?.sources ?? []).filter((s) => typeof s.id === 'string' && s.id.length > 0);
    const picked = sources.slice(0, 3);
    if (featured.status !== 200 || picked.length < 3) {
      checks.push({
        name: 'authed:junto',
        status: 'fail',
        httpStatus: featured.status,
        detail: `Need 3 featured source ids from GET /api/quick-dispatch, got ${picked.length}.`,
      });
      checks.push({
        name: 'authed:quick-dispatch',
        status: 'fail',
        detail: 'Skipped because featured sources were unavailable.',
      });
      return checks;
    }

    const name = `verify-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const created = await api<{ junto?: { id: string }; error?: string }>(page, '/api/juntos', {
      method: 'POST',
      body: {
        name,
        description: 'Created by scripts/verify.ts. Private. Safe to delete.',
        is_public: false,
        source_ids: picked.map((s) => s.id),
      },
    });
    const juntoId = created.body?.junto?.id;
    if (created.status !== 201 || !juntoId) {
      checks.push({
        name: 'authed:junto',
        status: 'fail',
        httpStatus: created.status,
        detail: `POST /api/juntos failed: ${JSON.stringify(created.body).slice(0, 300)}`,
      });
      checks.push({
        name: 'authed:quick-dispatch',
        status: 'fail',
        detail: 'Skipped because junto creation failed.',
      });
      return checks;
    }

    const fetched = await api<{ junto?: { junto_sources?: { source?: { id?: string } | null }[] } }>(page, `/api/juntos/${juntoId}`);
    const attached = (fetched.body?.junto?.junto_sources ?? []).filter((row) => row.source?.id).length;
    const juntoShot = path.join(outDir, 'authed-junto.png');
    try {
      await page.goto(`${baseUrl}/junto/${juntoId}`, { waitUntil: 'load', timeout: 45_000 });
      await page.screenshot({ path: juntoShot });
    } catch { /* screenshot is best-effort */ }

    const juntoOk = fetched.status === 200 && attached === 3;
    checks.push({
      name: 'authed:junto',
      status: juntoOk ? 'pass' : 'fail',
      httpStatus: fetched.status,
      detail: juntoOk
        ? `Created private junto ${juntoId} (${name}) with sources ${picked.map((s) => s.handle).join(', ')}.`
        : `Junto ${juntoId} created but source count was ${attached}, expected 3.`,
      screenshot: path.relative(process.cwd(), juntoShot),
      finalUrl: `${baseUrl}/junto/${juntoId}`,
    });

    const liveCost = featured.body?.credit_cost;
    if (featured.body?.used_today) {
      checks.push({
        name: 'authed:quick-dispatch',
        status: 'fail',
        detail: 'Quick Dispatch was already used today (UTC) for this user, so the credit drop was not re-run and nothing was charged. Retry after 00:00 UTC or use a user who has not dispatched today.',
      });
    } else if (liveCost !== billed.billed) {
      checks.push({
        name: 'authed:quick-dispatch',
        status: 'fail',
        detail: `GET /api/quick-dispatch credit_cost=${String(liveCost)} does not match ${billed.chargeConstant}=${billed.billed} read from ${billed.chargeFile}. Dispatch was not run.`,
      });
    } else {
      const beforeRes = await api<{ balance?: number }>(page, '/api/v2/account');
      const before = beforeRes.body?.balance;
      const dispatch = await api<{ subject?: string; content?: string; error?: string; sample?: boolean }>(page, '/api/quick-dispatch', {
        method: 'POST',
        timeoutMs: 120_000,
        body: { sourceIds: picked.map((s) => s.id) },
      });
      const afterRes = await api<{ balance?: number }>(page, '/api/v2/account');
      const after = afterRes.body?.balance;
      const subject = dispatch.body?.subject;
      const contentLength = typeof dispatch.body?.content === 'string' ? dispatch.body.content.length : 0;

      if (dispatch.status !== 200 || typeof before !== 'number' || typeof after !== 'number') {
        checks.push({
          name: 'authed:quick-dispatch',
          status: 'fail',
          httpStatus: dispatch.status,
          detail: `Paid Quick Dispatch (sample:false) HTTP ${dispatch.status}. Balance before=${String(before)} after=${String(after)}. Expected drop ${billed.billed}. ${dispatch.body?.error ?? ''}`.trim(),
        });
      } else {
        const delta = before - after;
        const matches = delta === billed.billed && contentLength >= 200 && dispatch.body?.sample !== true;
        const why = [
          `Balance ${before} -> ${after} (delta ${delta}).`,
          `Billed ${billed.billed} via ${billed.chargeConstant}` +
            `${billed.pricingMatch ? ` matching pricing.${billed.pricingMatch}` : ''}.`,
          `Subject: ${subject ?? '(none)'}. Content length ${contentLength}.`,
          dispatch.body?.sample === true ? 'Response was the free onboarding sample, which bills 0.' : 'Paid path (sample:false).',
        ];
        checks.push({
          name: 'authed:quick-dispatch',
          status: matches ? 'pass' : 'fail',
          httpStatus: dispatch.status,
          detail: why.join(' '),
        });
      }
    }

    if (!keepJunto) {
      const removed = await api<{ success?: boolean; error?: string }>(page, `/api/juntos/${juntoId}`, { method: 'DELETE' });
      checks.push({
        name: 'authed:cleanup',
        status: removed.status === 200 ? 'pass' : 'warn',
        httpStatus: removed.status,
        detail: removed.status === 200
          ? `Deleted private junto ${juntoId}.`
          : `Private junto ${juntoId} was left in place. DELETE returned ${removed.status}.`,
      });
    }
  } finally {
    await context.close();
  }
  return checks;
}

function billedCheck(billed: BilledQuickDispatchCost): Check {
  const pricingBits = Object.entries(billed.pricing).map(([name, value]) => `${name}=${value}`).join(', ');
  const creditBits = Object.keys(billed.creditsModule).length === 0
    ? 'src/lib/db/credits.ts defines no price constant (deductCredits takes a caller-supplied amount)'
    : `src/lib/db/credits.ts exports ${JSON.stringify(billed.creditsModule)}`;
  const match = billed.pricingMatch
    ? `matches pricing.${billed.pricingMatch}`
    : 'does not match a single per-send price in src/lib/pricing.ts';
  return {
    name: 'billed-quick-dispatch-cost',
    status: billed.pricingMatch ? 'pass' : 'warn',
    detail: `${billed.chargeConstant}=${billed.billed} in ${billed.chargeFile} is the amount passed to deductCredits and ${match}. ${creditBits}. pricing.ts: ${pricingBits}.`,
  };
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv);
  if (cli.help) {
    process.stdout.write(usage());
    return;
  }

  const outDir = path.resolve(cli.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const checks: Check[] = [];

  let billed: BilledQuickDispatchCost | null = null;
  try {
    billed = loadBilledCost();
    checks.push(billedCheck(billed));
  } catch (error) {
    checks.push({
      name: 'billed-quick-dispatch-cost',
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const headers = protectionHeaders();
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      extraHTTPHeaders: headers,
    });
    const page = await context.newPage();
    for (const spec of PAGES) {
      checks.push(await smokePage(page, cli.baseUrl, spec, outDir, cli));
    }
    checks.push(await smokeHealth(context, cli.baseUrl));
    await context.close();

    if (cli.authed) {
      try {
        if (!billed) {
          checks.push({ name: 'authed:quick-dispatch', status: 'fail', detail: 'Skipped because the billed cost could not be read from source.' });
        } else {
          checks.push(...await runAuthed(browser, cli.baseUrl, outDir, billed, cli.keepJunto));
        }
      } catch (error) {
        checks.push({
          name: 'authed',
          status: 'fail',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await browser.close();
  }

  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };
  const report = {
    ok: summary.fail === 0,
    baseUrl: cli.baseUrl,
    mode: cli.authed ? 'public+authed' : 'public',
    startedAt,
    finishedAt: new Date().toISOString(),
    leaderboardBudgetMs: cli.leaderboardBudgetMs,
    leaderboardMode: cli.leaderboardMode,
    billedQuickDispatchCredits: billed,
    summary,
    checks,
  };

  const jsonPath = path.join(outDir, 'verify.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`\nWrote ${jsonPath}\n`);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  if (message.includes("Executable doesn't exist") || message.includes('browserType.launch')) {
    process.stderr.write('Install the browser with: npx playwright install chromium\n');
  }
  process.exitCode = 1;
});

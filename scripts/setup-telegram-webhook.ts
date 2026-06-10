// Register the Telegram bot webhook. Run once after deploy:
//
//   npx tsx scripts/setup-telegram-webhook.ts
//
// Requires env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_URL (e.g. https://www.myjunto.xyz/api/telegram/webhook)
// Optional: TELEGRAM_WEBHOOK_SECRET — if set, TG will echo it in the x-telegram-bot-api-secret-token header
// so the webhook route can verify authenticity.

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = process.env.TELEGRAM_WEBHOOK_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  if (!url) throw new Error('TELEGRAM_WEBHOOK_URL not set (e.g. https://www.myjunto.xyz/api/telegram/webhook)');

  const body: Record<string, unknown> = {
    url,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  };
  if (secret) body.secret_token = secret;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log('setWebhook:', data);

  // Slash-command autocomplete + menu button. Keep in sync with the handler in
  // src/app/api/telegram/webhook/route.ts.
  const commands = [
    { command: 'menu', description: 'Action buttons for common tasks' },
    { command: 'positions', description: 'Open positions + unrealized P&L' },
    { command: 'pnl', description: 'Realized today / 7d / all-time + equity' },
    { command: 'mandates', description: 'List your trading mandates' },
    { command: 'ticks', description: 'Recent tick-run activity' },
    { command: 'pause', description: 'Pause a mandate (/pause <name>)' },
    { command: 'resume', description: 'Resume a mandate (/resume <name>)' },
    { command: 'close', description: 'Market-close a ticker (/close <ticker>)' },
    { command: 'help', description: 'Show all commands' },
    { command: 'start', description: 'Link your Junto account' },
  ];
  const cmdRes = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  }).then((r) => r.json());
  console.log('setMyCommands:', cmdRes);

  const menuRes = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menu_button: { type: 'commands' } }),
  }).then((r) => r.json());
  console.log('setChatMenuButton:', menuRes);

  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json());
  console.log('getWebhookInfo:', info);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

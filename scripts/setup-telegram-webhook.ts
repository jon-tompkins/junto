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
    allowed_updates: ['message'],
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

  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json());
  console.log('getWebhookInfo:', info);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

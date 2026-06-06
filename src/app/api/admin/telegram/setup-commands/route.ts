import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { setBotCommands } from '@/lib/telegram/client';

const COMMANDS = [
  { command: 'positions', description: 'Open positions + unrealized P&L' },
  { command: 'pnl', description: 'Realized today/7d/all-time + equity' },
  { command: 'mandates', description: 'List your mandates' },
  { command: 'ticks', description: 'Recent tick-run activity' },
  { command: 'pause', description: 'Pause a mandate by name' },
  { command: 'resume', description: 'Resume a mandate by name' },
  { command: 'close', description: 'Market-close a position by ticker' },
  { command: 'help', description: 'List available commands' },
  { command: 'start', description: 'Link your Junto account' },
];

export async function POST() {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await setBotCommands(COMMANDS);
    return NextResponse.json({ ok: true, commands: COMMANDS });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

// Allow GET too — easier to hit from a browser address bar after admin login.
export async function GET() {
  return POST();
}

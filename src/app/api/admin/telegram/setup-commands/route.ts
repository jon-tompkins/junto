import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { setBotCommands } from '@/lib/telegram/client';

const COMMANDS = [
  { command: 'positions', description: 'Show active trading positions + P&L' },
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

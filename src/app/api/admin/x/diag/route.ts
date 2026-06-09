import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// GET /api/admin/x/diag — reports which X env vars are present without
// leaking values. Admin-only.
export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({
    X_API_KEY: Boolean(process.env.X_API_KEY),
    X_API_SECRET: Boolean(process.env.X_API_SECRET),
    X_ACCESS_TOKEN: Boolean(process.env.X_ACCESS_TOKEN),
    X_ACCESS_TOKEN_SECRET: Boolean(process.env.X_ACCESS_TOKEN_SECRET),
    api_key_len: process.env.X_API_KEY?.length || 0,
    access_token_starts_with: process.env.X_ACCESS_TOKEN?.slice(0, 6) || null,
  });
}

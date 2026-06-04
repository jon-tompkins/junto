import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createBrokerAccount, getBrokerAccount, type BrokerKycPayload } from '@/lib/trading/broker';

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  if (session?.user?.twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', session.user.twitterId).single();
    return data?.id || null;
  }
  if (session?.user?.googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', session.user.googleId).single();
    return data?.id || null;
  }
  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

  const supabase = getSupabase();
  const { data: user } = await supabase
    .from('users')
    .select('alpaca_account_id, alpaca_account_status, alpaca_account_created_at')
    .eq('id', userId)
    .single();

  if (!user?.alpaca_account_id) return NextResponse.json({ account: null });

  // Refresh status from Alpaca (best-effort)
  try {
    const live = await getBrokerAccount(user.alpaca_account_id);
    if (live.status !== user.alpaca_account_status) {
      await supabase.from('users').update({ alpaca_account_status: live.status }).eq('id', userId);
    }
    return NextResponse.json({ account: { id: live.id, status: live.status, account_number: live.account_number } });
  } catch {
    return NextResponse.json({ account: { id: user.alpaca_account_id, status: user.alpaca_account_status } });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from('users')
    .select('alpaca_account_id')
    .eq('id', userId)
    .single();
  if (existing?.alpaca_account_id) {
    return NextResponse.json({ error: 'Account already opened', accountId: existing.alpaca_account_id }, { status: 409 });
  }

  const body = await req.json();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '0.0.0.0';
  const now = new Date().toISOString();

  const payload: BrokerKycPayload = {
    contact: {
      email_address: body.email,
      phone_number: body.phone,
      street_address: [body.street1, body.street2].filter(Boolean),
      city: body.city,
      state: body.state,
      postal_code: body.postalCode,
      country: body.country || 'USA',
    },
    identity: {
      given_name: body.givenName,
      family_name: body.familyName,
      date_of_birth: body.dateOfBirth, // YYYY-MM-DD
      tax_id: body.taxId,
      tax_id_type: 'USA_SSN',
      country_of_citizenship: body.citizenship || 'USA',
      country_of_birth: body.birthCountry || 'USA',
      country_of_tax_residence: body.taxResidence || 'USA',
      funding_source: body.fundingSource || ['employment_income'],
    },
    disclosures: {
      is_control_person: !!body.isControlPerson,
      is_affiliated_exchange_or_finra: !!body.isAffiliated,
      is_politically_exposed: !!body.isPep,
      immediate_family_exposed: !!body.familyPep,
    },
    agreements: [
      { agreement: 'customer_agreement', signed_at: now, ip_address: ip },
      { agreement: 'account_agreement', signed_at: now, ip_address: ip },
    ],
  };

  try {
    const account = await createBrokerAccount(payload);
    await supabase
      .from('users')
      .update({
        alpaca_account_id: account.id,
        alpaca_account_status: account.status,
        alpaca_account_created_at: account.created_at,
      })
      .eq('id', userId);
    return NextResponse.json({ account: { id: account.id, status: account.status, account_number: account.account_number } }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/broker/accounts]', err);
    return NextResponse.json({ error: err?.message || 'Failed to open account' }, { status: 500 });
  }
}

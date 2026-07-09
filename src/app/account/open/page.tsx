'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface AccountStatus {
  id: string;
  status: string;
  account_number?: string;
}

const FUNDING_SOURCES = [
  { value: 'employment_income', label: 'Employment income' },
  { value: 'investments', label: 'Investments' },
  { value: 'inheritance', label: 'Inheritance' },
  { value: 'business_income', label: 'Business income' },
  { value: 'savings', label: 'Savings' },
  { value: 'family', label: 'Family' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

export default function OpenAccountPage() {
  const { status } = useSession();
  const router = useRouter();
  const [existing, setExisting] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    givenName: '',
    familyName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    taxId: '',
    street1: '',
    street2: '',
    city: '',
    state: 'NY',
    postalCode: '',
    citizenship: 'USA',
    fundingSource: 'employment_income',
    isControlPerson: false,
    isAffiliated: false,
    isPep: false,
    familyPep: false,
    agreesCustomer: false,
    agreesAccount: false,
  });

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/broker/accounts')
      .then(r => r.ok ? r.json() : { account: null })
      .then(d => setExisting(d.account))
      .finally(() => setLoading(false));
  }, [status]);

  async function submit() {
    setError(null);
    if (!form.agreesCustomer || !form.agreesAccount) {
      setError('Please accept both agreements');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/broker/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, fundingSource: [form.fundingSource] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to open account');
      setExisting(data.account);
    } catch (err: any) {
      setError(err?.message || 'Failed to open account');
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-2xl mx-auto px-6 py-12 text-parchment/60">Loading…</div>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-2xl mx-auto px-6 py-12">
          <Link href="/login?callbackUrl=/account/open" className="text-brass">Sign in to continue</Link>
        </div>
      </main>
    );
  }

  if (existing) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-2xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-2">Brokerage account</h1>
          <p className="text-sm text-parchment/60 mb-8">Managed by myjunto via Alpaca</p>

          <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-parchment/60 font-mono mb-1">Status</div>
                <div className="text-parchment">{existing.status}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-parchment/60 font-mono mb-1">Account #</div>
                <div className="text-parchment font-mono">{existing.account_number || '—'}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-wider text-parchment/60 font-mono mb-1">Account ID</div>
                <div className="text-parchment/60 font-mono text-xs">{existing.id}</div>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6">
            <h2 className="text-sm uppercase tracking-wider text-parchment/60 font-[var(--font-oswald)] mb-3">Next: fund the account</h2>
            <p className="text-xs text-parchment/60 mb-4">
              ACH funding via Plaid is wired as a stub for now. Production-ready funding ships once Broker API agreement is signed.
            </p>
            <button
              onClick={async () => {
                const res = await fetch('/api/broker/funding', { method: 'POST' });
                alert(JSON.stringify(await res.json(), null, 2));
              }}
              className="px-4 py-2 rounded bg-brass text-ink text-sm font-bold uppercase tracking-wide"
            >
              Set up ACH (stub)
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-2">Open a brokerage account</h1>
        <p className="text-sm text-parchment/60 mb-8">
          Skip the &quot;create an Alpaca account and paste keys&quot; dance — open a managed account in myjunto.
          Trading happens through your Alpaca account but lives inside this app.
        </p>

        <div className="space-y-6">
          <Section title="Personal">
            <Row>
              <Field label="First name">
                <Input value={form.givenName} onChange={v => setForm({ ...form, givenName: v })} />
              </Field>
              <Field label="Last name">
                <Input value={form.familyName} onChange={v => setForm({ ...form, familyName: v })} />
              </Field>
            </Row>
            <Row>
              <Field label="Date of birth">
                <Input type="date" value={form.dateOfBirth} onChange={v => setForm({ ...form, dateOfBirth: v })} />
              </Field>
              <Field label="SSN (9 digits)">
                <Input value={form.taxId} onChange={v => setForm({ ...form, taxId: v })} placeholder="123-45-6789" />
              </Field>
            </Row>
          </Section>

          <Section title="Contact">
            <Row>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
              </Field>
              <Field label="Phone (+1…)">
                <Input value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+15551234567" />
              </Field>
            </Row>
            <Field label="Street address">
              <Input value={form.street1} onChange={v => setForm({ ...form, street1: v })} />
            </Field>
            <Field label="Apt / suite (optional)">
              <Input value={form.street2} onChange={v => setForm({ ...form, street2: v })} />
            </Field>
            <Row>
              <Field label="City">
                <Input value={form.city} onChange={v => setForm({ ...form, city: v })} />
              </Field>
              <Field label="State">
                <select
                  value={form.state}
                  onChange={e => setForm({ ...form, state: e.target.value })}
                  className={inputCls}
                >
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="ZIP">
                <Input value={form.postalCode} onChange={v => setForm({ ...form, postalCode: v })} />
              </Field>
            </Row>
          </Section>

          <Section title="Funding source">
            <select
              value={form.fundingSource}
              onChange={e => setForm({ ...form, fundingSource: e.target.value })}
              className={inputCls}
            >
              {FUNDING_SOURCES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Section>

          <Section title="Disclosures">
            <Check
              checked={form.isControlPerson}
              onChange={v => setForm({ ...form, isControlPerson: v })}
              label="I am a control person of a publicly-traded company"
            />
            <Check
              checked={form.isAffiliated}
              onChange={v => setForm({ ...form, isAffiliated: v })}
              label="I am affiliated with an exchange or FINRA member"
            />
            <Check
              checked={form.isPep}
              onChange={v => setForm({ ...form, isPep: v })}
              label="I am a politically exposed person"
            />
            <Check
              checked={form.familyPep}
              onChange={v => setForm({ ...form, familyPep: v })}
              label="An immediate family member is politically exposed"
            />
          </Section>

          <Section title="Agreements">
            <Check
              checked={form.agreesCustomer}
              onChange={v => setForm({ ...form, agreesCustomer: v })}
              label="I agree to the Alpaca Customer Agreement"
            />
            <Check
              checked={form.agreesAccount}
              onChange={v => setForm({ ...form, agreesAccount: v })}
              label="I agree to the Alpaca Account Agreement"
            />
          </Section>

          {error && <p className="text-sm text-bear">{error}</p>}

          <button
            onClick={submit}
            disabled={saving}
            className="w-full px-5 py-4 bg-brass hover:bg-brass/80 disabled:opacity-40 text-ink rounded font-bold uppercase tracking-wide text-sm"
            style={{ fontFamily: 'var(--font-oswald)' }}
          >
            {saving ? 'Opening account…' : 'Open account'}
          </button>

          <p className="text-[11px] text-parchment/50 text-center">
            By submitting, you authorize Alpaca Securities LLC (the underlying broker-dealer) to open an account in your name.
            myjunto routes trades but does not custody funds.
          </p>
        </div>
      </div>
    </main>
  );
}

const inputCls = 'w-full bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment focus:outline-none focus:border-brass';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-5 space-y-3">
      <h2 className="text-xs uppercase tracking-wider text-parchment/60 font-[var(--font-oswald)]">{title}</h2>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-parchment/60 font-mono block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, type, placeholder }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input
      type={type || 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputCls}
    />
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-brass"
      />
      <span className="text-sm text-parchment/80">{label}</span>
    </label>
  );
}

import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

export const metadata = {
  title: 'Privacy Policy · myjunto',
  description:
    'What data myjunto collects, how it is used and protected, and the choices you have.',
};

const LAST_UPDATED = 'June 17, 2026';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-parchment/60">
            Last updated {LAST_UPDATED}. This is a first-pass draft for review — it
            should be reviewed by counsel before it governs real users.
          </p>
        </header>

        {/* Draft banner */}
        <div className="bg-surface border border-bear/40 rounded p-4 mb-10 text-sm text-parchment/70">
          <span className="text-bear font-semibold font-[var(--font-oswald)] uppercase tracking-wide mr-2">
            Draft
          </span>
          Internal review copy. The data-handling commitments below (especially around
          brokerage credentials and financial data) must be confirmed against actual
          system behavior and blessed by counsel before publication.
        </div>

        <nav className="mb-12 text-sm">
          <ul className="space-y-1.5">
            <li><a href="#what" className="text-brass hover:text-brass/80 transition">1. What We Collect</a></li>
            <li><a href="#use" className="text-brass hover:text-brass/80 transition">2. How We Use It</a></li>
            <li><a href="#brokerage" className="text-brass hover:text-brass/80 transition">3. Brokerage Credentials &amp; Financial Data</a></li>
            <li><a href="#sharing" className="text-brass hover:text-brass/80 transition">4. Sharing &amp; Third Parties</a></li>
            <li><a href="#security" className="text-brass hover:text-brass/80 transition">5. Security</a></li>
            <li><a href="#retention" className="text-brass hover:text-brass/80 transition">6. Retention</a></li>
            <li><a href="#rights" className="text-brass hover:text-brass/80 transition">7. Your Rights &amp; Choices</a></li>
            <li><a href="#changes" className="text-brass hover:text-brass/80 transition">8. Changes &amp; Contact</a></li>
          </ul>
        </nav>

        <Section id="what" n="1" title="What We Collect">
          <p>We collect only what we need to operate myjunto:</p>
          <ul className="list-disc pl-5 space-y-2 my-4 text-parchment/80">
            <li>
              <strong>Account information</strong> — your email, authentication
              details, and subscription/credit status.
            </li>
            <li>
              <strong>Your selections</strong> — the accounts, sources, juntos, and
              strategies you choose to track, and your settings and preferences.
            </li>
            <li>
              <strong>Usage data</strong> — how you interact with the platform (pages
              viewed, features used) and basic technical data such as device and log
              information, used to keep the service running and secure.
            </li>
            <li>
              <strong>Communications</strong> — messages you send us, and the Telegram
              chat link you set up for trade approvals.
            </li>
            <li>
              <strong>Brokerage connection data</strong> — if you connect a brokerage,
              the API keys you provide and the account data we read to operate the
              features you enable. See Section 3.
            </li>
          </ul>
          <p>
            The signals and market information we publish are derived from public and
            third-party sources, not from your personal data.
          </p>
        </Section>

        <Section id="use" n="2" title="How We Use It">
          <p>We use your information to:</p>
          <ul className="list-disc pl-5 space-y-2 my-4 text-parchment/80">
            <li>provide, maintain, and improve the platform and its features;</li>
            <li>compile and deliver the information you request based on the accounts you follow;</li>
            <li>operate any execution features you explicitly enable, within the parameters you set;</li>
            <li>send service communications, approvals, and account notices;</li>
            <li>secure the platform, prevent abuse, and comply with legal obligations.</li>
          </ul>
          <p>
            We do not use your personal financial data to make decisions on your behalf,
            and we do not sell it.
          </p>
        </Section>

        <Section id="brokerage" n="3" title="Brokerage Credentials & Financial Data">
          <p>
            <strong>myjunto never receives your brokerage login username or password.</strong>{' '}
            If you connect a brokerage (such as Alpaca), you provide an API key/secret
            scoped to that broker, or authorize access through the broker. Those
            credentials are <strong>encrypted at rest</strong> and used solely to
            operate the features you enable, within the parameters and approvals you
            configure.
          </p>
          <p>
            We read account data (such as positions, orders, and balances) only as
            needed to show you your activity and run those features. We do not sell
            your financial data, and we do not share it except as described in Section
            4. You can revoke access at any time from your settings or directly with
            your broker.
          </p>
        </Section>

        <Section id="sharing" n="4" title="Sharing & Third Parties">
          <p>We share information only in limited circumstances:</p>
          <ul className="list-disc pl-5 space-y-2 my-4 text-parchment/80">
            <li>
              <strong>Service providers</strong> — vendors that help us run the platform
              (hosting, database, email, data sources, your connected brokerage),
              processing data on our behalf under appropriate terms.
            </li>
            <li>
              <strong>Legal requirements</strong> — when required by law, regulation, or
              valid legal process, or to protect the rights, safety, and security of
              myjunto and its users.
            </li>
            <li>
              <strong>Business transfers</strong> — in connection with a merger,
              acquisition, or sale of assets, subject to this policy.
            </li>
          </ul>
          <p>We do not sell your personal information.</p>
        </Section>

        <Section id="security" n="5" title="Security">
          <p>
            We use reasonable technical and organizational measures to protect your
            information, including encryption of brokerage secrets at rest and access
            controls. No system is perfectly secure, however, and we cannot guarantee
            absolute security. You are responsible for keeping your account credentials
            confidential.
          </p>
        </Section>

        <Section id="retention" n="6" title="Retention">
          <p>
            We retain your information for as long as your account is active or as
            needed to provide the service, and afterward only as required to comply
            with legal obligations, resolve disputes, and enforce our agreements. When
            you delete your account, we delete or anonymize your personal information
            within a reasonable period, except where retention is legally required.
          </p>
        </Section>

        <Section id="rights" n="7" title="Your Rights & Choices">
          <p>
            Depending on where you live, you may have the right to access, correct,
            export, or delete your personal information, and to object to or restrict
            certain processing. You can:
          </p>
          <ul className="list-disc pl-5 space-y-2 my-4 text-parchment/80">
            <li>update your selections and settings at any time;</li>
            <li>disconnect a connected brokerage and revoke its keys;</li>
            <li>request access to or deletion of your data by contacting us;</li>
            <li>close your account.</li>
          </ul>
          <p>
            We will honor verified requests as required by applicable law. [Specific
            CCPA/GDPR mechanics and any required disclosures to be finalized with
            counsel.]
          </p>
        </Section>

        <Section id="changes" n="8" title="Changes & Contact">
          <p>
            We may update this policy from time to time. Material changes will be
            communicated through the platform, and the &ldquo;last updated&rdquo; date
            above will change. Questions or requests can be sent to
            [PRIVACY CONTACT EMAIL TBD].
          </p>
        </Section>

        <footer className="mt-12 pt-6 border-t border-[rgb(var(--t-brass) / 0.28)] text-sm text-parchment/60">
          <p className="mb-3">
            Bracketed items and the entire document require review by counsel before it
            governs real users.
          </p>
          <div className="flex gap-4">
            <Link href="/terms" className="text-brass hover:text-brass/80 transition">
              Terms &amp; Disclosures
            </Link>
            <Link href="/admin" className="text-brass hover:text-brass/80 transition">
              ← Back to Admin
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-6">
      <h2 className="text-xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-4 flex items-baseline gap-3">
        <span className="text-brass">{n}</span>
        {title}
      </h2>
      <div className="space-y-4 text-parchment/70 leading-relaxed">{children}</div>
    </section>
  );
}

import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

export const metadata = {
  title: 'Terms & Disclosures · myjunto',
  description:
    'How myjunto works, what it is and is not, and the terms that govern your use of the platform.',
};

const LAST_UPDATED = 'June 17, 2026';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-2">
            Terms &amp; Disclosures
          </h1>
          <p className="text-sm text-[#F5EFE0]/45">
            Last updated {LAST_UPDATED}. This is a first-pass draft for review — it
            should be blessed by a securities attorney before it goes live.
          </p>
        </header>

        {/* Lawyer-review banner */}
        <div className="bg-[#141210] border border-[#e8453c]/40 rounded p-4 mb-10 text-sm text-[#F5EFE0]/70">
          <span className="text-[#e8453c] font-semibold font-[var(--font-oswald)] uppercase tracking-wide mr-2">
            Draft
          </span>
          Internal review copy. The positioning here is designed to keep myjunto on
          the publisher-of-information side of U.S. securities law (the publisher&apos;s
          exclusion under the Investment Advisers Act, per <em>Lowe v. SEC</em>). A
          licensed securities lawyer must confirm the final language.
        </div>

        <nav className="mb-12 text-sm">
          <ul className="space-y-1.5">
            <li><a href="#opt-in" className="text-[#B08D57] hover:text-[#B08D57]/80 transition">1. Opt-In Consent</a></li>
            <li><a href="#not-advice" className="text-[#B08D57] hover:text-[#B08D57]/80 transition">2. Not Investment Advice</a></li>
            <li><a href="#risk" className="text-[#B08D57] hover:text-[#B08D57]/80 transition">3. Risk &amp; Loss-of-Capital Disclosure</a></li>
            <li><a href="#tos" className="text-[#B08D57] hover:text-[#B08D57]/80 transition">4. Terms of Service</a></li>
          </ul>
        </nav>

        {/* 1. Opt-in consent */}
        <Section id="opt-in" n="1" title="Opt-In Consent">
          <p>
            By enabling tracking of one or more accounts, sources, or strategies on
            myjunto, you are making a request for information. Specifically, you are
            telling us:
          </p>
          <blockquote className="border-l-2 border-[#B08D57] pl-4 my-4 italic text-[#F5EFE0]/80">
            &ldquo;I would like information provided to me based on the publicly
            observable activity of the accounts and sources I select. I understand
            myjunto compiles and relays that activity to me, and that the same
            information is made available impersonally to anyone else who follows the
            same accounts.&rdquo;
          </blockquote>
          <p>
            myjunto is an information service. We aggregate, organize, and relay
            signals derived from public activity. We do not know your personal
            financial situation, we do not tailor information to it, and we do not
            tell you what to buy or sell. Choosing which accounts to follow is your
            decision; acting on the information you receive is your decision.
          </p>
          <p>
            You may stop tracking any account or source, and pause or close your
            account, at any time.
          </p>
        </Section>

        {/* 2. Not investment advice */}
        <Section id="not-advice" n="2" title="Not Investment Advice">
          <p>
            <strong>myjunto is not an investment adviser, broker-dealer, or
            financial planner, and nothing on the platform is investment advice.</strong>{' '}
            The information, signals, summaries, and data we provide are for
            informational and educational purposes only. They are impersonal — the
            same information is delivered to every user who follows the same accounts
            or sources — and are not a recommendation, solicitation, or endorsement
            to buy, sell, or hold any security or other asset.
          </p>
          <p>
            We do not provide personalized advice, do not act as a fiduciary, and do
            not consider any individual user&apos;s investment objectives, financial
            situation, risk tolerance, or needs. Any decision you make is your own,
            and you are solely responsible for it. You should consult a licensed
            financial, tax, or legal professional before making any investment
            decision.
          </p>
          <p>
            Where myjunto offers tools that place orders with a connected brokerage,
            those orders are executed only under parameters and approvals you set and
            confirm. myjunto does not exercise discretion over your account, does not
            decide on your behalf which assets to trade, and the presence of an
            execution tool does not make any signal a recommendation.
          </p>
        </Section>

        {/* 3. Risk disclosure */}
        <Section id="risk" n="3" title="Risk & Loss-of-Capital Disclosure">
          <p>
            <strong>Investing involves substantial risk, including the possible loss
            of your entire investment.</strong> Please read and understand the
            following before acting on any information from myjunto:
          </p>
          <ul className="list-disc pl-5 space-y-2 my-4 text-[#F5EFE0]/80">
            <li>
              <strong>Past activity is not predictive.</strong> The historical or
              recent activity of any tracked account is not a guarantee or indication
              of future results. Accounts you follow may lose money, may not disclose
              all of their positions, and may act on information or motives you cannot
              see.
            </li>
            <li>
              <strong>Information may be delayed, incomplete, or wrong.</strong>{' '}
              Signals are derived from third-party and public sources that may be
              inaccurate, out of date, or unavailable. We do not warrant the accuracy,
              completeness, or timeliness of any information.
            </li>
            <li>
              <strong>Markets are volatile.</strong> Prices can move sharply and
              unpredictably. Leverage, options, crypto, and thinly traded assets carry
              heightened risk, including losses exceeding your initial outlay.
            </li>
            <li>
              <strong>Execution risk.</strong> If you use a connected brokerage,
              orders may fill at prices different from those shown, may not fill at
              all, or may be affected by slippage, gaps, halts, or outages outside our
              control.
            </li>
            <li>
              <strong>You can lose everything.</strong> Never invest money you cannot
              afford to lose. Only you are responsible for the consequences of your
              trades and investments.
            </li>
          </ul>
        </Section>

        {/* 4. Terms of service */}
        <Section id="tos" n="4" title="Terms of Service">
          <SubSection title="4.1 What myjunto is">
            <p>
              myjunto is a publisher and aggregator of information about the publicly
              observable activity of accounts and sources that users elect to follow.
              We provide a bona fide, regular, and impersonal information service. We
              are not, and do not hold ourselves out as, an investment adviser or
              broker-dealer, and we provide no individualized advice. To the extent any
              law might otherwise treat our publications as advice, we rely on the
              publisher&apos;s exclusion available to bona fide publishers of general
              and regular circulation.
            </p>
          </SubSection>

          <SubSection title="4.2 No advisory or fiduciary relationship">
            <p>
              Your use of myjunto does not create an investment-advisory, brokerage,
              fiduciary, agency, or other special relationship between you and us. We
              owe you no fiduciary duty. We do not manage your assets, do not exercise
              investment discretion, and do not act as your agent in any market.
            </p>
          </SubSection>

          <SubSection title="4.3 Your responsibilities">
            <p>
              You are solely responsible for evaluating the information you receive,
              for your investment and trading decisions, for any brokerage account you
              connect, and for compliance with all laws that apply to you. You
              represent that you are of legal age and legally permitted to use the
              platform in your jurisdiction.
            </p>
          </SubSection>

          <SubSection title="4.4 Connected brokerage accounts">
            <p>
              If you connect a third-party brokerage (such as Alpaca), you authorize
              myjunto to transmit orders and read account data only as needed to
              provide the features you enable, and only within the parameters and
              approvals you configure. Your brokerage relationship is governed by the
              broker&apos;s own agreements. We are not responsible for the broker&apos;s
              acts, omissions, execution, or availability. You may revoke access at any
              time.
            </p>
          </SubSection>

          <SubSection title="4.5 Data handling">
            <p>
              myjunto never receives your brokerage login credentials. Any API keys you
              provide are encrypted at rest and used solely to operate the features you
              enable. We do not sell your personal financial data. Our handling of your
              information is further described in our{' '}
              <Link href="/privacy" className="text-[#B08D57] hover:text-[#B08D57]/80 transition underline">
                Privacy Policy
              </Link>
              .
            </p>
          </SubSection>

          <SubSection title="4.6 No warranties">
            <p>
              The platform and all information are provided &ldquo;as is&rdquo; and
              &ldquo;as available,&rdquo; without warranties of any kind, express or
              implied, including merchantability, fitness for a particular purpose, and
              non-infringement. We do not warrant that the platform will be
              uninterrupted, error-free, or secure, or that any information is accurate
              or complete.
            </p>
          </SubSection>

          <SubSection title="4.7 Limitation of liability">
            <p>
              To the maximum extent permitted by law, myjunto and its operators will
              not be liable for any trading or investment losses, or for any indirect,
              incidental, special, consequential, or punitive damages, arising out of
              or relating to your use of the platform or any information provided. Our
              total aggregate liability for any claim will not exceed the greater of
              the amount you paid us in the twelve months before the claim or
              US&nbsp;$100.
            </p>
          </SubSection>

          <SubSection title="4.8 Indemnification">
            <p>
              You agree to indemnify and hold harmless myjunto and its operators from
              any claims, losses, or expenses (including reasonable legal fees) arising
              from your use of the platform, your investment decisions, or your breach
              of these terms.
            </p>
          </SubSection>

          <SubSection title="4.9 Arbitration & governing law">
            <p>
              These terms are governed by the laws of the State of [JURISDICTION TBD],
              without regard to conflict-of-laws rules. Any dispute will be resolved by
              binding individual arbitration rather than in court, and you waive any
              right to participate in a class action, except where prohibited by law.
              [Arbitration provider, seat, and carve-outs to be finalized with
              counsel.]
            </p>
          </SubSection>

          <SubSection title="4.10 Changes">
            <p>
              We may update these terms from time to time. Material changes will be
              communicated through the platform. Continued use after changes take
              effect constitutes acceptance.
            </p>
          </SubSection>
        </Section>

        <footer className="mt-12 pt-6 border-t border-[rgba(176,141,87,0.28)] text-sm text-[#F5EFE0]/45">
          <p className="mb-3">
            Bracketed items ([JURISDICTION TBD], arbitration specifics) and the entire
            document require sign-off from a licensed securities attorney before
            publication.
          </p>
          <Link href="/admin" className="text-[#B08D57] hover:text-[#B08D57]/80 transition">
            ← Back to Admin
          </Link>
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
        <span className="text-[#B08D57]">{n}</span>
        {title}
      </h2>
      <div className="space-y-4 text-[#F5EFE0]/70 leading-relaxed">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-semibold font-[var(--font-oswald)] uppercase tracking-wider text-[#F5EFE0]/90 mb-2">
        {title}
      </h3>
      <div className="space-y-3 text-[#F5EFE0]/70 leading-relaxed">{children}</div>
    </div>
  );
}

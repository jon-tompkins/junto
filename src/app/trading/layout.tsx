import { redirect } from 'next/navigation';
import { getTradingAccess } from '@/lib/trading/access';

// Server-side gate for the whole /trading section. Operator-or-admin only;
// everyone else gets bounced to /pricing where the Operator card lives.
export default async function TradingLayout({ children }: { children: React.ReactNode }) {
  const access = await getTradingAccess();
  if (!access) redirect('/pricing?upgrade=operator');
  return (
    <>
      {children}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 pt-2 text-[11px] text-parchment/50 font-[var(--font-oswald)] uppercase tracking-wide flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
        <span>Powered by</span>
        <a
          href="https://alpaca.markets"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brass hover:text-parchment underline-offset-2 hover:underline normal-case tracking-normal"
        >
          Alpaca
        </a>
        <span className="leading-relaxed sm:leading-none">orders, positions, and protective brackets execute in your own Alpaca account.</span>
      </footer>
    </>
  );
}

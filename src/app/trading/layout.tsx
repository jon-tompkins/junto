import { redirect } from 'next/navigation';
import { getTradingAccess } from '@/lib/trading/access';

// Server-side gate for the whole /trading section. Operator-or-admin only;
// everyone else gets bounced to /pricing where the Operator card lives.
export default async function TradingLayout({ children }: { children: React.ReactNode }) {
  const access = await getTradingAccess();
  if (!access) redirect('/pricing?upgrade=operator');
  return <>{children}</>;
}

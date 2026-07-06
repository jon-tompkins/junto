// Hyperliquid venue module. Skeleton implementing the BrokerAdapter interface.
//
// NOT yet wired into the tick/monitor/amendment call sites — the existing HL
// logic (hyperliquid.ts + the broker branches in tick.ts) still runs. This
// exists so the interface is complete and adapterFor() can route HL mandates
// once that logic is migrated behind the adapter (next increment; will be
// paper-tested before it goes live).

import type { Mandate } from '../types';
import type { BrokerAdapter, NormalizedPosition, ProtectionOutcome } from '../adapter';
import type { SyntheticClose } from '../stops';

export class HyperliquidAdapter implements BrokerAdapter {
  readonly broker = 'hyperliquid';
  constructor(private readonly mandate: Mandate) {}

  // Perps trade 24/7 — the venue is always open.
  async isMarketOpen(): Promise<boolean> {
    return true;
  }

  async listPositions(): Promise<NormalizedPosition[]> {
    throw new Error('HyperliquidAdapter.listPositions not wired yet — HL still uses the existing path');
  }

  // HL positions carry native perp stops; protection is managed in the existing
  // HL flow, so there is nothing to reconcile here until that migrates over.
  async reconcileProtection(): Promise<ProtectionOutcome[]> {
    return [];
  }

  // Native perp stops rest on the venue — no synthetic tick sweep needed.
  async enforceStopsOnTick(): Promise<SyntheticClose[]> {
    return [];
  }

  // Silence "mandate assigned but never read" until the methods above are
  // fleshed out; the mandate is needed for the real implementation.
  protected get _mandate(): Mandate {
    return this.mandate;
  }
}

// Broker-adapter seam. The app talks to this venue-neutral interface; each
// venue (Alpaca, Hyperliquid) implements it however that venue actually works.
// User-facing behaviour (amendment cards, "move stop", journal, leaderboard)
// stays identical across venues; the mechanics (native OCO vs synthetic tick
// stop vs native perp stop) live inside the module.
//
// Migration status: interface + AlpacaAdapter are live foundation. The tick /
// monitor / amendment call sites are being moved onto adapterFor() incrementally
// — until then this coexists with the existing direct-Alpaca paths.

import type { Mandate } from './types';
import type { SyntheticClose } from './stops';
import { AlpacaAdapter } from './adapters/alpaca-adapter';
import { HyperliquidAdapter } from './adapters/hyperliquid-adapter';

export type { SyntheticClose } from './stops';

export type AssetClass = 'equity' | 'crypto';

export interface NormalizedPosition {
  symbol: string;      // venue-native symbol ('ETH/USD', 'AAPL')
  ticker: string;      // display/base ticker ('ETH', 'AAPL')
  side: 'long' | 'short';
  qty: number;
  avgEntry: number | null;
  currentPrice: number | null;
  assetClass: AssetClass;
  unrealizedPnl: number | null;
}

export interface ProtectionOutcome {
  ticker: string;
  // native   = resting broker order covers it (equity OCO / HL perp stop)
  // synthetic = enforced by the tick sweep (Alpaca spot crypto)
  status: 'native' | 'synthetic' | 'no_position' | 'no_levels' | 'error';
  detail?: string;
}

export interface BrokerAdapter {
  readonly broker: string;
  /** Is the venue open for trading right now? (Crypto/HL are always open.) */
  isMarketOpen(): Promise<boolean>;
  /** Live positions, normalized across venues. */
  listPositions(): Promise<NormalizedPosition[]>;
  /** Ensure protective coverage exists for every open trade. */
  reconcileProtection(): Promise<ProtectionOutcome[]>;
  /** Tick-time synthetic stop sweep. Returns closed trades; no-op where the
   *  venue has real resting stops. */
  enforceStopsOnTick(): Promise<SyntheticClose[]>;
}

export function adapterFor(mandate: Mandate): BrokerAdapter {
  if ((mandate.broker || 'alpaca') === 'hyperliquid') return new HyperliquidAdapter(mandate);
  return new AlpacaAdapter(mandate);
}

// Alpaca venue module. Implements the BrokerAdapter interface over the existing
// Alpaca client + protection + synthetic-stop primitives. Protection strategy
// per asset class: equities & crypto ETFs (IBIT) → native OCO; spot crypto
// (ETH/USD) → synthetic tick stop (Alpaca has no resting stop for crypto).

import { alpacaForMandate } from '../client';
import { getOpenTrades } from '../db';
import { protectMandate } from '../protection';
import { enforceSyntheticStops } from '../stops';
import { isCryptoTicker } from '../asset';
import type { Mandate } from '../types';
import type { BrokerAdapter, NormalizedPosition, ProtectionOutcome } from '../adapter';
import type { SyntheticClose } from '../stops';

export class AlpacaAdapter implements BrokerAdapter {
  readonly broker = 'alpaca';
  constructor(private readonly mandate: Mandate) {}

  private get alpaca() {
    return alpacaForMandate(this.mandate);
  }

  async isMarketOpen(): Promise<boolean> {
    try {
      const clock = await this.alpaca.getClock();
      return !!(clock as { is_open?: boolean }).is_open;
    } catch {
      return false;
    }
  }

  async listPositions(): Promise<NormalizedPosition[]> {
    const positions = await this.alpaca.getPositions().catch(() => []);
    return positions.map((p) => {
      const isCrypto = p.asset_class ? p.asset_class === 'crypto' : isCryptoTicker(p.symbol);
      return {
        symbol: p.symbol,
        ticker: p.symbol.replace(/\/.*$/, ''),
        side: p.side,
        qty: Number(p.qty),
        avgEntry: p.avg_entry_price != null ? Number(p.avg_entry_price) : null,
        currentPrice: p.current_price != null ? Number(p.current_price) : null,
        assetClass: isCrypto ? 'crypto' : 'equity',
        unrealizedPnl: p.unrealized_pl != null ? Number(p.unrealized_pl) : null,
      };
    });
  }

  async reconcileProtection(): Promise<ProtectionOutcome[]> {
    const { results } = await protectMandate(this.mandate.id);
    return results.map((r) => {
      let status: ProtectionOutcome['status'];
      if (r.action === 'protected' || r.action === 'already_protected') {
        status = r.detail?.includes('synthetic') ? 'synthetic' : 'native';
      } else if (r.action === 'no_position' || r.action === 'no_levels') {
        status = r.action;
      } else {
        status = 'error';
      }
      return { ticker: r.ticker, status, detail: r.detail };
    });
  }

  async enforceStopsOnTick(): Promise<SyntheticClose[]> {
    const alpaca = this.alpaca;
    const [trades, positions] = await Promise.all([
      getOpenTrades(this.mandate.id),
      alpaca.getPositions().catch(() => []),
    ]);
    return enforceSyntheticStops(this.mandate, alpaca, trades, positions);
  }
}

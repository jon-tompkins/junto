import type { Mandate } from './types';
import type { AlpacaPosition } from './alpaca';

export interface PortfolioAdjustment {
  type: 'reduce' | 'close';
  ticker: string;
  rationale: string;
  suggestedNotional?: number; // for reduce
}

/**
 * Phase 1 portfolio adjustment suggestions.
 * Returns suggestions for concentration reductions and idleness closes.
 * These become separate proposals from normal trade entries.
 */
export async function suggestPortfolioAdjustments(
  mandate: Mandate,
  positions: AlpacaPosition[],
  accountEquity: number
): Promise<PortfolioAdjustment[]> {
  const suggestions: PortfolioAdjustment[] = [];

  if (!positions.length || accountEquity <= 0) return suggestions;

  const sorted = [...positions].sort((a, b) =>
    (Number(b.market_value) || 0) - (Number(a.market_value) || 0)
  );

  const totalDeployed = sorted.reduce((sum, p) => sum + (Number(p.market_value) || 0), 0);
  const deployedPct = (totalDeployed / accountEquity) * 100;

  // Single position concentration
  const maxSingle = mandate.max_single_position_pct ?? 15;
  if (sorted.length > 0) {
    const largest = sorted[0];
    const largestPct = (Number(largest.market_value) || 0) / accountEquity * 100;
    if (largestPct > maxSingle) {
      const targetNotional = accountEquity * (maxSingle / 100);
      const reduceBy = Number(largest.market_value) - targetNotional;
      suggestions.push({
        type: 'reduce',
        ticker: largest.symbol,
        rationale: `Largest position at ${largestPct.toFixed(1)}% exceeds max single position limit of ${maxSingle}%`,
        suggestedNotional: Math.max(0, Math.round(reduceBy)),
      });
    }
  }

  // Top 3 concentration
  const maxTop3 = mandate.max_top3_concentration_pct ?? 50;
  const top3Notional = sorted.slice(0, 3).reduce((sum, p) => sum + (Number(p.market_value) || 0), 0);
  const top3Pct = (top3Notional / accountEquity) * 100;
  if (top3Pct > maxTop3 && sorted.length >= 3) {
    const largest = sorted[0];
    const targetNotional = accountEquity * (maxTop3 / 100) * 0.6; // rough target
    const reduceBy = Math.max(0, Number(largest.market_value) - targetNotional);
    if (reduceBy > 50) {
      suggestions.push({
        type: 'reduce',
        ticker: largest.symbol,
        rationale: `Top 3 positions at ${top3Pct.toFixed(1)}% exceeds limit of ${maxTop3}%`,
        suggestedNotional: Math.round(reduceBy),
      });
    }
  }

  // Idleness check (basic version - will be improved with real source activity)
  const idlenessDays = mandate.idleness_days_threshold ?? 14;
  // For now we use a simple heuristic: if unrealized P&L is flat/negative and position is old
  // Real implementation will check last source mention timestamp per ticker

  // Sector concentration placeholder (rough grouping)
  const maxSector = mandate.max_sector_concentration_pct ?? 35;
  // TODO: proper sector mapping + concentration calculation

  return suggestions;
}

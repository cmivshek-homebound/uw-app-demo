import type { Market } from '../types';

// ── Seasonality index by market ────────────────────────────────
// DEMO PLACEHOLDERS: fictional index levels, not real market data.
// One level per calendar month (Jan … Dec). Spring runs 1–2% above winter in
// Texas and Florida; LA is flatter. A month's seasonal mark adjustment is the
// ratio of its level to the prior month's.

export const SEASONALITY_INDEX: Record<Market, number[]> = {
  //          Jan    Feb    Mar    Apr     May    Jun    Jul    Aug    Sep    Oct    Nov    Dec
  DFW:       [98.9,  99.2,  99.8,  100.15, 100.6, 100.9, 100.8, 100.5, 100.1, 99.7,  99.3,  98.9],
  Houston:   [99.0,  99.3,  99.9,  100.2,  100.6, 100.8, 100.7, 100.4, 100.0, 99.7,  99.4,  99.0],
  Tampa:     [98.8,  99.2,  99.9,  100.3,  100.7, 100.6, 100.3, 100.0, 99.7,  99.4,  99.1,  98.8],
  'St. Pete':[98.9,  99.3,  99.9,  100.3,  100.6, 100.5, 100.2, 99.9,  99.6,  99.3,  99.1,  98.9],
  LA:        [99.5,  99.6,  99.85, 99.97,  100.15, 100.3, 100.3, 100.2, 100.05, 99.9, 99.75, 99.6],
};

/** Seasonal change from the prior month into `month` (YYYY-MM), as a percent. */
export function seasonalChangePct(market: Market, month: string): number {
  const m = Number(month.slice(5, 7)) - 1;
  const index = SEASONALITY_INDEX[market];
  return (index[m] / index[(m + 11) % 12] - 1) * 100;
}

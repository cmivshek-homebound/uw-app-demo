import type { Market } from '../types';

// ── Listing norms by market ────────────────────────────────────
// DEMO PLACEHOLDERS: fictional benchmarks for new-construction BOOL listings,
// used to judge whether a listing is ahead of or behind pace.

export interface MarketNorms {
  typicalDaysOnMarket: number;
  showingsPerWeek: number;
}

export const MARKET_NORMS: Record<Market, MarketNorms> = {
  DFW: { typicalDaysOnMarket: 60, showingsPerWeek: 1.7 },
  Houston: { typicalDaysOnMarket: 55, showingsPerWeek: 2.0 },
  Tampa: { typicalDaysOnMarket: 65, showingsPerWeek: 1.8 },
  'St. Pete': { typicalDaysOnMarket: 60, showingsPerWeek: 1.6 },
  LA: { typicalDaysOnMarket: 55, showingsPerWeek: 1.8 },
};

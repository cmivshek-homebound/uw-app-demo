import type { Market } from '../types';
import { ADU_ASSUMPTIONS, ADU_THIN_MARGIN } from './aduAssumptions';
import {
  CARRY_COST_PCT,
  CLOSING_COST_CORRECTED_ON,
  CLOSING_COST_PCT,
  CONTINGENCY_PCT,
  DEFAULT_BUILD_DAYS,
  DEFAULT_PRECON_DAYS,
  HOMEBOUND_FEE_PCT,
  LEGACY_CLOSING_COST_PCT,
  LISTING_PREP_DAYS,
  PLAN_TRANSACTION_PCT,
  SELLING_COST_PCT,
  TARGET_MARGIN_PCT,
} from './assumptions';
import { MARKET_NORMS } from './marketNorms';
import { MARKS_MANAGER } from './markReview';
import { SEASONALITY_INDEX, seasonalChangePct } from './seasonality';

// ── Assumptions registry ───────────────────────────────────────
// What the Assumptions page shows. Values are read straight from the files
// the app computes with (assumptions.ts, aduAssumptions.ts, seasonality.ts,
// marketNorms.ts); this file only adds where each came from, when it took
// effect, who approved it, and the change history.

export const MARKET_ORDER: Market[] = ['DFW', 'Houston', 'Tampa', 'St. Pete', 'LA'];

export type AssumptionCategory = 'Costs' | 'Timing' | 'Pricing' | 'ADU' | 'Seasonality';
export const CATEGORIES: AssumptionCategory[] = ['Costs', 'Timing', 'Pricing', 'ADU', 'Seasonality'];

/** What an assumption feeds, for the "used in" count. */
export type Usage = 'underwrites' | 'aduUnderwrites' | 'builds' | 'marks' | 'listings';

export interface Assumption {
  id: string;
  category: AssumptionCategory;
  name: string;
  /** One value for every market, or a value per market. */
  value: string | Record<Market, string>;
  source: string;
  effective: string;   // ISO date
  approvedBy: string;
  usedIn: Usage;
}

const pct = (n: number, digits = 1) => `${Number(n.toFixed(digits))}%`;
const days = (n: number) => `${n} days`;
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
const signedPct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;

function byMarket(fn: (m: Market) => string): Record<Market, string> {
  return Object.fromEntries(MARKET_ORDER.map((m) => [m, fn(m)])) as Record<Market, string>;
}

function adu(m: Market, fn: (a: Extract<(typeof ADU_ASSUMPTIONS)[Market], { offered: true }>) => string): string {
  const a = ADU_ASSUMPTIONS[m];
  return a.offered ? fn(a) : '—';
}

/** Spring peak (May–Jun) over January, from the seasonality index. */
function springLift(m: Market): number {
  const idx = SEASONALITY_INDEX[m];
  return (Math.max(idx[4], idx[5]) / idx[0] - 1) * 100;
}

export const ASSUMPTIONS: Assumption[] = [
  // ── Costs ──
  { id: 'closing', category: 'Costs', name: 'Closing costs (% of land)', value: pct(CLOSING_COST_PCT), source: 'Realized closings on sold homes', effective: CLOSING_COST_CORRECTED_ON, approvedBy: MARKS_MANAGER, usedIn: 'underwrites' },
  { id: 'carry', category: 'Costs', name: 'Carry and financing (% of build)', value: pct(CARRY_COST_PCT), source: 'Construction loan terms', effective: '2025-10-01', approvedBy: MARKS_MANAGER, usedIn: 'underwrites' },
  { id: 'selling', category: 'Costs', name: 'Selling costs (% of ESP)', value: pct(SELLING_COST_PCT), source: 'Brokerage agreements', effective: '2025-06-01', approvedBy: MARKS_MANAGER, usedIn: 'underwrites' },
  { id: 'contingency', category: 'Costs', name: 'Contingency (% of build budget)', value: pct(CONTINGENCY_PCT), source: 'Blueprint budget template', effective: '2025-06-01', approvedBy: MARKS_MANAGER, usedIn: 'builds' },

  // ── Timing ──
  { id: 'precon', category: 'Timing', name: 'Pre-con (close to start)', value: days(DEFAULT_PRECON_DAYS), source: 'Permit history, default when a lot has no path of its own', effective: '2025-06-01', approvedBy: MARKS_MANAGER, usedIn: 'builds' },
  { id: 'build', category: 'Timing', name: 'Build (start to CO)', value: byMarket((m) => days(DEFAULT_BUILD_DAYS[m])), source: 'Blueprint schedules, completed builds', effective: '2025-11-15', approvedBy: MARKS_MANAGER, usedIn: 'builds' },
  { id: 'listing-prep', category: 'Timing', name: 'CO to list', value: days(LISTING_PREP_DAYS), source: 'Sales ops checklist', effective: '2025-06-01', approvedBy: MARKS_MANAGER, usedIn: 'builds' },
  { id: 'days-to-sell', category: 'Timing', name: 'Days to sell (typical days on market)', value: byMarket((m) => days(MARKET_NORMS[m].typicalDaysOnMarket)), source: 'Market norms (placeholder benchmarks)', effective: '2025-12-01', approvedBy: MARKS_MANAGER, usedIn: 'listings' },

  // ── Pricing ──
  { id: 'target-margin', category: 'Pricing', name: 'Target margin (max land price)', value: pct(TARGET_MARGIN_PCT), source: 'Investment committee', effective: '2026-02-01', approvedBy: MARKS_MANAGER, usedIn: 'underwrites' },
  { id: 'markup', category: 'Pricing', name: 'Homebound fee / markup (% of ESP)', value: pct(HOMEBOUND_FEE_PCT), source: 'Plan selection model', effective: '2025-06-01', approvedBy: MARKS_MANAGER, usedIn: 'underwrites' },
  { id: 'plan-transaction', category: 'Pricing', name: 'Plan model transaction costs (% of ESP)', value: pct(PLAN_TRANSACTION_PCT), source: 'Plan selection model', effective: '2025-06-01', approvedBy: MARKS_MANAGER, usedIn: 'underwrites' },

  // ── ADU ──
  { id: 'adu-offered', category: 'ADU', name: 'ADU offered', value: byMarket((m) => (ADU_ASSUMPTIONS[m].offered ? 'Yes' : 'No')), source: 'Market zoning review', effective: '2025-09-01', approvedBy: MARKS_MANAGER, usedIn: 'aduUnderwrites' },
  { id: 'adu-build', category: 'ADU', name: 'ADU build ($/sqft)', value: byMarket((m) => adu(m, (a) => usd(a.buildPerSqft))), source: 'ADU bids by market', effective: '2026-03-10', approvedBy: MARKS_MANAGER, usedIn: 'aduUnderwrites' },
  { id: 'adu-uplift', category: 'ADU', name: 'ADU sale uplift ($/sqft)', value: byMarket((m) => adu(m, (a) => usd(a.upliftPerSqft))), source: 'Comps with and without ADUs', effective: '2025-09-01', approvedBy: MARKS_MANAGER, usedIn: 'aduUnderwrites' },
  { id: 'adu-fees', category: 'ADU', name: 'ADU permits and fees', value: byMarket((m) => adu(m, (a) => usd(a.permitsAndFees))), source: 'City fee schedules', effective: '2025-09-01', approvedBy: MARKS_MANAGER, usedIn: 'aduUnderwrites' },
  { id: 'adu-days', category: 'ADU', name: 'ADU added build time', value: byMarket((m) => adu(m, (a) => days(a.addedDays))), source: 'Blueprint schedules', effective: '2025-09-01', approvedBy: MARKS_MANAGER, usedIn: 'aduUnderwrites' },
  { id: 'adu-thin', category: 'ADU', name: 'Thin ADU threshold (added margin)', value: usd(ADU_THIN_MARGIN), source: 'Underwriting policy', effective: '2025-09-01', approvedBy: MARKS_MANAGER, usedIn: 'aduUnderwrites' },

  // ── Seasonality ──
  { id: 'season-spring', category: 'Seasonality', name: 'Spring peak vs. January', value: byMarket((m) => signedPct(springLift(m))), source: 'Seasonality index (placeholder)', effective: '2026-01-01', approvedBy: MARKS_MANAGER, usedIn: 'marks' },
  { id: 'season-april', category: 'Seasonality', name: 'April mark adjustment (vs. March)', value: byMarket((m) => signedPct(seasonalChangePct(m, '2026-04'))), source: 'Seasonality index (placeholder)', effective: '2026-01-01', approvedBy: MARKS_MANAGER, usedIn: 'marks' },
];

// ── Change log ─────────────────────────────────────────────────
// Each entry's new value is read from the current assumption, so the log
// can't disagree with what the app uses.
export interface AssumptionChange {
  on: string;           // ISO date
  assumptionId: string;
  label: string;        // which assumption (and market, if one)
  from: string;
  to: string;
  reason: string;
  link?: { to: string; label: string };
  requestedBy: string;
  approvedBy: string;
}

const laAdu = ADU_ASSUMPTIONS.LA.offered ? ADU_ASSUMPTIONS.LA.buildPerSqft : 0;

export const ASSUMPTION_CHANGES: AssumptionChange[] = [
  {
    on: '2026-03-10', assumptionId: 'adu-build', label: 'ADU build ($/sqft) · LA',
    from: usd(420), to: usd(laAdu),
    reason: 'Two Westside ADU bids came in above the book.',
    requestedBy: 'Elena Ruiz', approvedBy: MARKS_MANAGER,
  },
  {
    on: '2026-02-01', assumptionId: 'target-margin', label: 'Target margin',
    from: pct(14), to: pct(TARGET_MARGIN_PCT),
    reason: 'Investment committee raised the floor after the Q4 margin review.',
    requestedBy: 'Jordan Pike', approvedBy: MARKS_MANAGER,
  },
  {
    on: CLOSING_COST_CORRECTED_ON, assumptionId: 'closing', label: 'Closing costs (% of land)',
    from: pct(LEGACY_CLOSING_COST_PCT), to: pct(CLOSING_COST_PCT),
    reason: 'Sold homes closed at about 0.9% of land against 0.5% underwritten.',
    link: { to: '/marks?tab=accuracy', label: 'Underwriting accuracy finding' },
    requestedBy: 'Jordan Pike', approvedBy: MARKS_MANAGER,
  },
  {
    on: '2025-12-01', assumptionId: 'days-to-sell', label: 'Days to sell · Houston',
    from: days(50), to: days(MARKET_NORMS.Houston.typicalDaysOnMarket),
    reason: 'Fall listings ran longer across Inner Loop comps.',
    requestedBy: 'Priya Shah', approvedBy: MARKS_MANAGER,
  },
  {
    on: '2025-11-15', assumptionId: 'build', label: 'Build (start to CO) · LA',
    from: days(390), to: days(DEFAULT_BUILD_DAYS.LA),
    reason: 'LADBS plan check corrections added about a month to recent jobs.',
    requestedBy: 'Elena Ruiz', approvedBy: MARKS_MANAGER,
  },
  {
    on: '2025-10-01', assumptionId: 'carry', label: 'Carry and financing (% of build)',
    from: pct(5.5), to: pct(CARRY_COST_PCT),
    reason: 'Construction loan rate reset at renewal.',
    requestedBy: 'Luis Ortega', approvedBy: MARKS_MANAGER,
  },
];

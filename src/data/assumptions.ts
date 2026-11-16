import type { Market } from '../types';

// ── Underwriting assumptions: the single source ────────────────
// Every underwriting rate, margin target and cycle time the app uses lives
// here (or, for ADU, seasonality and listing norms, in their own data files:
// aduAssumptions.ts, seasonality.ts, marketNorms.ts). The Assumptions page
// (/data/assumptions) reads these values directly, so what it shows is what
// the underwrites, marks and schedules actually use.

// ── Costs ──
/** Closing costs on land, % of land price. Corrected from 0.5% in Jan 2026 (see the change log). */
export const CLOSING_COST_PCT = 0.9;
/** Underwrites before CLOSING_COST_CORRECTED_ON assumed this. */
export const LEGACY_CLOSING_COST_PCT = 0.5;
export const CLOSING_COST_CORRECTED_ON = '2026-01-01';
/** Construction-period financing and carry, % of build. */
export const CARRY_COST_PCT = 6;
/** Commissions and seller closing costs, % of ESP. */
export const SELLING_COST_PCT = 5.5;
/** Contingency line in every Blueprint build budget, % of vertical budget. */
export const CONTINGENCY_PCT = 3;

// ── Pricing ──
/** Net margin the max land price is solved for. */
export const TARGET_MARGIN_PCT = 15;
/** Homebound fee (markup) in the plan-selection model, % of ESP. */
export const HOMEBOUND_FEE_PCT = 5;
/** Transaction costs in the plan-selection model, % of ESP. */
export const PLAN_TRANSACTION_PCT = 3;

// ── Timing ──
/** Close to construction start, unless a lot's permitting path says otherwise. */
export const DEFAULT_PRECON_DAYS = 45;
/** Planned build duration (start to CO) for jobs not yet started. */
export const DEFAULT_BUILD_DAYS: Record<Market, number> = { DFW: 370, Houston: 365, Tampa: 380, 'St. Pete': 380, LA: 420 };
/** CO to list date: punch, clean, photos. */
export const LISTING_PREP_DAYS = 14;

import type { Asset } from '../types';
import { ASSETS } from './assets';
import { DFW_PLANS, checkFeasibility } from './plans';
import type { Plan } from './plans';
import { costStack, marginPct, maxLandPrice } from './underwriting';
import type { CostStack } from './underwriting';

// ── AI draft underwrites ───────────────────────────────────────
// One hardcoded AI draft per pipeline asset (opportunity / underwriting).
// Seeds hold only what the AI pulled or chose: lot data, plan picks with
// build budgets, the comp set and an ESP adjustment. ESP, the cost stack,
// envelope, ADU fit, margins, max land price and the capped confidence
// levels are derived by buildDraft so they stay consistent.
//
// Plan geometry comes from the plan library (DFW_PLANS); non-DFW markets
// use the plan names already underwritten on assets in that market.
// Underwriting-stage assets must match their assets.ts underwrite exactly.

export type Confidence = 'high' | 'medium' | 'low';

export type DraftSectionKey = 'lot' | 'plans' | 'adu' | 'comps' | 'recommendation';

/** Net margin the max land price is solved for. */
export const TARGET_MARGIN_PCT = 15;

// ADU rule. Rear yard = back of the primary footprint to the rear lot line.
export const MIN_ADU_SQFT = 400;
const MAX_ADU_SQFT = 800;
const ADU_UNIT_DEPTH_FT = 20;
const ADU_SEPARATION_FT = 5;   // from the primary house
const ADU_REAR_SETBACK_FT = 5; // from the rear lot line
export const MIN_ADU_REAR_YARD_FT = ADU_UNIT_DEPTH_FT + ADU_SEPARATION_FT + ADU_REAR_SETBACK_FT;
export const ADU_RULE =
  `An ADU fits when at least ${MIN_ADU_SQFT} sqft of buildable area remains and the rear yard ` +
  `(back of the primary footprint to the rear lot line) is at least ${MIN_ADU_REAR_YARD_FT} ft: ` +
  `a ${ADU_UNIT_DEPTH_FT} ft deep unit, ${ADU_SEPARATION_FT} ft from the house and ${ADU_REAR_SETBACK_FT} ft from the rear lot line.`;

// Overall score bands. A level caps the score at its band's ceiling.
const LEVEL_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const LEVEL_MAX_SCORE: Record<Confidence, number> = { high: 100, medium: 84, low: 64 };
const CONFIDENCE_LABELS: Record<Confidence, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function scoreLevel(score: number): Confidence {
  if (score > LEVEL_MAX_SCORE.medium) return 'high';
  if (score > LEVEL_MAX_SCORE.low) return 'medium';
  return 'low';
}

function lowest(...levels: Confidence[]): Confidence {
  return levels.reduce((a, b) => (LEVEL_RANK[b] < LEVEL_RANK[a] ? b : a));
}

interface LotSeed {
  widthFt: number;
  depthFt: number;
  zoning: string;
  setbacks: { front: number; side: number; rear: number };
  maxCoveragePct: number;
}

interface PlanSeed {
  planName: string;
  esp: number;
  build: number; // vertical budget
}

export interface DraftComp {
  address: string;
  sqft: number;
  salePrice: number;
  distanceMi: number;
  soldOn: string; // YYYY-MM-DD
}

interface DraftSeed {
  assetId: string;
  draftedInSec: number;
  confidenceScore: number; // 0–100, before caps
  confidence: Record<DraftSectionKey, Confidence>; // recommendation is capped by comps and plans
  notes?: Partial<Record<DraftSectionKey, string>>;
  topRisk: string;
  lot: LotSeed;
  landPrice: number; // asking or contract price
  /** Recommended plan; its ESP is derived from the comp median. */
  recommended: { planName: string; build: number };
  espAdjustment: { pct: number; reason: string };
  alternates: PlanSeed[]; // ranked
  comps: DraftComp[];
}

export interface DraftLot extends LotSeed {
  lotSqFt: number;
  envelopeWidthFt: number;
  envelopeDepthFt: number;
  envelopeSqFt: number;
  coverageCapSqFt: number;
  buildableSqFt: number;     // min(envelope, coverage cap)
  footprintSqFt: number;     // recommended plan
  coveragePct: number;       // recommended plan footprint / lot
  remainingSqFt: number;     // buildable left after the primary plan
  rearYardFt: number;        // back of the primary footprint to the rear lot line
}

export interface DraftPlan {
  plan: Plan;
  sqft: number;
  widthFt: number;
  depthFt: number;
  esp: number;
  build: number;
  costs: CostStack;
  marginPct: number;
}

export interface DraftAdu {
  fits: boolean;
  type?: 'Detached ADU' | 'Studio ADU';
  sqft?: number;
  layout?: string;
}

export interface DraftCompRow extends DraftComp {
  pricePerSqft: number;
}

export interface EspDerivation {
  medianPricePerSqft: number;
  sqft: number;
  base: number;           // median $/sqft × plan sqft
  adjustmentPct: number;
  adjustment: number;     // ESP − base, after rounding to $5K
  reason: string;
}

export interface AIDraft {
  asset: Asset;
  draftedInSec: number;
  confidenceScore: number;
  overallConfidence: Confidence;
  confidence: Record<DraftSectionKey, Confidence>;
  notes: Partial<Record<DraftSectionKey, string>>;
  topRisk: string;
  lot: DraftLot;
  plans: DraftPlan[];
  adu: DraftAdu;
  comps: DraftCompRow[];
  medianPricePerSqft: number;
  recommendation: {
    plan: DraftPlan;
    espDerivation: EspDerivation;
    costs: CostStack;
    esp: number;
    marginPct: number;
    maxLandPrice: number;
  };
}

const ALL_HIGH: Record<DraftSectionKey, Confidence> = {
  lot: 'high',
  plans: 'high',
  adu: 'high',
  comps: 'high',
  recommendation: 'high',
};

const NO_ADJUSTMENT = { pct: 0, reason: 'No adjustment: comps match the plan’s size and finish level.' };

const SEEDS: DraftSeed[] = [
  {
    assetId: 'BOOL-002',
    draftedInSec: 38,
    confidenceScore: 94,
    confidence: ALL_HIGH,
    topRisk: 'ESP carries a +2% layout premium over the comp median; confirm 5-bed resale demand on this block.',
    lot: { widthFt: 58, depthFt: 122, zoning: 'R-7.5(A)', setbacks: { front: 25, side: 5, rear: 10 }, maxCoveragePct: 50 },
    landPrice: 215_000,
    recommended: { planName: 'The Emerson', build: 455_000 },
    espAdjustment: { pct: 2, reason: 'The Emerson’s 5-bed layout sells above the mostly 4-bed comps.' },
    alternates: [
      { planName: 'The Ryan', esp: 895_000, build: 465_000 },
      { planName: 'The Daniel', esp: 820_000, build: 415_000 },
    ],
    comps: [
      { address: '6384 Lakeland Dr', sqft: 4_150, salePrice: 851_000, distanceMi: 0.5, soldOn: '2026-04-09' },
      { address: '3701 Ferndale Rd', sqft: 3_520, salePrice: 791_000, distanceMi: 0.6, soldOn: '2026-03-20' },
      { address: '7300 San Leon Ave', sqft: 4_330, salePrice: 872_000, distanceMi: 0.5, soldOn: '2025-11-06' },
      { address: '3928 Rexford Dr', sqft: 4_430, salePrice: 990_000, distanceMi: 0.3, soldOn: '2026-01-20' },
      { address: '4429 Peavy Rd', sqft: 3_660, salePrice: 759_000, distanceMi: 0.7, soldOn: '2026-04-12' },
    ],
  },
  {
    assetId: 'BOOL-003',
    draftedInSec: 52,
    confidenceScore: 58,
    confidence: { ...ALL_HIGH, lot: 'low', recommendation: 'medium' },
    notes: {
      lot: 'Deed restrictions show a mixed-use boundary on this block, and the lot sits in FEMA Zone AE. Verify both before relying on the envelope.',
      recommendation: 'Build budget excludes slab elevation and flood-venting costs required in Zone AE.',
    },
    topRisk: 'FEMA Zone AE: get an elevation certificate and price the raised slab before offering.',
    lot: { widthFt: 48, depthFt: 121, zoning: 'Ch. 42 / deed restricted', setbacks: { front: 20, side: 5, rear: 10 }, maxCoveragePct: 60 },
    landPrice: 185_000,
    recommended: { planName: 'The Daniel', build: 350_000 },
    espAdjustment: { pct: -3, reason: 'Flood-zone discount: none of the comps are in Zone AE.' },
    alternates: [],
    comps: [
      { address: '5035 Sunbeam Ln', sqft: 4_370, salePrice: 893_000, distanceMi: 0.3, soldOn: '2025-12-11' },
      { address: '7987 Shadowdale Dr', sqft: 4_560, salePrice: 978_000, distanceMi: 0.7, soldOn: '2025-11-12' },
      { address: '1888 Tidwell Rd', sqft: 4_360, salePrice: 911_000, distanceMi: 0.5, soldOn: '2026-03-19' },
      { address: '3033 Haddington Dr', sqft: 4_070, salePrice: 820_000, distanceMi: 0.6, soldOn: '2025-12-19' },
      { address: '1182 Westcott St', sqft: 3_800, salePrice: 806_000, distanceMi: 0.5, soldOn: '2026-04-12' },
    ],
  },
  {
    assetId: 'BOOL-004',
    draftedInSec: 34,
    confidenceScore: 96,
    confidence: ALL_HIGH,
    topRisk: 'Lot coverage, not the envelope, is the binding limit; confirm whether RS-60 counts covered porches toward it.',
    lot: { widthFt: 55, depthFt: 118, zoning: 'RS-60', setbacks: { front: 25, side: 5, rear: 10 }, maxCoveragePct: 40 },
    landPrice: 320_000,
    recommended: { planName: 'The Daniel', build: 530_000 },
    espAdjustment: { pct: 1.5, reason: 'Quieter interior street than the comps on Euclid and Lincoln.' },
    alternates: [
      { planName: 'The Emerson', esp: 1_330_000, build: 630_000 },
    ],
    comps: [
      { address: '3244 W Euclid Ave', sqft: 3_630, salePrice: 1_126_000, distanceMi: 0.4, soldOn: '2025-10-08' },
      { address: '7784 S Ysabella Ave', sqft: 3_840, salePrice: 1_208_000, distanceMi: 0.5, soldOn: '2026-01-15' },
      { address: '5086 W Barcelona St', sqft: 4_100, salePrice: 1_394_000, distanceMi: 0.1, soldOn: '2026-01-13' },
      { address: '5153 S Lincoln Ave', sqft: 4_160, salePrice: 1_325_000, distanceMi: 0.3, soldOn: '2026-04-06' },
      { address: '4192 W San Rafael St', sqft: 4_480, salePrice: 1_502_000, distanceMi: 0.1, soldOn: '2026-02-18' },
    ],
  },
  {
    assetId: 'BOOL-005',
    draftedInSec: 31,
    confidenceScore: 91,
    confidence: ALL_HIGH,
    topRisk: 'Asking is above the max land price; the deal only works if the seller comes down.',
    lot: { widthFt: 45, depthFt: 120, zoning: 'A-5', setbacks: { front: 25, side: 5, rear: 15 }, maxCoveragePct: 50 },
    landPrice: 260_000,
    recommended: { planName: 'The Daniel', build: 500_000 },
    espAdjustment: NO_ADJUSTMENT,
    alternates: [],
    comps: [
      { address: '4942 Crestline Rd', sqft: 4_350, salePrice: 1_074_000, distanceMi: 0.3, soldOn: '2026-03-27' },
      { address: '6544 Byers Ave', sqft: 3_550, salePrice: 860_000, distanceMi: 0.5, soldOn: '2026-04-16' },
      { address: '7434 Lackland Rd', sqft: 3_410, salePrice: 874_000, distanceMi: 0.2, soldOn: '2025-11-13' },
      { address: '4441 Westridge Ave', sqft: 3_700, salePrice: 938_000, distanceMi: 0.3, soldOn: '2026-03-12' },
      { address: '8978 Merrick St', sqft: 3_310, salePrice: 771_000, distanceMi: 0.6, soldOn: '2026-03-22' },
    ],
  },
  {
    assetId: 'BOOL-006',
    draftedInSec: 41,
    confidenceScore: 92,
    confidence: ALL_HIGH,
    topRisk: 'Margin is below target at asking; confirm East End comps support the Benjamin’s ESP before countering.',
    lot: { widthFt: 68, depthFt: 100, zoning: 'Ch. 42', setbacks: { front: 20, side: 5, rear: 5 }, maxCoveragePct: 60 },
    landPrice: 150_000,
    recommended: { planName: 'The Benjamin', build: 420_000 },
    espAdjustment: { pct: -2, reason: 'Comps include newer East End builds closer to downtown.' },
    alternates: [
      { planName: 'The Daniel', esp: 660_000, build: 370_000 },
      { planName: 'The Emerson', esp: 725_000, build: 425_000 },
    ],
    comps: [
      { address: '5227 Bowling Green St', sqft: 4_070, salePrice: 705_000, distanceMi: 0.4, soldOn: '2025-10-07' },
      { address: '8346 Lawndale St', sqft: 4_140, salePrice: 698_000, distanceMi: 0.6, soldOn: '2026-01-18' },
      { address: '4539 Kernel St', sqft: 4_190, salePrice: 645_000, distanceMi: 0.5, soldOn: '2025-11-19' },
      { address: '3649 Telephone Rd', sqft: 3_720, salePrice: 627_000, distanceMi: 0.4, soldOn: '2025-12-07' },
      { address: '7608 Dumble St', sqft: 3_450, salePrice: 569_000, distanceMi: 0.8, soldOn: '2026-02-14' },
    ],
  },
  {
    assetId: 'BOOL-007',
    draftedInSec: 47,
    confidenceScore: 81,
    confidence: { ...ALL_HIGH, comps: 'medium' },
    notes: {
      comps: 'Few new-construction sales nearby. All five comps are 0.8 mi or farther and on different street types.',
    },
    topRisk: 'Comp set is thin and 0.8+ mi away; get a broker opinion of value before offering.',
    lot: { widthFt: 60, depthFt: 120, zoning: 'LMDR', setbacks: { front: 25, side: 5, rear: 10 }, maxCoveragePct: 50 },
    landPrice: 240_000,
    recommended: { planName: 'The Ryan', build: 435_000 },
    espAdjustment: { pct: -2.5, reason: 'Comps sit in Clearwater’s higher-priced core, 0.8+ mi away.' },
    alternates: [
      { planName: 'The Benjamin', esp: 905_000, build: 475_000 },
    ],
    comps: [
      { address: '8097 Druid Rd E', sqft: 4_340, salePrice: 946_000, distanceMi: 1.0, soldOn: '2026-01-04' },
      { address: '2046 Belleair Rd', sqft: 3_750, salePrice: 775_000, distanceMi: 1.1, soldOn: '2025-12-03' },
      { address: '3835 Lakeview Rd', sqft: 3_460, salePrice: 730_000, distanceMi: 1.2, soldOn: '2026-02-19' },
      { address: '8088 S Highland Ave', sqft: 3_580, salePrice: 800_000, distanceMi: 1.3, soldOn: '2025-12-03' },
      { address: '8792 Sunset Point Rd', sqft: 3_760, salePrice: 909_000, distanceMi: 0.8, soldOn: '2025-11-16' },
    ],
  },
  {
    assetId: 'BOOL-008',
    draftedInSec: 36,
    confidenceScore: 95,
    confidence: ALL_HIGH,
    topRisk: 'Confirm the rear yard is clear of utility easements before counting on the ADU.',
    lot: { widthFt: 60, depthFt: 135, zoning: 'R-7.5(A)', setbacks: { front: 25, side: 5, rear: 10 }, maxCoveragePct: 50 },
    landPrice: 420_000,
    recommended: { planName: 'The Daniel', build: 570_000 },
    espAdjustment: NO_ADJUSTMENT,
    alternates: [
      { planName: 'The Emerson', esp: 1_490_000, build: 680_000 },
      { planName: 'The Kendall', esp: 1_330_000, build: 600_000 },
    ],
    comps: [
      { address: '5194 Park Ln', sqft: 3_630, salePrice: 1_361_000, distanceMi: 0.3, soldOn: '2026-03-08' },
      { address: '2090 Woodland Dr', sqft: 4_250, salePrice: 1_543_000, distanceMi: 0.4, soldOn: '2026-02-08' },
      { address: '3923 Northaven Rd', sqft: 4_300, salePrice: 1_438_000, distanceMi: 0.2, soldOn: '2026-01-13' },
      { address: '4468 Thackery St', sqft: 4_210, salePrice: 1_553_000, distanceMi: 0.4, soldOn: '2025-12-12' },
      { address: '4214 Walnut Hill Ln', sqft: 4_070, salePrice: 1_427_000, distanceMi: 0.6, soldOn: '2026-04-17' },
    ],
  },
  {
    assetId: 'BOOL-009',
    draftedInSec: 58,
    confidenceScore: 49,
    confidence: { ...ALL_HIGH, plans: 'medium', comps: 'low', recommendation: 'low' },
    notes: {
      plans: 'Only The Daniel fits. The Kendall needs a 57 ft wide lot.',
      comps: 'No comparable new-construction sales in the last 10 months. Nearest comp is 1.2 mi away.',
      recommendation: 'ESP rests on stale comps, and margin at asking is far below target.',
    },
    topRisk: 'Comps are 10+ months old and asking is far above the max land price; refresh comps before any offer.',
    lot: { widthFt: 49, depthFt: 100, zoning: 'R1-1', setbacks: { front: 20, side: 5, rear: 15 }, maxCoveragePct: 50 },
    landPrice: 1_250_000,
    recommended: { planName: 'The Daniel', build: 1_445_000 },
    espAdjustment: { pct: 2, reason: 'Market appreciation since the comps sold 10+ months ago.' },
    alternates: [],
    comps: [
      { address: '8499 Barrington Ave', sqft: 4_450, salePrice: 3_645_000, distanceMi: 1.2, soldOn: '2025-03-11' },
      { address: '8184 S Bundy Dr', sqft: 4_570, salePrice: 3_595_000, distanceMi: 1.7, soldOn: '2025-03-05' },
      { address: '4736 Montana Ave', sqft: 3_680, salePrice: 3_357_000, distanceMi: 2.2, soldOn: '2025-06-22' },
      { address: '6007 Federal Ave', sqft: 4_170, salePrice: 3_770_000, distanceMi: 1.6, soldOn: '2025-05-17' },
      { address: '6249 Saltair Ave', sqft: 4_030, salePrice: 3_199_000, distanceMi: 2.5, soldOn: '2025-05-01' },
    ],
  },
  {
    assetId: 'BOOL-010',
    draftedInSec: 38,
    confidenceScore: 93,
    confidence: ALL_HIGH,
    topRisk: 'Asking is above the max land price; check whether the seller will move before spending on diligence.',
    lot: { widthFt: 50, depthFt: 112, zoning: 'Ch. 42', setbacks: { front: 20, side: 5, rear: 5 }, maxCoveragePct: 60 },
    landPrice: 290_000,
    recommended: { planName: 'The Ryan', build: 555_000 },
    espAdjustment: NO_ADJUSTMENT,
    alternates: [
      { planName: 'The Emerson', esp: 1_100_000, build: 585_000 },
      { planName: 'The Daniel', esp: 1_000_000, build: 510_000 },
    ],
    comps: [
      { address: '8097 Bissonnet St', sqft: 3_670, salePrice: 953_000, distanceMi: 0.5, soldOn: '2026-04-15' },
      { address: '3154 Wroxton Rd', sqft: 3_560, salePrice: 826_000, distanceMi: 0.2, soldOn: '2026-04-02' },
      { address: '2590 Dunstan Rd', sqft: 3_720, salePrice: 972_000, distanceMi: 0.5, soldOn: '2026-02-19' },
      { address: '1680 Albans Rd', sqft: 4_380, salePrice: 1_138_000, distanceMi: 0.5, soldOn: '2025-11-05' },
      { address: '3605 Bolsover St', sqft: 3_620, salePrice: 872_000, distanceMi: 0.3, soldOn: '2026-01-02' },
    ],
  },
  {
    assetId: 'BOOL-011',
    draftedInSec: 33,
    confidenceScore: 90,
    confidence: ALL_HIGH,
    topRisk: 'Asking is above the max land price; confirm the greenbelt premium with recent Bayshore sales before countering.',
    lot: { widthFt: 60, depthFt: 115, zoning: 'RS-60', setbacks: { front: 25, side: 5, rear: 8 }, maxCoveragePct: 40 },
    landPrice: 330_000,
    recommended: { planName: 'The Daniel', build: 630_000 },
    espAdjustment: { pct: 1, reason: 'Lot backs onto a greenbelt, which none of the comps do.' },
    alternates: [
      { planName: 'The Emerson', esp: 1_355_000, build: 750_000 },
    ],
    comps: [
      { address: '7248 W Mullen Ave', sqft: 4_110, salePrice: 1_401_000, distanceMi: 0.3, soldOn: '2025-10-07' },
      { address: '4497 S Hesperides St', sqft: 3_950, salePrice: 1_292_000, distanceMi: 0.5, soldOn: '2025-10-22' },
      { address: '5418 W Neptune St', sqft: 4_130, salePrice: 1_348_000, distanceMi: 0.4, soldOn: '2025-10-16' },
      { address: '7395 S Hubert Ave', sqft: 4_310, salePrice: 1_362_000, distanceMi: 0.2, soldOn: '2026-04-03' },
      { address: '4781 W Fair Oaks Ave', sqft: 3_600, salePrice: 1_096_000, distanceMi: 0.5, soldOn: '2026-04-11' },
    ],
  },
];

// ── Derivation ─────────────────────────────────────────────────
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function findPlan(name: string): Plan {
  const plan = DFW_PLANS.find((p) => p.name === name);
  if (!plan) throw new Error(`AI draft references unknown plan "${name}"`);
  return plan;
}

function buildPlan(seed: PlanSeed, landPrice: number): DraftPlan {
  const plan = findPlan(seed.planName);
  const elevation = plan.elevations[0];
  const costs = costStack({ land: landPrice, build: seed.build, esp: seed.esp });
  return {
    plan,
    sqft: elevation.sqft,
    widthFt: elevation.widthFt,
    depthFt: elevation.depthFt,
    esp: seed.esp,
    build: seed.build,
    costs,
    marginPct: marginPct(seed.esp, costs.total),
  };
}

function buildDraft(seed: DraftSeed, asset: Asset): AIDraft {
  const { lot: lotSeed, landPrice } = seed;

  // ESP: comp median $/sqft × recommended plan sqft, adjusted, rounded to $5K.
  const comps = seed.comps.map((c) => ({ ...c, pricePerSqft: Math.round(c.salePrice / c.sqft) }));
  const medianPricePerSqft = Math.round(median(comps.map((c) => c.pricePerSqft)));
  const recSqft = findPlan(seed.recommended.planName).elevations[0].sqft;
  const base = medianPricePerSqft * recSqft;
  const esp = Math.round((base * (1 + seed.espAdjustment.pct / 100)) / 5000) * 5000;

  const plans = [{ ...seed.recommended, esp }, ...seed.alternates].map((p) => buildPlan(p, landPrice));
  const primary = plans[0];

  // Underwriting-stage assets were underwritten from this draft; keep them in lockstep.
  const uw = asset.underwrite;
  if (uw && (uw.planName !== primary.plan.name || uw.esp !== esp || uw.landPrice !== landPrice || uw.buildCost !== primary.build)) {
    throw new Error(`AI draft for ${asset.id} disagrees with its underwrite in assets.ts`);
  }

  const envelopeWidthFt = lotSeed.widthFt - 2 * lotSeed.setbacks.side;
  const envelopeDepthFt = lotSeed.depthFt - lotSeed.setbacks.front - lotSeed.setbacks.rear;
  const envelopeSqFt = Math.round(envelopeWidthFt * envelopeDepthFt);
  const coverageCapSqFt = Math.round((lotSeed.maxCoveragePct / 100) * asset.lotSqFt);
  const buildableSqFt = Math.min(envelopeSqFt, coverageCapSqFt);
  const footprintSqFt = Math.round(primary.widthFt * primary.depthFt);
  const remainingSqFt = Math.max(0, buildableSqFt - footprintSqFt);
  // Primary sits at the front setback, so its back wall is front + depth from the street.
  const rearYardFt = round1(lotSeed.depthFt - lotSeed.setbacks.front - primary.depthFt);

  // Every drafted plan must clear the lot minimums and sit inside the envelope.
  for (const p of plans) {
    const fits =
      checkFeasibility(p.plan, lotSeed) === 'ok' &&
      p.widthFt <= envelopeWidthFt &&
      p.depthFt <= envelopeDepthFt;
    if (!fits) throw new Error(`AI draft for ${asset.id}: ${p.plan.name} does not fit the lot`);
  }

  const aduFits = remainingSqFt >= MIN_ADU_SQFT && rearYardFt >= MIN_ADU_REAR_YARD_FT;
  const aduDepthSqFt = (rearYardFt - ADU_SEPARATION_FT - ADU_REAR_SETBACK_FT) * envelopeWidthFt;
  const aduSqFt = Math.floor(Math.min(remainingSqFt, aduDepthSqFt, MAX_ADU_SQFT) / 50) * 50;
  const adu: DraftAdu = aduFits
    ? {
        fits: true,
        type: aduSqFt >= 600 ? 'Detached ADU' : 'Studio ADU',
        sqft: aduSqFt,
        layout: aduSqFt >= 600 ? '2 bed / 1 bath' : 'Studio / 1 bath',
      }
    : { fits: false };

  // Recommendation can't be more confident than the comps and plans it rests on;
  // the overall score is capped the same way.
  const inputsLevel = lowest(seed.confidence.comps, seed.confidence.plans);
  const recLevel = lowest(seed.confidence.recommendation, inputsLevel);
  const notes = { ...seed.notes };
  if (LEVEL_RANK[recLevel] < LEVEL_RANK[seed.confidence.recommendation]) {
    const source = seed.confidence.comps === inputsLevel ? 'Comp Set' : 'Feasible Plans';
    notes.recommendation = `Capped at ${CONFIDENCE_LABELS[recLevel]} by ${source} confidence.`;
  }
  const confidenceScore = Math.min(seed.confidenceScore, LEVEL_MAX_SCORE[inputsLevel]);

  return {
    asset,
    draftedInSec: seed.draftedInSec,
    confidenceScore,
    overallConfidence: scoreLevel(confidenceScore),
    confidence: { ...seed.confidence, recommendation: recLevel },
    notes,
    topRisk: seed.topRisk,
    lot: {
      ...lotSeed,
      lotSqFt: asset.lotSqFt,
      envelopeWidthFt,
      envelopeDepthFt,
      envelopeSqFt,
      coverageCapSqFt,
      buildableSqFt,
      footprintSqFt,
      coveragePct: round1((footprintSqFt / asset.lotSqFt) * 100),
      remainingSqFt,
      rearYardFt,
    },
    plans,
    adu,
    comps,
    medianPricePerSqft,
    recommendation: {
      plan: primary,
      espDerivation: {
        medianPricePerSqft,
        sqft: recSqft,
        base,
        adjustmentPct: seed.espAdjustment.pct,
        adjustment: esp - base,
        reason: seed.espAdjustment.reason,
      },
      costs: primary.costs,
      esp,
      marginPct: primary.marginPct,
      maxLandPrice: maxLandPrice({ esp, build: primary.build }, TARGET_MARGIN_PCT),
    },
  };
}

export const AI_DRAFTS: Record<string, AIDraft> = Object.fromEntries(
  SEEDS.map((seed) => {
    const asset = ASSETS.find((a) => a.id === seed.assetId);
    if (!asset) throw new Error(`AI draft references unknown asset ${seed.assetId}`);
    return [seed.assetId, buildDraft(seed, asset)];
  }),
);

export function getAIDraft(assetId: string): AIDraft | undefined {
  return AI_DRAFTS[assetId];
}

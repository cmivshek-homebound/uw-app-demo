import type { Asset } from '../types';
import { ASSETS } from './assets';
import { DFW_PLANS, checkFeasibility } from './plans';
import type { Plan } from './plans';
import { aduEconomics, aduLayout, evaluateAdus, lotGeometry } from './adu';
import type { AduVerdict, LotGeometry } from './adu';
import { ADU_ASSUMPTIONS } from './aduAssumptions';
import { costStack, marginPct, maxLandPrice } from './underwriting';
import type { CostStack } from './underwriting';

// ── AI draft underwrites ───────────────────────────────────────
// One hardcoded AI draft per pipeline asset (opportunity / underwriting).
// Seeds hold only what the AI pulled or chose: lot data, plan picks with
// build budgets, the comp set and an ESP adjustment. ESP, the cost stack,
// envelope, ADU fit (per market, from aduAssumptions.ts), margins, max land price and the capped confidence
// levels are derived by buildDraft so they stay consistent.
//
// Plan geometry comes from the plan library (DFW_PLANS); non-DFW markets
// use the plan names already underwritten on assets in that market.
// Underwriting-stage assets must match their assets.ts underwrite exactly.

export type Confidence = 'high' | 'medium' | 'low';

export type DraftSectionKey = 'lot' | 'plans' | 'adu' | 'comps' | 'recommendation';

/** Net margin the max land price is solved for. */
export const TARGET_MARGIN_PCT = 15;

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

export interface OpenQuestion {
  question: string;
  answer?: string; // only on drafts already submitted to Growth
}

interface DraftSeed {
  assetId: string;
  draftedInSec: number;
  confidenceScore: number; // 0–100, before caps
  confidence: Record<DraftSectionKey, Confidence>; // recommendation is capped by comps and plans
  notes?: Partial<Record<DraftSectionKey, string>>;
  topRisk: string;
  openQuestions: OpenQuestion[];
  lot: LotSeed;
  landPrice: number; // asking or contract price
  /** Recommended plan; its ESP is derived from the comp median. */
  recommended: { planName: string; build: number };
  espAdjustment: { pct: number; reason: string };
  alternates: PlanSeed[]; // ranked
  comps: DraftComp[];
}

export interface DraftLot extends LotSeed, LotGeometry {
  lotSqFt: number;
  floodZone: boolean;
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
  fits: boolean; // false only when an analyst override shrinks the envelope
}

export interface DraftAdu {
  offered: boolean;
  notOfferedReason?: string;
  note?: string;           // market caveat, e.g. deed restrictions
  fits: boolean;
  type?: string;
  sqft?: number;
  layout?: string;
  marginDelta?: number;    // added margin dollars, same cost stack as the house
  verdict?: AduVerdict;
  failReasons: string[];   // why each type doesn't fit, when none does
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
  openQuestions: OpenQuestion[];
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
    openQuestions: [
      { question: 'Seller disclosure mentions a 2019 foundation repair. Does it change the demo or pier plan?' },
      { question: 'Listing agent says a 5-bed comp went pending at $925K last week. Add it to the comp set once it closes?' },
    ],
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
    openQuestions: [
      { question: 'Confirm side setback with the HOA: survey shows 5 ft, deed restrictions may require 7.5 ft.' },
      { question: 'Is the lot inside the mixed-use boundary? Pull the recorded plat to check.' },
      { question: 'How far above base flood elevation does the slab need to sit, and what does that add to build?' },
    ],
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
    openQuestions: [
      {
        question: 'Confirm side setback with the city: survey shows 5 ft, code says 7.5 ft.',
        answer: 'Zoning desk confirmed 5 ft for RS-60 interior lots (email, Apr 16).',
      },
      {
        question: 'Seller wants a 60-day close. Does that fit the start schedule?',
        answer: 'Yes. Permit submittal is 3 weeks out, so a 60-day close lands before start.',
      },
    ],
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
    openQuestions: [
      { question: 'Seller countered at $255K. Worth re-running at that price?' },
      { question: 'Westover Hills requires architectural review. How long does approval take?' },
    ],
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
    openQuestions: [
      {
        question: 'Do the deed restrictions allow a 5-bed plan on this block?',
        answer: 'Yes. Restrictions cap height at 35 ft but say nothing about bedroom count.',
      },
      {
        question: 'Telephone Rd is within 300 ft. Does the ESP need a traffic discount?',
        answer: 'No. The lot faces Lawndale, and same-side comps show no discount.',
      },
    ],
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
    openQuestions: [
      { question: 'Can the listing agent share any pocket sales closer than 0.8 mi?' },
      { question: 'Seller wants a 60-day close. Does that fit the start schedule?' },
      { question: 'Is the lot inside Clearwater’s coastal high-hazard area?' },
    ],
    lot: { widthFt: 60, depthFt: 150, zoning: 'LMDR', setbacks: { front: 25, side: 5, rear: 10 }, maxCoveragePct: 50 },
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
    topRisk: 'Confirm the rear utility easement on the plat doesn’t clip the Daniel’s footprint.',
    openQuestions: [
      { question: 'Confirm the rear utility easement width on the plat.' },
      { question: 'Seller wants a 45-day leaseback after close. Acceptable?' },
    ],
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
    confidenceScore: 86,
    confidence: { ...ALL_HIGH, plans: 'medium' },
    notes: {
      plans: 'Only The Daniel fits. The Kendall needs a 57 ft wide lot.',
    },
    topRisk: 'Side setback: the survey shows 5 ft, but R1-1 may require 10% of lot width. Confirm with LADBS before pricing in the ADU.',
    openQuestions: [
      { question: 'Confirm side setback with LADBS: survey shows 5 ft, R1-1 requires 10% of lot width.' },
      { question: 'Does the detached ADU clear the rear-yard setback once the Daniel’s covered patio is drawn in?' },
      { question: 'Seller is an estate. Can we close inside 30 days to hold this price?' },
    ],
    lot: { widthFt: 50, depthFt: 140, zoning: 'R1-1', setbacks: { front: 20, side: 5, rear: 15 }, maxCoveragePct: 50 },
    landPrice: 1_050_000,
    recommended: { planName: 'The Daniel', build: 1_445_000 },
    espAdjustment: { pct: 1, reason: 'Quiet interior block; two comps back onto San Vicente traffic.' },
    alternates: [],
    comps: [
      { address: '11450 Gorham Ave', sqft: 4_180, salePrice: 3_720_000, distanceMi: 0.2, soldOn: '2026-02-26' },
      { address: '11660 Chenault St', sqft: 4_410, salePrice: 3_905_000, distanceMi: 0.4, soldOn: '2026-03-19' },
      { address: '612 S Saltair Ave', sqft: 4_050, salePrice: 3_545_000, distanceMi: 0.5, soldOn: '2025-12-04' },
      { address: '11820 Darlington Ave', sqft: 4_320, salePrice: 3_760_000, distanceMi: 0.6, soldOn: '2026-01-15' },
      { address: '11935 Montana Ave', sqft: 3_960, salePrice: 3_420_000, distanceMi: 0.9, soldOn: '2025-11-20' },
    ],
  },
  {
    assetId: 'BOOL-010',
    draftedInSec: 38,
    confidenceScore: 93,
    confidence: ALL_HIGH,
    topRisk: 'Asking is above the max land price; check whether the seller will move before spending on diligence.',
    openQuestions: [
      { question: 'Asking is just over max land price. Counter at max or walk?' },
      { question: 'Plat shows a 10 ft rear alley that may be abandoned. Confirm garage access.' },
    ],
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
    openQuestions: [
      { question: 'Does the city count covered porches toward RS-60 lot coverage?' },
      { question: 'Is there a conservation easement on the greenbelt behind the lot?' },
    ],
    lot: { widthFt: 60, depthFt: 141, zoning: 'RS-60', setbacks: { front: 25, side: 5, rear: 8 }, maxCoveragePct: 40 },
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

// ── Analyst overrides ──────────────────────────────────────────
// Values an analyst can override in review. Overrides replace the AI's
// input and everything downstream (envelope, ADU, ESP, margin) recomputes.

export type OverrideField =
  | 'frontSetback'
  | 'sideSetback'
  | 'rearSetback'
  | 'maxCoveragePct'
  | 'recBuild'
  | 'aduSqft'
  | 'medianPricePerSqft'
  | 'esp';

export type DraftOverrides = Partial<Record<OverrideField, number>>;

export type OverrideUnit = 'ft' | 'pct' | 'usd' | 'sqft';

export const OVERRIDE_FIELDS: Record<
  OverrideField,
  { section: DraftSectionKey; label: string; unit: OverrideUnit; value: (draft: AIDraft) => number }
> = {
  frontSetback: { section: 'lot', label: 'Front setback', unit: 'ft', value: (d) => d.lot.setbacks.front },
  sideSetback: { section: 'lot', label: 'Side setback', unit: 'ft', value: (d) => d.lot.setbacks.side },
  rearSetback: { section: 'lot', label: 'Rear setback', unit: 'ft', value: (d) => d.lot.setbacks.rear },
  maxCoveragePct: { section: 'lot', label: 'Max lot coverage', unit: 'pct', value: (d) => d.lot.maxCoveragePct },
  recBuild: { section: 'plans', label: 'Build budget (recommended plan)', unit: 'usd', value: (d) => d.recommendation.plan.build },
  aduSqft: { section: 'adu', label: 'ADU size', unit: 'sqft', value: (d) => d.adu.sqft ?? 0 },
  medianPricePerSqft: { section: 'comps', label: 'Median $/sqft', unit: 'usd', value: (d) => d.medianPricePerSqft },
  esp: { section: 'recommendation', label: 'ESP', unit: 'usd', value: (d) => d.recommendation.esp },
};

export const SECTION_OVERRIDE_FIELDS: Record<DraftSectionKey, OverrideField[]> = {
  lot: ['frontSetback', 'sideSetback', 'rearSetback', 'maxCoveragePct'],
  plans: ['recBuild'],
  adu: ['aduSqft'],
  comps: ['medianPricePerSqft'],
  recommendation: ['esp'],
};

// ── Derivation ─────────────────────────────────────────────────
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
    fits: true,
  };
}

function buildDraft(seed: DraftSeed, asset: Asset, overrides: DraftOverrides = {}): AIDraft {
  const { landPrice } = seed;
  const reviewed = Object.keys(overrides).length > 0;
  const lotSeed: LotSeed = {
    ...seed.lot,
    setbacks: {
      front: overrides.frontSetback ?? seed.lot.setbacks.front,
      side: overrides.sideSetback ?? seed.lot.setbacks.side,
      rear: overrides.rearSetback ?? seed.lot.setbacks.rear,
    },
    maxCoveragePct: overrides.maxCoveragePct ?? seed.lot.maxCoveragePct,
  };

  // ESP: comp median $/sqft × recommended plan sqft, adjusted, rounded to $5K.
  const comps = seed.comps.map((c) => ({ ...c, pricePerSqft: Math.round(c.salePrice / c.sqft) }));
  const medianPricePerSqft = overrides.medianPricePerSqft ?? Math.round(median(comps.map((c) => c.pricePerSqft)));
  const recSqft = findPlan(seed.recommended.planName).elevations[0].sqft;
  const base = medianPricePerSqft * recSqft;
  const esp = overrides.esp ?? Math.round((base * (1 + seed.espAdjustment.pct / 100)) / 5000) * 5000;
  const recBuild = overrides.recBuild ?? seed.recommended.build;

  const plans = [{ planName: seed.recommended.planName, build: recBuild, esp }, ...seed.alternates].map((p) =>
    buildPlan(p, landPrice),
  );
  const primary = plans[0];

  // Underwriting-stage assets were underwritten from this draft; keep them in lockstep.
  const uw = asset.underwrite;
  if (!reviewed && uw && (uw.planName !== primary.plan.name || uw.esp !== esp || uw.landPrice !== landPrice || uw.buildCost !== primary.build)) {
    throw new Error(`AI draft for ${asset.id} disagrees with its underwrite in assets.ts`);
  }

  const lotForFit = { ...lotSeed, lotSqFt: asset.lotSqFt, floodZone: asset.floodZone ?? false };
  const geometry = lotGeometry(lotForFit, primary);
  const { envelopeWidthFt, envelopeDepthFt } = geometry;

  // Every drafted plan must clear the lot minimums and sit inside the envelope.
  // An analyst override can shrink the envelope; then the plan is flagged instead.
  for (const p of plans) {
    p.fits =
      checkFeasibility(p.plan, lotSeed) === 'ok' &&
      p.widthFt <= envelopeWidthFt &&
      p.depthFt <= envelopeDepthFt;
    if (!p.fits && !reviewed) throw new Error(`AI draft for ${asset.id}: ${p.plan.name} does not fit the lot`);
  }

  // ADU: the market's best-fitting type by added margin. An analyst size
  // override re-prices that type (or the market's first type) at the new size.
  const evaluation = evaluateAdus(asset.market, lotForFit, primary);
  let adu: DraftAdu;
  if (!evaluation.offered) {
    adu = { offered: false, notOfferedReason: evaluation.reason, fits: false, failReasons: [] };
  } else {
    const market = ADU_ASSUMPTIONS[asset.market];
    const base = evaluation.best ?? evaluation.options[0];
    const sqftOverride = overrides.aduSqft;
    const fits = sqftOverride !== undefined ? sqftOverride > 0 : evaluation.best !== undefined;
    const economics =
      sqftOverride !== undefined && market.offered
        ? aduEconomics(market, sqftOverride, lotForFit.floodZone)
        : base.economics;
    adu = {
      offered: true,
      note: evaluation.note,
      fits,
      failReasons: evaluation.best ? [] : evaluation.options.map((o) => `${o.type.name} ${o.type.sqft} sqft: ${o.reason}`),
      ...(fits && {
        type: base.type.name,
        sqft: economics.sqft,
        layout: aduLayout(economics.sqft),
        marginDelta: economics.marginDelta,
        verdict: economics.verdict,
      }),
    };
  }

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
    openQuestions: seed.openQuestions,
    lot: { ...lotForFit, ...geometry },
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
        reason: overrides.esp !== undefined ? 'Analyst override.' : seed.espAdjustment.reason,
      },
      costs: primary.costs,
      esp,
      marginPct: primary.marginPct,
      maxLandPrice: maxLandPrice({ esp, build: primary.build }, TARGET_MARGIN_PCT),
    },
  };
}

function assetFor(seed: DraftSeed): Asset {
  const asset = ASSETS.find((a) => a.id === seed.assetId);
  if (!asset) throw new Error(`AI draft references unknown asset ${seed.assetId}`);
  return asset;
}

export const AI_DRAFTS: Record<string, AIDraft> = Object.fromEntries(
  SEEDS.map((seed) => [seed.assetId, buildDraft(seed, assetFor(seed))]),
);

export function getAIDraft(assetId: string): AIDraft | undefined {
  return AI_DRAFTS[assetId];
}

/** The draft with analyst overrides applied and everything downstream recomputed. */
export function getReviewedDraft(assetId: string, overrides: DraftOverrides): AIDraft | undefined {
  if (Object.keys(overrides).length === 0) return AI_DRAFTS[assetId];
  const seed = SEEDS.find((s) => s.assetId === assetId);
  return seed && buildDraft(seed, assetFor(seed), overrides);
}

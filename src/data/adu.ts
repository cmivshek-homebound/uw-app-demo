import type { Market } from '../types';
import { ADU_ASSUMPTIONS, ADU_THIN_MARGIN } from './aduAssumptions';
import type { AduType, OfferedAduMarket } from './aduAssumptions';
import { CARRY_COST_PCT, SELLING_COST_PCT } from './underwriting';

// ── Lot geometry and ADU fit ───────────────────────────────────
// Shared by the AI drafts and the Scenario Engine so both size the
// primary house, the leftover area and any ADU the same way.

export interface LotForFit {
  widthFt: number;
  depthFt: number;
  setbacks: { front: number; side: number; rear: number };
  maxCoveragePct: number;
  lotSqFt: number;
  floodZone: boolean;
}

export interface Footprint {
  widthFt: number;
  depthFt: number;
}

export interface LotGeometry {
  envelopeWidthFt: number;
  envelopeDepthFt: number;
  envelopeSqFt: number;
  coverageCapSqFt: number;
  buildableSqFt: number; // min(envelope, coverage cap)
  footprintSqFt: number; // primary house
  coveragePct: number;   // primary footprint / lot
  remainingSqFt: number; // buildable left after the primary
  rearYardFt: number;    // back of the primary footprint to the rear lot line
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function ft(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ft`;
}

/** The primary sits at the front setback, so its back wall is front + depth from the street. */
export function lotGeometry(lot: LotForFit, primary: Footprint): LotGeometry {
  const envelopeWidthFt = lot.widthFt - 2 * lot.setbacks.side;
  const envelopeDepthFt = lot.depthFt - lot.setbacks.front - lot.setbacks.rear;
  const envelopeSqFt = Math.round(envelopeWidthFt * envelopeDepthFt);
  const coverageCapSqFt = Math.round((lot.maxCoveragePct / 100) * lot.lotSqFt);
  const buildableSqFt = Math.min(envelopeSqFt, coverageCapSqFt);
  const footprintSqFt = Math.round(primary.widthFt * primary.depthFt);
  return {
    envelopeWidthFt,
    envelopeDepthFt,
    envelopeSqFt,
    coverageCapSqFt,
    buildableSqFt,
    footprintSqFt,
    coveragePct: round1((footprintSqFt / lot.lotSqFt) * 100),
    remainingSqFt: Math.max(0, buildableSqFt - footprintSqFt),
    rearYardFt: round1(lot.depthFt - lot.setbacks.front - primary.depthFt),
  };
}

// ── ADU economics ──────────────────────────────────────────────
// Same cost stack as the house: carry on build, selling costs on the uplift.

export type AduVerdict = 'adds' | 'thin';

export interface AduEconomics {
  sqft: number;
  build: number;
  fees: number;
  flood: number;        // flood-zone elevation, where the market charges it
  carry: number;        // CARRY_COST_PCT of build + flood
  uplift: number;       // added ESP
  selling: number;      // SELLING_COST_PCT of uplift
  hardCost: number;     // build + fees + flood
  marginDelta: number;  // uplift − hard cost − carry − selling
  addedDays: number;
  verdict: AduVerdict;
}

export function aduEconomics(m: OfferedAduMarket, sqft: number, floodZone: boolean): AduEconomics {
  const build = m.buildPerSqft * sqft;
  const fees = m.permitsAndFees;
  const flood = floodZone ? (m.floodElevationCost ?? 0) : 0;
  const carry = Math.round((build + flood) * (CARRY_COST_PCT / 100));
  const uplift = m.upliftPerSqft * sqft;
  const selling = Math.round(uplift * (SELLING_COST_PCT / 100));
  const hardCost = build + fees + flood;
  const marginDelta = uplift - hardCost - carry - selling;
  return {
    sqft,
    build,
    fees,
    flood,
    carry,
    uplift,
    selling,
    hardCost,
    marginDelta,
    addedDays: m.addedDays,
    verdict: marginDelta >= ADU_THIN_MARGIN ? 'adds' : 'thin',
  };
}

// ── ADU fit ────────────────────────────────────────────────────
export interface AduOption {
  type: AduType;
  fits: boolean;
  reason?: string;        // why it doesn't fit
  economics: AduEconomics;
}

export type AduEvaluation =
  | { offered: false; reason: string; geometry: LotGeometry }
  | {
      offered: true;
      market: OfferedAduMarket;
      note?: string;
      options: AduOption[];
      best?: AduOption;   // fitting option with the most added margin
      geometry: LotGeometry;
    };

function requiredRearYard(m: OfferedAduMarket, type: AduType): number {
  const separation = type.kind === 'attached' ? 0 : m.separationFt;
  return Math.max(m.minRearYardFt, separation + type.footprint.depthFt + m.rearSetbackFt);
}

function fitReason(m: OfferedAduMarket, type: AduType, lot: LotForFit, geometry: LotGeometry): string | undefined {
  const rear = geometry.rearYardFt;
  if (rear < m.minRearYardFt) return `rear yard ${ft(rear)}, needs ${ft(m.minRearYardFt)}`;

  const needed = requiredRearYard(m, type);
  if (rear < needed) {
    const parts =
      type.kind === 'attached'
        ? `${type.footprint.depthFt} ft unit + ${m.rearSetbackFt} ft setback`
        : `${m.separationFt} ft from house + ${type.footprint.depthFt} ft unit + ${m.rearSetbackFt} ft setback`;
    return `rear yard ${ft(rear)}, needs ${ft(needed)} (${parts})`;
  }

  const sideSetback = m.sideSetbackFt ?? lot.setbacks.side;
  const widthAvailable = lot.widthFt - 2 * sideSetback;
  if (type.footprint.widthFt > widthAvailable) {
    return `needs ${ft(type.footprint.widthFt)} of width, ${ft(widthAvailable)} available`;
  }

  const area = type.footprint.widthFt * type.footprint.depthFt;
  if (area > geometry.remainingSqFt) {
    return `needs ${area.toLocaleString()} sqft of lot coverage, ${geometry.remainingSqFt.toLocaleString()} sqft left`;
  }
  return undefined;
}

export function evaluateAdus(market: Market, lot: LotForFit, primary: Footprint): AduEvaluation {
  const geometry = lotGeometry(lot, primary);
  const m = ADU_ASSUMPTIONS[market];
  if (!m.offered) return { offered: false, reason: m.reason, geometry };

  const options = m.types.map((type) => {
    const reason = fitReason(m, type, lot, geometry);
    return { type, fits: reason === undefined, reason, economics: aduEconomics(m, type.sqft, lot.floodZone) };
  });
  const best = options
    .filter((o) => o.fits)
    .reduce<AduOption | undefined>((top, o) => (!top || o.economics.marginDelta > top.economics.marginDelta ? o : top), undefined);
  return { offered: true, market: m, note: m.note, options, best, geometry };
}

/** One-line statement of the market's ADU rule, for footnotes. */
export function aduRuleText(market: Market): string {
  const m = ADU_ASSUMPTIONS[market];
  if (!m.offered) return `${market}: not offered. ${m.reason}`;
  const side = m.sideSetbackFt !== undefined ? `, ${m.sideSetbackFt} ft from side lot lines` : '';
  return (
    `${market}: needs a rear yard (back of the primary to the rear lot line) of at least ${m.minRearYardFt} ft ` +
    `and room for the unit ${m.separationFt} ft from the house (detached) and ${m.rearSetbackFt} ft from the rear lot line${side}, ` +
    `within the remaining lot coverage.`
  );
}

export function aduLayout(sqft: number): string {
  if (sqft >= 800) return '2 bed / 2 bath';
  if (sqft >= 550) return '1 bed / 1 bath';
  return 'Studio / 1 bath';
}

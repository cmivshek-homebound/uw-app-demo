import type { Asset, ListingOffer } from '../types';
import { MARKET_NORMS } from './marketNorms';
import type { MarketNorms } from './marketNorms';
import { closingCostPctFor, costStack } from './underwriting';

// ── Listing health ─────────────────────────────────────────────
// Diagnoses each for-sale listing against its market norm and recommends
// a specific next step. Rules, in priority order:
//   Offer in hand       an active or countered offer
//   Stale               days on market over 1.5× the norm
//   Low traffic         under half the norm's showings/week after 14 days
//   Showings, no offers at or above the norm's showings/week, no offers after 21 days
//   Healthy             on or ahead of the norm's pace
//   Behind pace         fallback when none of the above fit

export type ListingDiagnosis =
  | 'offer_in_hand'
  | 'stale'
  | 'low_traffic'
  | 'showings_no_offers'
  | 'behind_pace'
  | 'healthy';

export const DIAGNOSIS_LABELS: Record<ListingDiagnosis, string> = {
  offer_in_hand: 'Offer in hand',
  stale: 'Stale',
  low_traffic: 'Low traffic',
  showings_no_offers: 'Showings, no offers',
  behind_pace: 'Behind pace',
  healthy: 'Healthy',
};

/** Sort order on the board: most urgent first. */
export const DIAGNOSIS_URGENCY: ListingDiagnosis[] = [
  'offer_in_hand',
  'stale',
  'showings_no_offers',
  'low_traffic',
  'behind_pace',
  'healthy',
];

const STALE_MULTIPLE = 1.5;
const LOW_TRAFFIC_SHARE = 0.5;
const LOW_TRAFFIC_MIN_DAYS = 14;
const NO_OFFERS_MIN_DAYS = 21;

/** Recommended price drop by diagnosis, as a share of list price. Demo placeholders. */
const DROP_PCT: Partial<Record<ListingDiagnosis, number>> = {
  stale: 3,
  showings_no_offers: 2.5,
  low_traffic: 2,
};

export type ListingRecommendation =
  | { kind: 'drop'; text: string; amount: number; newPrice: number; markdown?: number }
  | { kind: 'counter'; text: string; price: number }
  | { kind: 'hold'; text: string };

export interface ListingHealth {
  diagnosis: ListingDiagnosis;
  reason: string;
  norm: MarketNorms;
  showingsPerWeek: number;
  domRatio: number;             // days on market ÷ norm
  activeOffer?: ListingOffer;
  currentMark: number;
  recommendation: ListingRecommendation;
}

function k(n: number): string {
  return `$${Math.round(Math.abs(n) / 1000)}K`;
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function roundTo5K(n: number): number {
  return Math.max(5_000, Math.round(n / 5_000) * 5_000);
}

export function isStale(asset: Asset): boolean {
  const l = asset.listing;
  return !!l && asset.stage === 'for_sale' && l.daysOnMarket > STALE_MULTIPLE * MARKET_NORMS[asset.market].typicalDaysOnMarket;
}

export function listingHealth(asset: Asset): ListingHealth {
  const l = asset.listing!;
  const norm = MARKET_NORMS[asset.market];
  const weeks = Math.max(l.daysOnMarket, 1) / 7;
  const showingsPerWeek = l.showings / weeks;
  const domRatio = l.daysOnMarket / norm.typicalDaysOnMarket;
  const activeOffer = l.offers?.find((o) => o.status === 'active' || o.status === 'countered');
  const hasOffers = (l.offers?.length ?? 0) > 0;
  const currentMark = asset.marks?.at(-1)?.value ?? l.listPrice;
  const pace = `${showingsPerWeek.toFixed(1)} showings/wk vs ${norm.showingsPerWeek} norm`;

  let diagnosis: ListingDiagnosis;
  let reason: string;
  if (activeOffer) {
    diagnosis = 'offer_in_hand';
    const vsList = (activeOffer.amount / l.listPrice - 1) * 100;
    const vsMark = activeOffer.amount - currentMark;
    reason = `${activeOffer.financing} offer at ${k(activeOffer.amount)}, ${Math.abs(vsList).toFixed(1)}% under list and ${k(vsMark)} ${vsMark < 0 ? 'under' : 'over'} the mark.`;
  } else if (domRatio > STALE_MULTIPLE) {
    diagnosis = 'stale';
    reason = `${l.daysOnMarket} days on market, ${domRatio.toFixed(1)}× the ${asset.market} norm of ${norm.typicalDaysOnMarket}.`;
  } else if (l.daysOnMarket >= LOW_TRAFFIC_MIN_DAYS && showingsPerWeek < LOW_TRAFFIC_SHARE * norm.showingsPerWeek) {
    diagnosis = 'low_traffic';
    reason = `${pace} after ${l.daysOnMarket} days: points to price or exposure.`;
  } else if (l.daysOnMarket >= NO_OFFERS_MIN_DAYS && showingsPerWeek >= norm.showingsPerWeek && !hasOffers) {
    diagnosis = 'showings_no_offers';
    reason = `${pace} but no offers in ${l.daysOnMarket} days: points to price or product.`;
  } else if (showingsPerWeek >= norm.showingsPerWeek) {
    diagnosis = 'healthy';
    reason = `${pace}; on or ahead of pace at ${l.daysOnMarket} days.`;
  } else {
    diagnosis = 'behind_pace';
    reason = `${pace} at ${l.daysOnMarket} days; worth watching.`;
  }

  let recommendation: ListingRecommendation;
  const dropPct = DROP_PCT[diagnosis];
  if (dropPct) {
    const amount = roundTo5K((l.listPrice * dropPct) / 100);
    const newPrice = l.listPrice - amount;
    const markdown = newPrice < currentMark ? currentMark - newPrice : undefined;
    const lead = diagnosis === 'low_traffic' ? 'Refresh photos and syndication, and drop' : 'Drop';
    recommendation = { kind: 'drop', amount, newPrice, markdown, text: `${lead} ${k(amount)} to ${usd(newPrice)}` };
  } else if (activeOffer) {
    const price = roundTo5K((activeOffer.amount + l.listPrice) / 2);
    recommendation = {
      kind: 'counter',
      price,
      text: `Counter at ${usd(price)}${activeOffer.concessions ? ` with ${k(activeOffer.concessions / 2)} toward closing` : ''}`,
    };
  } else {
    recommendation = { kind: 'hold', text: `Hold at ${usd(l.listPrice)}` };
  }

  return { diagnosis, reason, norm, showingsPerWeek, domRatio, activeOffer, currentMark, recommendation };
}

// ── Offer evaluation ───────────────────────────────────────────
export interface OfferEvaluation {
  offer: ListingOffer;
  vsList: number;
  vsMark: number;
  vsEsp: number;
  sellingCosts: number;
  netProceeds: number;   // offer − selling costs − concessions
  totalCost: number;     // full cost stack at this price, plus concessions
  margin: number;        // $
  marginPct: number;
  uwMarginPct: number;
  marginPts: number;
}

/** What closing at this offer would mean, on the same cost stack as the underwrite. */
export function evaluateOffer(asset: Asset, offer: ListingOffer): OfferEvaluation {
  const l = asset.listing!;
  const uw = asset.underwrite!;
  const currentMark = asset.marks?.at(-1)?.value ?? l.listPrice;
  const costs = costStack({
    land: uw.landPrice,
    build: asset.owned?.costToDate ?? uw.buildCost,
    esp: offer.amount,
    closingPct: closingCostPctFor(uw.underwrittenOn),
  });
  const totalCost = costs.total + offer.concessions;
  const margin = offer.amount - totalCost;
  const marginPct = Math.round((margin / offer.amount) * 1000) / 10;
  return {
    offer,
    vsList: offer.amount - l.listPrice,
    vsMark: offer.amount - currentMark,
    vsEsp: offer.amount - uw.esp,
    sellingCosts: costs.selling,
    netProceeds: offer.amount - costs.selling - offer.concessions,
    totalCost,
    margin,
    marginPct,
    uwMarginPct: uw.marginPct,
    marginPts: Math.round((marginPct - uw.marginPct) * 10) / 10,
  };
}

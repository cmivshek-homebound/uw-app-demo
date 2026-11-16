import { createContext, useContext } from 'react';
import type { Asset, PreScreenResult } from '../types';
import { getAIDraft } from './aiDrafts';
import { ASSETS } from './assets';
import { daysRemaining, diligenceProgress } from './contracts';
import { listingHealth } from './listingHealth';
import { constructionSummary, untriagedLeads } from './selectors';

// ── Guided demo: LA Westside ───────────────────────────────────
// One neighborhood followed through the lifecycle. Talking points are built
// from the data so they never drift from what the screens show.
//   BOOL-048  12031 Rochester Ave  intake lead, green pre-screen (BOOL-053 is the red one)
//   BOOL-009  11234 Gorham Ave   underwriting lot, Daniel + ADU, AI draft ready
//   BOOL-012  1418 Superba Ave   under contract, protected oak still open
//   BOOL-027  1257 Federal Ave   construction, slightly over budget
//   BOOL-028  4128 Garden Ave    construction, late on its permit
//   BOOL-017  3814 Mentone Ave   April mark over $10K, awaiting approval
//   BOOL-034  818 Pacific St     for sale, showings but no offers
//   BOOL-039  3540 Military Ave  sold; closing came in above underwrite

export interface DemoStep {
  title: string;
  path: string;              // pathname + search (+ #section to scroll to), exactly as linked
  talkingPoint: () => string;
}

function asset(id: string): Asset {
  const a = ASSETS.find((x) => x.id === id);
  if (!a) throw new Error(`Demo step references unknown asset ${id}`);
  return a;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const usdK = (n: number) => `${n < 0 ? '−' : '+'}$${(Math.abs(n) / 1000).toFixed(1)}K`;
const pctOf = (part: number, whole: number) => `${((part / whole) * 100).toFixed(2).replace(/0$/, '')}%`;

export const DEMO_STEPS: DemoStep[] = [
  {
    title: 'Dashboard',
    path: '/',
    talkingPoint: () => {
      const la = ASSETS.filter((a) => a.market === 'LA' && !a.disqualified); // as the Dashboard counts
      const stages = new Set(la.map((a) => a.stage)).size;
      return `One book across five markets. Today we follow LA's Westside: ${la.length} assets spanning ${stages} lifecycle stages, from a new lot to a sold home.`;
    },
  },
  {
    title: 'Intake',
    path: '/intake',
    talkingPoint: () => {
      const leads = untriagedLeads();
      const count = (r: PreScreenResult) => leads.filter((a) => a.intake?.preScreen?.result === r).length;
      const green = asset('BOOL-048');
      const red = asset('BOOL-053');
      return `${leads.length} new leads, each pre-screened by the AI: ${count('green')} green, ${count('yellow')} yellow, ${count('red')} red. In LA, ${green.address} is green and ${red.address} is red (${red.intake!.preScreen!.dqReason!.toLowerCase()}). Accept the AI's calls on green and red in one click; yellow always gets a person.`;
    },
  },
  {
    title: 'Underwrite board',
    path: '/underwrite',
    talkingPoint: () => {
      const draft = getAIDraft('BOOL-009')!;
      return `${asset('BOOL-009').address} in Brentwood just landed in Draft ready. The AI drafted the full underwrite in ${draft.draftedInSec} seconds, with a confidence score of ${draft.confidenceScore}.`;
    },
  },
  {
    title: 'AI draft',
    path: '/underwrite/BOOL-009/draft',
    talkingPoint: () => {
      const draft = getAIDraft('BOOL-009')!;
      const adu = draft.adu.fits && draft.adu.sqft ? `, with room for a ${draft.adu.sqft.toLocaleString("en-US")} sqft ADU` : '';
      return `The Daniel fits${adu}. ${draft.recommendation.marginPct}% margin at the ${usd(draft.recommendation.costs.land)} asking. Confirm each section, resolve the setback question, then submit to Growth.`;
    },
  },
  {
    title: 'Under contract',
    path: '/contract/BOOL-012',
    talkingPoint: () => {
      const a = asset('BOOL-012');
      const { signed, total } = diligenceProgress(a);
      const issue = a.contract!.diligence!.issues.find((i) => i.status === 'open');
      const days = daysRemaining(a.contract!.inspectionExpires);
      return `${a.address} in Venice: ${signed} of ${total} diligence sign-offs in${issue ? `, with the ${issue.category.toLowerCase()} issue still open` : ''}. Inspection ends in ${days} days.`;
    },
  },
  {
    title: 'Construction',
    path: '/construction',
    talkingPoint: () => {
      const over = asset('BOOL-027');
      const late = asset('BOOL-028');
      const s = constructionSummary(over)!;
      const weeks = Math.round(constructionSummary(late)!.scheduleSlipDays / 7);
      return `${over.address} is running ${s.variancePct}% over budget (${usdK(s.variance)}), still inside our 2% tolerance. ${late.address} is ${weeks} weeks behind on its permit; expand it to see the carry hit.`;
    },
  },
  {
    title: 'Month-end marks',
    path: '/marks',
    talkingPoint: () => {
      const a = asset('BOOL-017');
      const p = a.markProposal!;
      return `${a.address}'s April mark moves ${usdK(p.change)}, past the $10K line, so it waits for approval. The driver is our own ${asset('BOOL-039').address} sale four blocks away.`;
    },
  },
  {
    title: 'For sale',
    path: '/for-sale',
    talkingPoint: () => {
      const l = asset('BOOL-034').listing!;
      return `${asset('BOOL-034').address} in Santa Monica: ${l.showings} showings in ${l.daysOnMarket} days and no offers. The board diagnoses it and recommends the next move.`;
    },
  },
  {
    title: 'Weekly pricing review',
    path: '/for-sale?view=review',
    talkingPoint: () => {
      const listings = ASSETS.filter((a) => a.stage === 'for_sale' && a.listing);
      const urgent = listings.filter((a) => listingHealth(a).diagnosis !== 'healthy').length;
      return `Weekly pricing review: one decision per listing, logged. ${listings.length} listings, ${urgent} flagged, worked top to bottom with the arrow keys. Each decision records who made it and lands on the asset record.`;
    },
  },
  {
    title: 'Sold asset record',
    path: '/asset/BOOL-039#realized', // lands on the closing-cost line, clear of the presenter card
    talkingPoint: () => {
      const a = asset('BOOL-039');
      const sale = a.sale!;
      const uw = a.underwrite!;
      const buildOver = sale.buildCost - uw.buildCost;
      return `${a.address} sold for ${usd(sale.salePrice)}. The headline is the ${usdK(buildOver).replace('+', '')} retaining-wall overrun, but look at closing: ${pctOf(sale.closingCosts, sale.landPrice)} of land against ${pctOf(uw.closingCosts, uw.landPrice)} underwritten. That gap, repeated across deals, is why we corrected the closing-cost assumption.`;
    },
  },
];

// ── Demo mode state (provider in components/DemoProvider.tsx) ──
export interface DemoState {
  on: boolean;
  step: number;
  setOn: (on: boolean) => void;
  setStep: (step: number) => void;
}

export const DemoContext = createContext<DemoState | null>(null);

export function useDemo(): DemoState {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used inside DemoProvider');
  return ctx;
}

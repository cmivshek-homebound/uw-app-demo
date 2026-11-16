import { createContext, useContext } from 'react';
import type { Asset, AssetStage, PreScreenResult } from '../types';
import { getAIDraft } from './aiDrafts';
import { ASSETS } from './assets';
import { ASSUMPTION_CHANGES } from './assumptionRegistry';
import { budgetSync, promotionImpact } from './blueprint';
import { daysRemaining, diligenceProgress } from './contracts';
import { DRAFT_SECONDS } from './intake';
import { listingHealth } from './listingHealth';
import type { Role } from './role';
import { SOLD_WINDOW_MONTHS, lifecycleByStage, untriagedLeads } from './selectors';
import { CLOSING_COST_CORRECTED_ON } from './underwriting';

// ── Guided demo: LA Westside, nine steps ───────────────────────
// One market followed across the book, from a new lead to a sold home.
// Talking points are built from the data so they never drift from the
// screens, and each path opens the exact view the point refers to.
//   BOOL-048  12031 Rochester Ave  intake lead, green pre-screen (BOOL-053 is the red one)
//   BOOL-009  11234 Gorham Ave     AI draft ready; setback question open
//   BOOL-012  1418 Superba Ave     under contract, protected oak still open
//   BOOL-027  1257 Federal Ave     construction; Blueprint budget changed +$38K
//   BOOL-017  3814 Mentone Ave     April mark over $10K, awaiting approval
//   BOOL-034  818 Pacific St       stale listing, AI recommends a drop
//   BOOL-039  3540 Military Ave    sold; closing came in above underwrite
// Steps 2–5 run as the LA analyst; step 6 switches to Manager to approve.

/** The LA analyst the acquisition steps run as. */
const LA_ANALYST = 'Elena Ruiz';

export interface DemoStep {
  title: string;
  path: string;              // pathname + search (+ #section to scroll to), exactly as linked
  talkingPoint: () => string;
  /** View as for this step; the presenter applies it when the step becomes current. */
  role?: { role: Role; analyst?: string };
}

function asset(id: string): Asset {
  const a = ASSETS.find((x) => x.id === id);
  if (!a) throw new Error(`Demo step references unknown asset ${id}`);
  return a;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const usdK = (n: number) => `${n < 0 ? '−' : '+'}$${(Math.abs(n) / 1000).toFixed(1)}K`;
const usdM = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;
const pctOf = (part: number, whole: number) => `${((part / whole) * 100).toFixed(2).replace(/0$/, '')}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const ACQUISITIONS: AssetStage[] = ['opportunity', 'underwriting', 'under_contract'];
const OWNED: AssetStage[] = ['precon', 'construction', 'for_sale'];

export const DEMO_STEPS: DemoStep[] = [
  {
    title: 'Dashboard: two halves of the book',
    path: '/',
    role: { role: 'executive' },
    talkingPoint: () => {
      const life = lifecycleByStage(); // leaves out DQ'd leads, as the Dashboard does
      const sum = (stages: AssetStage[], key: 'count' | 'value') => stages.reduce((s, st) => s + life[st][key], 0);
      return `The book splits at closing. Acquisitions: ${sum(ACQUISITIONS, 'count')} lots from intake to under contract, ${usdM(sum(ACQUISITIONS, 'value'))} of underwritten ESP. Portfolio: ${sum(OWNED, 'count')} owned homes marked at ${usdM(sum(OWNED, 'value'))}, plus ${life.sold.count} sold in the last ${SOLD_WINDOW_MONTHS} months. Today we follow LA through both halves.`;
    },
  },
  {
    title: 'Intake: accept the AI’s calls',
    path: '/intake',
    role: { role: 'analyst', analyst: LA_ANALYST },
    talkingPoint: () => {
      const leads = untriagedLeads();
      const count = (r: PreScreenResult) => leads.filter((a) => a.intake?.preScreen?.result === r).length;
      const green = asset('BOOL-048');
      return `${plural(leads.length, 'new lead')}, each pre-screened by the AI. Accept AI recommendations: ${count('green')} green go to underwriting and ${count('red')} red are disqualified; the ${count('yellow')} yellow wait for a person. ${green.address} in West LA is one of the greens. Its AI draft finishes in ${DRAFT_SECONDS} seconds: watch the bell.`;
    },
  },
  {
    title: 'AI draft: confirm and submit',
    path: '/underwrite/BOOL-009/draft',
    role: { role: 'analyst', analyst: LA_ANALYST },
    talkingPoint: () => {
      const draft = getAIDraft('BOOL-009')!;
      const a = asset('BOOL-009');
      const adu = draft.adu.fits && draft.adu.sqft ? ` with room for a ${draft.adu.sqft.toLocaleString('en-US')} sqft ADU` : '';
      return `${a.address}: the AI drafted the full underwrite in ${draft.draftedInSec} seconds at ${draft.confidenceScore} confidence. ${draft.recommendation.plan.plan.name} fits${adu}, ${draft.recommendation.marginPct}% margin at the ${usd(draft.recommendation.costs.land)} asking. Confirm the High-confidence sections in one click, answer the setback question, then submit to Growth.`;
    },
  },
  {
    title: 'Under contract: diligence',
    path: '/contract/BOOL-012',
    role: { role: 'analyst', analyst: LA_ANALYST },
    talkingPoint: () => {
      const a = asset('BOOL-012');
      const { signed, total } = diligenceProgress(a);
      const issue = a.contract!.diligence!.issues.find((i) => i.status === 'open');
      const days = daysRemaining(a.contract!.inspectionExpires);
      return `${a.address} in Venice: ${signed} of ${total} diligence sign-offs in${issue ? `, with the ${issue.category.toLowerCase()} issue still open` : ''}. Inspection ends in ${plural(days, 'day')}.`;
    },
  },
  {
    title: 'Blueprint sync: promote a budget',
    path: '/data/blueprint?review=BOOL-027',
    role: { role: 'analyst', analyst: LA_ANALYST },
    talkingPoint: () => {
      const sync = budgetSync(asset('BOOL-027'), {});
      const impact = promotionImpact(sync);
      const pts = impact.marginAfter - impact.marginBefore;
      return `Blueprint changed ${sync.asset.address}'s build budget by ${usdK(sync.diff)}: ${sync.note?.replace(/\.$/, '').toLowerCase()}. Promoting ${sync.bpVersion} takes projected cost to ${usd(impact.costAfter)} and implied margin from ${impact.marginBefore.toFixed(1)}% to ${impact.marginAfter.toFixed(1)}% (${pts < 0 ? '−' : '+'}${Math.abs(pts).toFixed(1)} pts) on the current mark. Review the line diff, then promote.`;
    },
  },
  {
    title: 'Month-end marks: approve as Manager',
    path: '/marks#approval-BOOL-017',
    role: { role: 'manager' },
    talkingPoint: () => {
      const a = asset('BOOL-017');
      const p = a.markProposal!;
      return `Now as Manager. The bell flags ${a.address}'s April mark: ${usdK(p.change)}, over the $10K line, proposed by ${p.analyst}. The driver is our own ${asset('BOOL-039').address} sale four blocks away. Approve it here; ${p.analyst} gets a notification.`;
    },
  },
  {
    title: 'For Sale: weekly pricing review',
    path: '/for-sale?view=review&listing=BOOL-034',
    role: { role: 'manager' },
    talkingPoint: () => {
      const a = asset('BOOL-034');
      const h = listingHealth(a);
      const rec = h.recommendation;
      const markdown = rec.kind === 'drop' && rec.markdown ? `, which needs a ${usdK(-rec.markdown).replace('−', '')} mark-down` : '';
      return `${a.address}: ${a.listing!.daysOnMarket} days on market, ${h.domRatio.toFixed(1)}× the LA norm, and no offers. The AI recommends: ${rec.text.charAt(0).toLowerCase()}${rec.text.slice(1)}${markdown}. Pick Drop price (it's prefilled), add a note and log it; the decision lands on the asset record.`;
    },
  },
  {
    title: 'Sold: underwritten vs realized',
    path: '/asset/BOOL-039#realized', // lands on the closing-cost line, clear of the presenter card
    role: { role: 'manager' },
    talkingPoint: () => {
      const a = asset('BOOL-039');
      const sale = a.sale!;
      const uw = a.underwrite!;
      const buildOver = sale.buildCost - uw.buildCost;
      return `${a.address} sold for ${usd(sale.salePrice)}. The headline is the ${usdK(buildOver).replace('+', '')} retaining-wall overrun, but look at closing: ${pctOf(sale.closingCosts, sale.landPrice)} of land against ${pctOf(uw.closingCosts, uw.landPrice)} underwritten. That gap, repeated across deals, is why we corrected the closing-cost assumption.`;
    },
  },
  {
    title: 'Assumptions: the closing-cost fix',
    path: '/data/assumptions#change-log',
    role: { role: 'manager' },
    talkingPoint: () => {
      const change = ASSUMPTION_CHANGES.find((c) => c.assumptionId === 'closing')!;
      const legacy = ASSETS.filter((a) => a.sale && a.underwrite && a.underwrite.underwrittenOn < CLOSING_COST_CORRECTED_ON);
      const avg = legacy.reduce((s, a) => s + a.sale!.closingCosts / a.sale!.landPrice, 0) / legacy.length * 100;
      const on = new Date(`${change.on}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      return `Closing costs moved from ${change.from} to ${change.to} of land on ${on}: the ${plural(legacy.length, 'sold home')} underwritten before then closed at ${avg.toFixed(2)}% on average against ${change.from} assumed. The change log links straight to that Underwriting accuracy finding, and every value on this page is read from the files the underwrites use.`;
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

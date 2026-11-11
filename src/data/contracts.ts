import type { Asset, AssetUnderwrite, DiligenceSignoffKind, ProvenanceInfo, UnderwriteOverrideField } from '../types';
import { ASSETS } from './assets';
import { DEMO_TODAY, daysRemaining } from './dates';
import { AI } from './provenance';

// ── Under-contract deals ───────────────────────────────────────
// Post-offer workflow state, derived from under-contract assets in
// assets.ts. BOOL-001 (the scripted walkthrough) has hand-written workflow
// cards and timeline below; other deals get theirs from diligence sign-offs.

export { DEMO_TODAY, daysRemaining };

export type ItemState = 'done' | 'due' | 'waiting';

export interface WorkflowItem {
  state: ItemState;
  label: string;
  note: string;
  /** An underwrite figure shown after the label; `value` is filled from the underwrite. */
  field?: Extract<UnderwriteOverrideField, 'buildCost' | 'esp' | 'landPrice'>;
  value?: number;
}

export type CardTone = 'review' | 'progress' | 'waiting' | 'locked';

export interface WorkflowCard {
  id: string;
  title: string;
  status: string;
  tone: CardTone;
  items: WorkflowItem[];
}

export interface TimelineStep {
  label: string;
  date: string;
  state: 'done' | 'pending' | 'tbd';
}

export interface ContractDeal {
  oppId: string;
  address: string;
  cityStateZip: string;
  planLine: string;
  offer: number;
  esp: number;
  marginPct: number;
  contractDate: string;      // ISO
  inspectionExpires: string; // ISO
  cards: WorkflowCard[];
  timeline: TimelineStep[];
}

/** The scripted walkthrough deal; the nav's Under Contract link opens it. */
export const DEMO_DEAL_ID = 'BOOL-001';

type ContractDetail = Pick<ContractDeal, 'planLine' | 'cards' | 'timeline'>;

const CONTRACT_DETAILS: Record<string, ContractDetail> = {
  'BOOL-001': {
    planLine: 'The Emerson · Deluxe · Modern Farmhouse',
    cards: [
      {
        id: 'ic-deck',
        title: 'IC Deck',
        status: 'Draft Ready — Review Needed',
        tone: 'review',
        items: [
          { state: 'done',    label: 'Auto-populated from underwrite',              note: 'done' },
          { state: 'due',     label: 'HPO page — comp photos needed',               note: 'due today' },
          { state: 'due',     label: 'Narrative callouts',                          note: 'due today' },
          { state: 'waiting', label: 'Copy first 3 slides to capital partner deck', note: 'waiting' },
        ],
      },
      {
        id: 'diligence',
        title: 'Diligence Checklist',
        status: 'In Progress — Kickoff Complete',
        tone: 'progress',
        items: [
          { state: 'done',    label: 'Slack kickoff posted',    note: 'done — auto-posted at contract' },
          { state: 'due',     label: 'Site visit',              note: 'due Apr 15' },
          { state: 'due',     label: 'A&D procurement',         note: 'due Apr 17' },
          { state: 'waiting', label: 'Blueprint final budget',  note: 'waiting' },
        ],
      },
      {
        id: 'blueprint',
        title: 'Blueprint Budget',
        status: 'Awaiting procurement',
        tone: 'waiting',
        items: [
          { state: 'done',    label: 'UW build budget locked', field: 'buildCost', note: 'Snapshot BP-2026-04-1122' },
          { state: 'waiting', label: 'Final procurement budget',                   note: 'pending' },
          { state: 'waiting', label: 'Variance check — auto-flags if >3% deviation', note: 'armed' },
          { state: 'waiting', label: 'IC deck budget update',                      note: 'auto-updates on confirmation' },
        ],
      },
      {
        id: 'ctc',
        title: 'Clear to Close',
        status: 'Not yet available',
        tone: 'locked',
        items: [
          { state: 'waiting', label: 'Blueprint budget confirmed', note: 'prerequisite' },
          { state: 'waiting', label: 'IC deck approved',           note: 'prerequisite' },
          { state: 'waiting', label: 'CTC email auto-generated',   note: 'waiting' },
          { state: 'waiting', label: 'Salesforce stage update',    note: 'waiting' },
        ],
      },
    ],
    timeline: [
      { label: 'Contract signed',   date: 'Apr 14', state: 'done' },
      { label: 'Site visit',        date: 'Apr 15', state: 'pending' },
      { label: 'A&D procurement',   date: 'Apr 17', state: 'pending' },
      { label: 'Blueprint budget',  date: 'TBD',    state: 'tbd' },
      { label: 'IC deck approval',  date: 'TBD',    state: 'tbd' },
      { label: 'Clear to Close',    date: 'TBD',    state: 'tbd' },
    ],
  },
};

function underwriteValue(uw: AssetUnderwrite, field: NonNullable<WorkflowItem['field']>): number {
  return { buildCost: uw.buildCost, esp: uw.esp, landPrice: uw.landPrice }[field];
}

export const SIGNOFF_LABELS: Record<DiligenceSignoffKind, string> = {
  design_plan_fit: 'Design / plan fit',
  site_visit: 'Site visit',
  sales_lot_feedback: 'Sales lot feedback',
  procurement_budget: 'Procurement budget',
};

/** Signed-off counts conditional sign-offs, which are signed with an open issue. */
export function diligenceProgress(asset: Asset): { signed: number; total: number; openIssues: number } {
  const d = asset.contract?.diligence;
  return {
    signed: d?.signoffs.filter((s) => s.status !== 'pending').length ?? 0,
    total: d?.signoffs.length ?? 0,
    openIssues: d?.issues.filter((i) => i.status === 'open').length ?? 0,
  };
}

/** Inspection countdown tone: amber under 7 days, red under 3. */
export function inspectionTone(days: number): 'ok' | 'warn' | 'urgent' {
  if (days < 3) return 'urgent';
  if (days < 7) return 'warn';
  return 'ok';
}

/** Underwrite values read as analyst-confirmed once reviewed, or as overrides with their reason. */
export function underwriteInfo(assetId: string, field: UnderwriteOverrideField | 'marginPct'): ProvenanceInfo {
  const review = ASSETS.find((a) => a.id === assetId)?.underwrite?.review;
  const o = review?.overrides.find((x) => x.field === field);
  if (o) return { provenance: 'human', note: `${review!.analyst} overrode AI $${o.aiValue.toLocaleString('en-US')}: ${o.reason}` };
  if (review) return { provenance: 'human', note: `Reviewed by ${review.analyst}` };
  return AI;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Workflow cards and timeline for deals without a scripted walkthrough, from their diligence. */
function derivedDetail(a: Asset): ContractDetail {
  const { signoffs, issues } = a.contract!.diligence!;
  const { signed, total } = diligenceProgress(a);
  const items: WorkflowItem[] = signoffs.map((s) => {
    const label = SIGNOFF_LABELS[s.kind];
    if (s.status === 'signed_off') return { state: 'done', label, note: `${s.owner} · ${shortDate(s.date)}` };
    if (s.status === 'conditional') {
      const issue = issues.find((i) => i.raisedBy === s.kind && i.status === 'open');
      return { state: 'due', label, note: `open issue: ${issue?.category.toLowerCase() ?? 'see asset record'}` };
    }
    return { state: s.date <= DEMO_TODAY ? 'due' : 'waiting', label, note: `${s.owner} · due ${shortDate(s.date)}` };
  });
  const allSigned = signed === total;
  const inspection = a.contract!.inspectionExpires;
  return {
    planLine: a.underwrite!.planName,
    cards: [
      {
        id: 'diligence',
        title: 'Diligence Sign-offs',
        status: `${signed} of ${total} signed off`,
        tone: allSigned ? 'progress' : 'review',
        items,
      },
      {
        id: 'ctc',
        title: 'Clear to Close',
        status: 'Not yet available',
        tone: 'locked',
        items: [
          { state: allSigned ? 'done' : 'waiting', label: 'All diligence signed off', note: 'prerequisite' },
          { state: 'waiting', label: 'Blueprint budget confirmed', note: 'prerequisite' },
          { state: 'waiting', label: 'Inspection period ends', note: shortDate(inspection) },
        ],
      },
    ],
    timeline: [
      { label: 'Contract signed', date: shortDate(a.contract!.contractDate), state: 'done' },
      ...signoffs.map((s): TimelineStep => ({
        label: SIGNOFF_LABELS[s.kind],
        date: shortDate(s.date),
        state: s.status === 'pending' ? 'pending' : 'done',
      })),
      { label: 'Inspection expires', date: shortDate(inspection), state: daysRemaining(inspection) === 0 ? 'done' : 'pending' },
      { label: 'Clear to Close', date: 'TBD', state: 'tbd' },
    ],
  };
}

export const CONTRACT_DEALS: Record<string, ContractDeal> = Object.fromEntries(
  ASSETS.filter((a) => a.stage === 'under_contract' && a.underwrite && a.contract).map((a) => {
    const uw = a.underwrite!;
    const detail = CONTRACT_DETAILS[a.id] ?? (a.contract!.diligence ? derivedDetail(a) : undefined);
    const deal: ContractDeal = {
      oppId: a.id,
      address: a.address,
      cityStateZip: `${a.city}, ${a.state} ${a.zip}`,
      planLine: detail?.planLine ?? uw.planName,
      offer: uw.landPrice,
      esp: uw.esp,
      marginPct: uw.marginPct,
      contractDate: a.contract!.contractDate,
      inspectionExpires: a.contract!.inspectionExpires,
      cards: (detail?.cards ?? []).map((card) => ({
        ...card,
        items: card.items.map((item) => (item.field ? { ...item, value: underwriteValue(uw, item.field) } : item)),
      })),
      timeline: detail?.timeline ?? [],
    };
    return [a.id, deal];
  }),
);

export const contractCount = Object.keys(CONTRACT_DEALS).length;

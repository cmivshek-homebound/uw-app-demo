import { ASSETS } from './assets';

// ── Under-contract deals ───────────────────────────────────────
// Post-offer workflow state, derived from under-contract assets in
// assets.ts. Workflow cards and timeline detail are hardcoded below,
// keyed by asset id.

export { DEMO_TODAY, daysRemaining } from './dates';

export type ItemState = 'done' | 'due' | 'waiting';

export interface WorkflowItem {
  state: ItemState;
  label: string;
  note: string;
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
    planLine: 'The Emerson · Premium · Modern Farmhouse',
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
          { state: 'done',    label: 'UW cost basis locked — $589,812',            note: 'Snapshot BP-2026-04-1122' },
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

export const CONTRACT_DEALS: Record<string, ContractDeal> = Object.fromEntries(
  ASSETS.filter((a) => a.stage === 'under_contract' && a.underwrite && a.contract).map((a) => {
    const uw = a.underwrite!;
    const detail = CONTRACT_DETAILS[a.id];
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
      cards: detail?.cards ?? [],
      timeline: detail?.timeline ?? [],
    };
    return [a.id, deal];
  }),
);

export const contractCount = Object.keys(CONTRACT_DEALS).length;

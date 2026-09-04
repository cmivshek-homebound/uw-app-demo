// ── Under-contract deals ───────────────────────────────────────
// Post-offer workflow state. Keyed by opportunity id.

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

// Fixed "today" for the demo so the inspection countdown is stable.
// Apr 18 against an Apr 24 expiry lands at 6 days remaining.
export const DEMO_TODAY = '2026-04-18T00:00:00Z';

export const CONTRACT_DEALS: Record<string, ContractDeal> = {
  'BOOL-001': {
    oppId: 'BOOL-001',
    address: '4821 Maple Creek Dr',
    cityStateZip: 'Dallas, TX 75227',
    planLine: 'The Emerson · Premium · Modern Farmhouse',
    offer: 405_004,
    esp: 1_119_788,
    marginPct: 36.2,
    contractDate: '2026-04-14T00:00:00Z',
    inspectionExpires: '2026-04-24T00:00:00Z',
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

export const contractCount = Object.keys(CONTRACT_DEALS).length;

/** Whole days from `from` until `until`, floored at 0. */
export function daysRemaining(until: string, from: string = DEMO_TODAY): number {
  const ms = new Date(until).getTime() - new Date(from).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

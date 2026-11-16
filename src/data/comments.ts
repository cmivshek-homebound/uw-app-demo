import { createContext, useContext } from 'react';
import { hoursAgo } from './dates';

// ── Asset comments ─────────────────────────────────────────────
// Seeded threads on the demo assets, plus comments added this session
// (held in React by CommentsProvider). @Name mentions notify that person.

export interface AssetComment {
  id: string;
  assetId: string;
  author: string;
  at: string; // ISO
  text: string;
}

/** The fictional underwriting analysts and SDRs. */
export const ANALYSTS = ['Maya Chen', 'Priya Shah', 'Luis Ortega', 'Elena Ruiz', 'Jordan Pike'];
export const SDRS = ['Taylor Brooks', 'Nate Alvarez', 'Jasmine Reed', 'Marco Diaz', 'Chloe Bennett', 'Ava Kim'];

/** Everyone who can be @mentioned: analysts, SDRs and the marks manager. */
export const PEOPLE = [...ANALYSTS, ...SDRS, 'J. Park'];

const ESCAPED = PEOPLE.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
/** Splits text around @mentions; odd indexes of the split are mentioned names. */
export const MENTION_PATTERN = new RegExp(`@(${ESCAPED.join('|')})`, 'g');

/** People @mentioned in a comment, once each. */
export function mentionsIn(text: string): string[] {
  return [...new Set([...text.matchAll(MENTION_PATTERN)].map((m) => m[1]))];
}

let seq = 0;
function comment(assetId: string, author: string, hours: number, text: string): AssetComment {
  return { id: `seed-c${++seq}`, assetId, author, at: hoursAgo(hours), text };
}

/** Oldest first within each asset. */
export const SEED_COMMENTS: AssetComment[] = [
  // LA Westside demo thread
  comment('BOOL-048', 'Ava Kim', 20, 'Seller is motivated and open to a quick close if we can move this week.'),
  comment('BOOL-009', 'Elena Ruiz', 6, '@Maya Chen the survey shows a 4 ft side setback; the city wants 5 ft for a second story. Worth confirming before you submit.'),
  comment('BOOL-009', 'Maya Chen', 2, 'Good catch. Asked the listing agent for an updated survey; holding the submit until it lands.'),
  comment('BOOL-012', 'Elena Ruiz', 50, 'Arborist report puts the oak’s root zone along the east side. We could lose about 4 ft of footprint.'),
  comment('BOOL-012', 'Jordan Pike', 27, 'If the footprint shrinks, The Daniel still fits per the draft. The ADU is the piece at risk.'),
  comment('BOOL-028', 'Elena Ruiz', 70, 'Plan check came back with corrections. Resubmitted Monday; that’s where the slip started.'),
  comment('BOOL-017', 'Elena Ruiz', 20, 'The driver is our 3540 Military Ave sale, same plan four blocks away. I’d keep the AI value.'),
  comment('BOOL-017', 'Jordan Pike', 18, 'Agree. The MLS comps point the same direction.'),
  comment('BOOL-034', 'Ava Kim', 26, 'Buyer’s agents keep saying price is the blocker, not the house.'),
  comment('BOOL-034', 'Jordan Pike', 1, '@Elena Ruiz worth taking the recommended drop before month-end so the mark and list price line up?'),
  comment('BOOL-039', 'Jordan Pike', 96, 'Closing ran above underwrite: escrow and title fees in this ZIP run high. Flagged it for the closing-cost assumption.'),
];

// ── React context ──────────────────────────────────────────────
export interface CommentStore {
  comments: AssetComment[];
  addComment: (assetId: string, author: string, text: string) => void;
}

export const CommentContext = createContext<CommentStore>({
  comments: SEED_COMMENTS,
  addComment: () => {},
});

export function useComments(): CommentStore {
  return useContext(CommentContext);
}

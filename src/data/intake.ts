import { createContext, useContext } from 'react';
import type { Asset, DqReason } from '../types';
import { ANALYST_BY_MARKET } from './markProposals';
import { MARKS_MANAGER } from './markReview';
import type { Role } from './role';

// ── Intake decisions ───────────────────────────────────────────
// Session-only send / disqualify / hold decisions on intake leads, held in
// React by IntakeProvider (resets on reload), like the draft review actions.

/** How long the simulated AI draft takes after a lead is sent, so the demo can watch it land. */
export const DRAFT_SECONDS = 15;

export type IntakeDecision =
  | { kind: 'sent'; at: string; by: string; draftReadyAt?: string }
  | { kind: 'disqualified'; at: string; by: string; reason: DqReason; note?: string }
  | { kind: 'held'; at: string; by: string; note: string };

/** Who's deciding: the analyst in Analyst view, otherwise the manager. */
export function decider(role: Role, analyst: string): string {
  return role === 'analyst' ? analyst : MARKS_MANAGER;
}

/**
 * Assets with this session's intake decisions applied. Sending moves a lead
 * onto the Underwrite board's AI drafting column, assigned by market; a
 * disqualification takes it off intake (and the board) into the DQ log.
 */
export function withIntakeDecisions(assets: Asset[], decisions: Record<string, IntakeDecision>): Asset[] {
  return assets.map((a) => {
    const d = decisions[a.id];
    if (!d) return a;
    switch (d.kind) {
      case 'sent':
        return {
          ...a,
          stage: 'underwriting',
          underwritingStatus: d.draftReadyAt ? 'draft_ready' : 'ai_drafting',
          underwritingSince: d.draftReadyAt ?? d.at,
          analyst: ANALYST_BY_MARKET[a.market],
          hold: undefined,
        };
      case 'disqualified':
        return { ...a, hold: undefined, disqualified: { on: d.at, by: d.by, reason: d.reason, note: d.note } };
      case 'held':
        return { ...a, hold: { on: d.at, by: d.by, note: d.note } };
    }
  });
}

// ── React context ──────────────────────────────────────────────
export interface IntakeStore {
  decisions: Record<string, IntakeDecision>;
  decide: (updates: Record<string, IntakeDecision>) => void;
}

export const IntakeContext = createContext<IntakeStore>({
  decisions: {},
  decide: () => {},
});

export function useIntake(): IntakeStore {
  return useContext(IntakeContext);
}

import { createContext, useContext } from 'react';
import type { Asset, Market, MarkProposal, MarkProposalStatus } from '../types';
import { APPROVAL_THRESHOLD } from './markProposals';

// ── Month-end mark review ──────────────────────────────────────
// Session-only review of the open month's mark proposals: analyst accepts
// and overrides, manager approvals, and publishing. Held in React by
// MarkReviewProvider; resets on reload.

/** Approves mark moves over the threshold and publishes the month. Fictional. */
export const MARKS_MANAGER = 'J. Park';

export interface MarkOverride {
  value: number;
  aiValue: number;
  reason: string;
  by: string;
}

export interface MarkReview {
  status?: MarkProposalStatus;
  reviewedBy?: string;
  override?: MarkOverride;
  approvalNote?: string;
}

export interface MarksPublication {
  by: string;
  at: string; // ISO
}

/** A proposal with this session's review applied. */
export interface ReviewedMarkProposal extends MarkProposal {
  aiValue: number;          // the AI's proposed value, before any override
  reviewedBy?: string;
  override?: MarkOverride;
  approvalNote?: string;
}

const REVIEWED: MarkProposalStatus[] = ['analyst_reviewed', 'approved'];

export function isResolved(p: MarkProposal): boolean {
  return REVIEWED.includes(p.status);
}

export function reviewedProposal(p: MarkProposal, review: MarkReview | undefined): ReviewedMarkProposal {
  const base: ReviewedMarkProposal = { ...p, aiValue: p.proposedValue };
  if (!review) return base;
  const proposedValue = review.override?.value ?? p.proposedValue;
  return {
    ...base,
    proposedValue,
    change: proposedValue - p.priorValue,
    status: review.status ?? p.status,
    reviewedBy: review.reviewedBy,
    override: review.override,
    approvalNote: review.approvalNote,
    ...(review.status === 'approved' && { approvedBy: MARKS_MANAGER }),
  };
}

/** Status after an analyst accepts or overrides to `change`. */
export function statusAfterReview(change: number): MarkProposalStatus {
  return Math.abs(change) > APPROVAL_THRESHOLD ? 'needs_approval' : 'analyst_reviewed';
}

/**
 * Assets with this session's mark reviews applied. Once published, each
 * reviewed proposal becomes that month's mark.
 */
export function withMarkReviews(
  assets: Asset[],
  reviews: Record<string, MarkReview>,
  published?: MarksPublication,
): Asset[] {
  return assets.map((a) => {
    if (!a.markProposal) return a;
    const p = reviewedProposal(a.markProposal, reviews[a.id]);
    if (!published) return { ...a, markProposal: p };
    return {
      ...a,
      markProposal: p,
      marks: [
        ...(a.marks ?? []),
        {
          month: p.month,
          value: p.proposedValue,
          method: p.method,
          changeFromPrior: p.change,
          approvedBy: p.approvedBy ?? p.reviewedBy ?? p.analyst,
        },
      ],
    };
  });
}

export interface MarketProgress {
  market: Market;
  analyst: string;
  reviewed: number;
  total: number;
}

export function marketProgress(proposals: { market: Market; proposal: MarkProposal }[]): MarketProgress[] {
  const byMarket = new Map<Market, MarketProgress>();
  for (const { market, proposal } of proposals) {
    const row = byMarket.get(market) ?? { market, analyst: proposal.analyst, reviewed: 0, total: 0 };
    row.total += 1;
    if (isResolved(proposal)) row.reviewed += 1;
    byMarket.set(market, row);
  }
  return [...byMarket.values()];
}

// ── React context ──────────────────────────────────────────────
export interface MarkReviewStore {
  reviews: Record<string, MarkReview>;
  published?: MarksPublication;
  accept: (assets: Asset[]) => void;
  override: (asset: Asset, value: number, reason: string) => void;
  approve: (asset: Asset, note: string) => void;
  publish: () => void;
}

export const MarkReviewContext = createContext<MarkReviewStore>({
  reviews: {},
  accept: () => {},
  override: () => {},
  approve: () => {},
  publish: () => {},
});

export function useMarkReviews(): MarkReviewStore {
  return useContext(MarkReviewContext);
}

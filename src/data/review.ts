import { createContext, useContext } from 'react';
import type { Asset } from '../types';
import { SECTION_OVERRIDE_FIELDS } from './aiDrafts';
import type { AIDraft, DraftOverrides, DraftSectionKey, OverrideField } from './aiDrafts';

// ── Analyst review of AI drafts ────────────────────────────────
// Session-only review state (confirmations, overrides, answers, submission).
// Held in React by DraftReviewProvider; resets on reload.

export const DRAFT_SECTIONS: DraftSectionKey[] = ['lot', 'plans', 'adu', 'comps', 'recommendation'];

export const SECTION_TITLES: Record<DraftSectionKey, string> = {
  lot: 'Lot & Zoning',
  plans: 'Feasible Plans',
  adu: 'ADU Fit',
  comps: 'Comp Set',
  recommendation: 'Recommendation',
};

export interface Override {
  value: number;
  aiValue: number;
  reason: string;
}

export interface Submission {
  by: string;
  at: string;        // ISO
  timeKnown: boolean; // false for drafts submitted before this session
}

export interface DraftReview {
  confirmed: Partial<Record<DraftSectionKey, true>>;
  overrides: Partial<Record<OverrideField, Override>>;
  answers: Record<number, string>;
  submitted?: Submission;
}

export type SectionStatus = 'pending' | 'confirmed' | 'overridden';

const EMPTY_REVIEW: DraftReview = { confirmed: {}, overrides: {}, answers: {} };

/** Starting review for a draft. Drafts already submitted come in fully confirmed and answered. */
export function initialReview(draft: AIDraft): DraftReview {
  const { asset } = draft;
  if (asset.underwritingStatus !== 'submitted_to_growth') return EMPTY_REVIEW;
  return {
    confirmed: Object.fromEntries(DRAFT_SECTIONS.map((s) => [s, true])),
    overrides: {},
    answers: Object.fromEntries(draft.openQuestions.map((q, i) => [i, q.answer ?? ''])),
    submitted: { by: asset.analyst ?? 'Unknown', at: asset.underwritingSince ?? '', timeKnown: false },
  };
}

export function overrideValues(review: DraftReview): DraftOverrides {
  return Object.fromEntries(Object.entries(review.overrides).map(([field, o]) => [field, o!.value]));
}

export function sectionStatus(review: DraftReview, section: DraftSectionKey): SectionStatus {
  if (SECTION_OVERRIDE_FIELDS[section].some((f) => review.overrides[f])) return 'overridden';
  return review.confirmed[section] ? 'confirmed' : 'pending';
}

export interface ReviewProgress {
  aiCompletedPct: number;  // review items the AI finished at High confidence
  sectionsLeft: number;
  questionsLeft: number;
  itemsNeedingYou: number;
  canSubmit: boolean;
}

/** Review items are the five sections plus each open question. */
export function reviewProgress(draft: AIDraft, review: DraftReview): ReviewProgress {
  const totalItems = DRAFT_SECTIONS.length + draft.openQuestions.length;
  const aiHigh = DRAFT_SECTIONS.filter((s) => draft.confidence[s] === 'high').length;
  const sectionsLeft = DRAFT_SECTIONS.filter((s) => sectionStatus(review, s) === 'pending').length;
  const questionsLeft = draft.openQuestions.filter((_, i) => !review.answers[i]?.trim()).length;
  const itemsNeedingYou = sectionsLeft + questionsLeft;
  return {
    aiCompletedPct: Math.round((aiHigh / totalItems) * 100),
    sectionsLeft,
    questionsLeft,
    itemsNeedingYou,
    canSubmit: itemsNeedingYou === 0 && draft.asset.underwritingStatus !== 'ai_drafting',
  };
}

/** Assets with this session's submissions applied to their board status. */
export function withReviewStatus(assets: Asset[], reviews: Record<string, DraftReview>): Asset[] {
  return assets.map((a) => {
    const submitted = reviews[a.id]?.submitted;
    if (!submitted || a.underwritingStatus === 'submitted_to_growth') return a;
    return { ...a, underwritingStatus: 'submitted_to_growth', underwritingSince: submitted.at };
  });
}

// ── React context ──────────────────────────────────────────────
export interface DraftReviewStore {
  reviews: Record<string, DraftReview>;
  updateReview: (draft: AIDraft, update: (review: DraftReview) => DraftReview) => void;
}

export const DraftReviewContext = createContext<DraftReviewStore>({
  reviews: {},
  updateReview: () => {},
});

export function useDraftReviews(): DraftReviewStore {
  return useContext(DraftReviewContext);
}

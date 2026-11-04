import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DraftReviewContext, initialReview } from '../data/review';
import type { DraftReview, DraftReviewStore } from '../data/review';
import type { AIDraft } from '../data/aiDrafts';

/** Holds analyst review state for every AI draft for the session. */
export default function DraftReviewProvider({ children }: { children: ReactNode }) {
  const [reviews, setReviews] = useState<Record<string, DraftReview>>({});

  const updateReview = useCallback((draft: AIDraft, update: (review: DraftReview) => DraftReview) => {
    setReviews((prev) => ({
      ...prev,
      [draft.asset.id]: update(prev[draft.asset.id] ?? initialReview(draft)),
    }));
  }, []);

  const store = useMemo<DraftReviewStore>(() => ({ reviews, updateReview }), [reviews, updateReview]);

  return <DraftReviewContext.Provider value={store}>{children}</DraftReviewContext.Provider>;
}

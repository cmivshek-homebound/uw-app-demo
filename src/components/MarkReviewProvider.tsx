import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ASSETS } from '../data/assets';
import { demoNow } from '../data/dates';
import { MARKS_MANAGER, MarkReviewContext, statusAfterReview } from '../data/markReview';
import type { MarkReview, MarkReviewStore, MarksPublication } from '../data/markReview';
import type { Asset } from '../types';

/** Holds month-end mark review state for the session. */
export default function MarkReviewProvider({ children }: { children: ReactNode }) {
  const [reviews, setReviews] = useState<Record<string, MarkReview>>({});
  const [published, setPublished] = useState<MarksPublication>();

  // Accepting keeps the AI value; anything over the threshold still needs approval.
  const accept = useCallback((assets: Asset[]) => {
    setReviews((prev) => {
      const next = { ...prev };
      for (const a of assets) {
        const p = a.markProposal!;
        next[a.id] = { ...prev[a.id], status: statusAfterReview(p.change), reviewedBy: p.analyst };
      }
      return next;
    });
  }, []);

  const override = useCallback((asset: Asset, value: number, reason: string) => {
    const p = asset.markProposal!;
    const aiValue = ASSETS.find((a) => a.id === asset.id)!.markProposal!.proposedValue;
    setReviews((all) => ({
      ...all,
      [asset.id]: {
        status: statusAfterReview(value - p.priorValue),
        reviewedBy: p.analyst,
        override: { value, aiValue, reason, by: p.analyst },
      },
    }));
  }, []);

  const approve = useCallback((asset: Asset, note: string) => {
    setReviews((all) => ({ ...all, [asset.id]: { ...all[asset.id], status: 'approved', approvalNote: note } }));
  }, []);

  const publish = useCallback(() => setPublished({ by: MARKS_MANAGER, at: demoNow() }), []);

  const store = useMemo<MarkReviewStore>(
    () => ({ reviews, published, accept, override, approve, publish }),
    [reviews, published, accept, override, approve, publish],
  );

  return <MarkReviewContext.Provider value={store}>{children}</MarkReviewContext.Provider>;
}

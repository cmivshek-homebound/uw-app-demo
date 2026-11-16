import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ASSETS } from '../data/assets';
import { demoNow } from '../data/dates';
import { MARKS_MANAGER, MarkReviewContext, statusAfterReview } from '../data/markReview';
import type { MarkReview, MarkReviewStore, MarksPublication } from '../data/markReview';
import { useNotifications } from '../data/notifications';
import type { Asset } from '../types';

function usdK(n: number) {
  return `${n < 0 ? '−' : '+'}$${(Math.abs(n) / 1000).toFixed(1).replace(/\.0$/, '')}K`;
}

/** Holds month-end mark review state for the session. */
export default function MarkReviewProvider({ children }: { children: ReactNode }) {
  const [reviews, setReviews] = useState<Record<string, MarkReview>>({});
  const [published, setPublished] = useState<MarksPublication>();
  const { notify, markRead } = useNotifications();

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
    const p = asset.markProposal!;
    markRead([`approval-${asset.id}`]); // the "needs approval" notice is resolved
    notify({
      type: 'approval',
      title: `Mark approved: ${asset.address}`,
      detail: `${MARKS_MANAGER} approved the ${usdK(p.proposedValue - p.priorValue)} April mark${note ? `: “${note}”` : ''}.`,
      assetId: asset.id,
      to: `/asset/${asset.id}`,
      roles: ['analyst', 'manager', 'executive'],
      analyst: p.analyst,
    });
  }, [notify, markRead]);

  const publish = useCallback(() => setPublished({ by: MARKS_MANAGER, at: demoNow() }), []);

  const store = useMemo<MarkReviewStore>(
    () => ({ reviews, published, accept, override, approve, publish }),
    [reviews, published, accept, override, approve, publish],
  );

  return <MarkReviewContext.Provider value={store}>{children}</MarkReviewContext.Provider>;
}

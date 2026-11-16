import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { demoNow } from '../data/dates';
import { ListingActionContext, listingOwner } from '../data/listingActions';
import type { ForSaleView, ListingAction, ListingActionStore, ReviewDecision } from '../data/listingActions';
import type { Asset } from '../types';

/** Holds listing health board decisions for the session. */
export default function ListingActionProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<Record<string, ListingAction>>({});
  const [view, setView] = useState<ForSaleView>('board');

  // `asset` carries any drops already accepted, so `from` is the live list price.
  const acceptDrop = useCallback((asset: Asset, newPrice: number) => {
    const drop = { date: demoNow(), from: asset.listing!.listPrice, to: newPrice, loggedBy: listingOwner(asset) };
    setActions((prev) => ({
      ...prev,
      [asset.id]: { ...prev[asset.id], drops: [...(prev[asset.id]?.drops ?? []), drop] },
    }));
  }, []);

  const dismiss = useCallback((asset: Asset, reason: string) => {
    setActions((prev) => ({
      ...prev,
      [asset.id]: {
        ...prev[asset.id],
        drops: prev[asset.id]?.drops ?? [],
        dismissal: { reason, by: listingOwner(asset), at: demoNow() },
      },
    }));
  }, []);

  // Weekly review decisions are a log: the listing itself changes when someone executes it (e.g. Accept on the board).
  const logDecision = useCallback((asset: Asset, decision: ReviewDecision) => {
    setActions((prev) => ({
      ...prev,
      [asset.id]: {
        ...prev[asset.id],
        drops: prev[asset.id]?.drops ?? [],
        decisions: [...(prev[asset.id]?.decisions ?? []), decision],
      },
    }));
  }, []);

  const store = useMemo<ListingActionStore>(
    () => ({ actions, acceptDrop, dismiss, logDecision, view, setView }),
    [actions, acceptDrop, dismiss, logDecision, view],
  );
  return <ListingActionContext.Provider value={store}>{children}</ListingActionContext.Provider>;
}

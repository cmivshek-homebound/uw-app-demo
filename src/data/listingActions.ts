import { createContext, useContext } from 'react';
import type { Asset, PriceDrop } from '../types';
import { listingHealth } from './listingHealth';

// ── Listing actions ────────────────────────────────────────────
// Session-only decisions from the listing health board: accepted price
// drops (which update the listing) and dismissed recommendations. Held in
// React by ListingActionProvider; resets on reload.

export interface ListingDismissal {
  reason: string;
  by: string;
  at: string; // ISO
}

export interface ListingAction {
  drops: PriceDrop[];
  dismissal?: ListingDismissal;
}

/** Who owns listing decisions for an asset: its sales sign-off owner. */
export function listingOwner(asset: Asset): string {
  return asset.contract?.diligence?.signoffs.find((s) => s.kind === 'sales_lot_feedback')?.owner ?? 'Sales';
}

/** Assets with this session's accepted drops applied to their listings. */
export function withListingActions(assets: Asset[], actions: Record<string, ListingAction>): Asset[] {
  return assets.map((a) => {
    const drops = actions[a.id]?.drops ?? [];
    if (!a.listing || drops.length === 0) return a;
    return {
      ...a,
      listing: {
        ...a.listing,
        listPrice: drops[drops.length - 1].to,
        priceDrops: a.listing.priceDrops + drops.length,
        priceDropHistory: [...(a.listing.priceDropHistory ?? []), ...drops],
      },
    };
  });
}

/** Whether someone already accepted a drop or dismissed the recommendation this session. */
export function listingActed(id: string, actions: Record<string, ListingAction>): boolean {
  return (actions[id]?.drops.length ?? 0) > 0 || actions[id]?.dismissal !== undefined;
}

/** For-sale listings whose health isn't Healthy and that nobody has acted on yet. */
export function listingsNeedingAction(assets: Asset[], actions: Record<string, ListingAction>): Asset[] {
  return assets.filter(
    (a) => a.stage === 'for_sale' && a.listing && listingHealth(a).diagnosis !== 'healthy' && !listingActed(a.id, actions),
  );
}

export interface ListingActionStore {
  actions: Record<string, ListingAction>;
  acceptDrop: (asset: Asset, newPrice: number) => void;
  dismiss: (asset: Asset, reason: string) => void;
}

export const ListingActionContext = createContext<ListingActionStore>({
  actions: {},
  acceptDrop: () => {},
  dismiss: () => {},
});

export function useListingActions(): ListingActionStore {
  return useContext(ListingActionContext);
}

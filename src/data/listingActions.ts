import { createContext, useContext } from 'react';
import type { Asset, PriceDrop } from '../types';

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

import { createContext, useContext } from 'react';
import type { Asset, PriceDrop } from '../types';
import { listingHealth } from './listingHealth';
import type { Role } from './role';

// ── Listing actions ────────────────────────────────────────────
// Session-only decisions from the listing health board: accepted price
// drops (which update the listing) and dismissed recommendations. Held in
// React by ListingActionProvider; resets on reload.

export interface ListingDismissal {
  reason: string;
  by: string;
  at: string; // ISO
}

/** A decision from the weekly pricing review. */
export type ReviewDecisionKind = 'hold' | 'drop' | 'accept' | 'counter';

export const DECISION_LABELS: Record<ReviewDecisionKind, string> = {
  hold: 'Hold',
  drop: 'Drop price',
  accept: 'Accept offer',
  counter: 'Counter',
};

export interface ReviewDecision {
  kind: ReviewDecisionKind;
  price?: number;  // new list price (drop), counter price, or accepted offer amount
  note: string;
  at: string;      // ISO
  by: string;      // who logged it
  role: Role;      // the View as role it was logged under
}

export interface ListingAction {
  drops: PriceDrop[];
  dismissal?: ListingDismissal;
  decisions?: ReviewDecision[]; // weekly review, oldest first
}

/** For Sale has two views: the listing health board and the weekly pricing review. */
export type ForSaleView = 'board' | 'review';

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

/** Whether someone accepted a drop, dismissed the recommendation, or logged a review decision this session. */
export function listingActed(id: string, actions: Record<string, ListingAction>): boolean {
  const a = actions[id];
  return (a?.drops.length ?? 0) > 0 || a?.dismissal !== undefined || (a?.decisions?.length ?? 0) > 0;
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
  logDecision: (asset: Asset, decision: ReviewDecision) => void;
  view: ForSaleView;
  setView: (view: ForSaleView) => void;
}

export const ListingActionContext = createContext<ListingActionStore>({
  actions: {},
  acceptDrop: () => {},
  dismiss: () => {},
  logDecision: () => {},
  view: 'board',
  setView: () => {},
});

export function useListingActions(): ListingActionStore {
  return useContext(ListingActionContext);
}

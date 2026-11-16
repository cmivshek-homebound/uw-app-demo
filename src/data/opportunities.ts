import type { Asset, Opportunity } from '../types';
import { ASSETS } from './assets';

// ── Lot intake records ─────────────────────────────────────────
// The triage, scenario and comp pages read a lot's intake details from its
// asset record. Pipeline status lives on the asset (stage + underwritingStatus).

function toOpportunity(asset: Asset): Opportunity {
  return {
    id: asset.id,
    address: asset.address,
    city: asset.city,
    state: asset.state,
    zip: asset.zip,
    market: asset.market,
    lotSqFt: asset.lotSqFt,
    source: asset.intake!.source,
    sdrOwner: asset.intake!.sdrOwner,
    dateReceived: asset.intake!.dateReceived,
  };
}

/** Intake details for any lot that came through intake. */
export function findOpportunity(id: string): Opportunity | undefined {
  const asset = ASSETS.find((a) => a.id === id);
  return asset?.intake ? toOpportunity(asset) : undefined;
}

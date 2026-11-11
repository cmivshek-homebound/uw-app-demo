import type { Asset, Opportunity } from '../types';
import { ASSETS } from './assets';

// ── Opportunity queue ──────────────────────────────────────────
// Derived from assets.ts: every opportunity / underwriting-stage asset. Lots
// that have moved on (e.g. BOOL-001, now under contract) leave the queue and
// its counts, but findOpportunity still resolves them so their triage,
// scenario and comp pages keep working from the asset record.

function toOpportunity(asset: Asset, status: Opportunity['status']): Opportunity {
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
    status,
  };
}

export const mockOpportunities: Opportunity[] = ASSETS
  .filter((a) => a.intake && a.pipelineStatus)
  .map((a) => toOpportunity(a, a.pipelineStatus!))
  .sort((a, b) => a.id.localeCompare(b.id));

/** A queue row, or for a lot past the pipeline, its intake shown as offered. */
export function findOpportunity(id: string): Opportunity | undefined {
  const queued = mockOpportunities.find((o) => o.id === id);
  if (queued) return queued;
  const asset = ASSETS.find((a) => a.id === id);
  return asset?.intake && asset.underwrite ? toOpportunity(asset, 'ready_for_offer') : undefined;
}

/** Updates the queue row and, for pipeline-stage assets, the underlying asset. */
export function updateOpportunityStatus(id: string, status: Opportunity['status']) {
  const opp = mockOpportunities.find((o) => o.id === id);
  if (opp) opp.status = status;
  const asset = ASSETS.find((a) => a.id === id);
  if (asset?.pipelineStatus) asset.pipelineStatus = status;
}

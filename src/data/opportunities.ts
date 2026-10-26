import type { Asset, Opportunity } from '../types';
import { ASSETS } from './assets';
import { DEMO_DEAL_ID } from './contracts';

// ── Opportunity queue ──────────────────────────────────────────
// Derived from assets.ts: every opportunity / underwriting-stage asset, plus
// the scripted demo deal pinned at its intake status so the walkthrough
// (queue → underwrite → scenario → comps → contract) still starts here.

const DEMO_DEAL_QUEUE_STATUS: Opportunity['status'] = 'pending_review';

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
  .filter((a) => a.intake && (a.id === DEMO_DEAL_ID || a.pipelineStatus))
  .map((a) => toOpportunity(a, a.id === DEMO_DEAL_ID ? DEMO_DEAL_QUEUE_STATUS : a.pipelineStatus!))
  .sort((a, b) => a.id.localeCompare(b.id));

/** Updates the queue row and, for pipeline-stage assets, the underlying asset. */
export function updateOpportunityStatus(id: string, status: Opportunity['status']) {
  const opp = mockOpportunities.find((o) => o.id === id);
  if (opp) opp.status = status;
  const asset = ASSETS.find((a) => a.id === id);
  if (asset?.pipelineStatus) asset.pipelineStatus = status;
}

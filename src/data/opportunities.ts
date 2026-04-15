import type { Opportunity } from '../types';

export function updateOpportunityStatus(id: string, status: Opportunity['status']) {
  const opp = mockOpportunities.find((o) => o.id === id);
  if (opp) opp.status = status;
}

export const mockOpportunities: Opportunity[] = [
  {
    id: 'BOOL-001',
    address: '4821 Maple Creek Dr',
    city: 'Dallas',
    state: 'TX',
    zip: '75227',
    market: 'DFW',
    lotSqFt: 6240,
    source: 'Off-Market',
    sdrOwner: 'Ben Teters',
    dateReceived: '2026-04-14T00:00:00Z',
    status: 'pending_review',
  },
  {
    id: 'BOOL-002',
    address: '5102 Ridgecrest Ln',
    city: 'Dallas',
    state: 'TX',
    zip: '75228',
    market: 'DFW',
    lotSqFt: 7100,
    source: 'MLS',
    sdrOwner: 'Ben Teters',
    dateReceived: '2026-04-14T00:00:00Z',
    status: 'in_review',
  },
  {
    id: 'BOOL-003',
    address: '8834 Sunbrook Ct',
    city: 'Houston',
    state: 'TX',
    zip: '77055',
    market: 'Houston',
    lotSqFt: 5800,
    source: 'Off-Market',
    sdrOwner: 'Ryan Weiss',
    dateReceived: '2026-04-13T00:00:00Z',
    status: 'pending_review',
  },
  {
    id: 'BOOL-004',
    address: '4710 Elmwood Pass',
    city: 'Tampa',
    state: 'FL',
    zip: '33606',
    market: 'Tampa',
    lotSqFt: 6500,
    source: 'MLS',
    sdrOwner: 'Danny Gaule',
    dateReceived: '2026-04-12T00:00:00Z',
    status: 'ready_for_offer',
  },
];

export interface Opportunity {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  market: string;
  lotSqFt: number;
  source: 'MLS' | 'Off-Market';
  sdrOwner: string;
  dateReceived: string;
  status: 'pending_review' | 'in_review' | 'ready_for_offer' | 'dqd';
}

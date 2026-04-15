export interface Opportunity {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  submittedAt: string;
  status: 'pending' | 'in_review' | 'approved' | 'declined';
  premium: number;
  coverageAmount: number;
  applicantName: string;
}

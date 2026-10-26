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

// ── Unified asset model ────────────────────────────────────────
// One record per property across its full lifecycle. Each stage carries
// the blocks of every stage before it (e.g. a for_sale asset has
// underwrite, contract, owned, marks and listing).

export type AssetStage =
  | 'opportunity'
  | 'underwriting'
  | 'under_contract'
  | 'precon'
  | 'construction'
  | 'for_sale'
  | 'sold';

export type ProductType = 'BOOL' | 'Suburban';

export type Market = 'DFW' | 'Houston' | 'Tampa' | 'St. Pete' | 'LA';

export type PipelineStatus = Opportunity['status'];

export type MarkMethod = 'Asset Valuation' | 'Post-listing';

export interface MonthlyMark {
  month: string;           // YYYY-MM
  value: number;
  method: MarkMethod;
  changeFromPrior: number; // value minus prior month's value; 0 for the first mark
  approvedBy?: string;
}

export interface AssetUnderwrite {
  planName: string;
  landPrice: number;
  totalCost: number;       // land + vertical
  esp: number;
  marginPct: number;       // (esp - totalCost) / esp, as a percent
  underwrittenOn: string;  // ISO
}

export interface AssetContract {
  contractDate: string;      // ISO
  inspectionExpires: string; // ISO
}

export interface AssetOwned {
  closedOn: string;     // ISO
  budget: number;       // vertical budget (totalCost - landPrice)
  costToDate: number;   // vertical spend to date
  pctComplete: number;  // 0–1
}

export interface AssetListing {
  listedOn: string;     // ISO
  listPrice: number;
  daysOnMarket: number;
  showings: number;
  priceDrops: number;
}

export interface AssetSale {
  soldOn: string;       // ISO
  salePrice: number;
}

export interface Asset {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  market: Market;
  productType: ProductType;
  stage: AssetStage;
  lotSqFt: number;
  pipelineStatus?: PipelineStatus; // opportunity / underwriting stages only
  underwrite?: AssetUnderwrite;
  contract?: AssetContract;
  owned?: AssetOwned;
  marks?: MonthlyMark[];
  listing?: AssetListing;
  sale?: AssetSale;
}

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

export type Market = 'DFW' | 'Houston' | 'Tampa' | 'St. Pete' | 'LA';

// ── Provenance ─────────────────────────────────────────────────
// Where a displayed number came from: drafted by AI (unconfirmed),
// confirmed or overridden by an analyst, or pulled from a system of record.
export type Provenance = 'ai' | 'human' | 'system';

export type ProvenanceSource = 'Salesforce' | 'BOOL data tape' | 'Blueprint' | 'MLS';

export interface ProvenanceInfo {
  provenance: Provenance;
  source?: ProvenanceSource; // system values
  note?: string;             // human overrides, e.g. "Overrode AI ESP: corner lot premium"
}

export type PipelineStatus = Opportunity['status'];

/** Where a pipeline asset sits on the Underwrite board. */
export type UnderwritingStatus = 'ai_drafting' | 'draft_ready' | 'analyst_review' | 'submitted_to_growth';

export type MarkMethod = 'Asset Valuation' | 'Post-listing';

export interface MonthlyMark {
  month: string;           // YYYY-MM
  value: number;
  method: MarkMethod;
  changeFromPrior: number; // value minus prior month's value; 0 for the first mark
  approvedBy?: string;
}

export interface AssetIntake {
  source: Opportunity['source'];
  sdrOwner: string;
  dateReceived: string; // ISO
}

export interface AssetUnderwrite {
  planName: string;
  landPrice: number;
  closingCosts: number;    // on land
  buildCost: number;       // vertical budget
  carryCosts: number;      // construction financing and carry
  sellingCosts: number;    // commissions and seller closing costs
  totalCost: number;       // land + closing + build + carry + selling (see data/underwriting.ts)
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
  budget: number;       // vertical budget (underwrite.buildCost)
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
  stage: AssetStage;
  lotSqFt: number;
  floodZone?: boolean;            // lot is in a FEMA flood zone (Salesforce)
  pipelineStatus?: PipelineStatus; // opportunity / underwriting stages only
  underwritingStatus?: UnderwritingStatus; // pipeline assets not DQ'd
  underwritingSince?: string;              // ISO, when it entered its current status
  analyst?: string;                        // assigned underwriting analyst
  intake?: AssetIntake;
  underwrite?: AssetUnderwrite;
  contract?: AssetContract;
  owned?: AssetOwned;
  marks?: MonthlyMark[];
  listing?: AssetListing;
  sale?: AssetSale;
}

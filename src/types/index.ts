export interface Opportunity {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  market: string;
  lotSqFt: number;
  source: 'MLS' | 'Off-Market';
  sdrOwner?: string;     // Off-Market leads only; MLS listings have no SDR
  dateReceived: string;
}

// ── Unified asset model ────────────────────────────────────────
// One record per property across its full lifecycle. Each stage carries
// the blocks of every stage before it (e.g. a for_sale asset has
// underwrite, contract, owned, marks and listing).

/** 'opportunity' is untouched intake: a lead nobody has sent to underwriting yet. */
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

/** Where an underwriting-stage asset sits on the Underwrite board. The only pipeline status. */
export type UnderwritingStatus = 'ai_drafting' | 'draft_ready' | 'analyst_review' | 'submitted_to_growth';

export type MarkMethod = 'Asset Valuation' | 'Post-listing';

export interface MonthlyMark {
  month: string;           // YYYY-MM
  value: number;
  method: MarkMethod;
  changeFromPrior: number; // value minus prior month's value; 0 for the first mark
  approvedBy?: string;
}

export type MarkProposalStatus = 'ai_proposed' | 'analyst_reviewed' | 'needs_approval' | 'approved';

export type MarkDriverKind = 'newComps' | 'homeboundSales' | 'seasonality' | 'listingDemand';

export interface MarkComp {
  address: string;
  salePrice: number;
  sqft: number;
  soldOn: string;     // ISO
  distanceMi: number;
}

export interface MarkDriver {
  kind: MarkDriverKind;
  amount: number;          // $ adjustment to the prior month's mark
  explanation: string;     // one line
  comps?: MarkComp[];      // newComps: the non-Homebound sales referenced
  assetIds?: string[];     // homeboundSales: our sold assets referenced (/asset/:id)
}

/** Proposed month-end mark: prior month's mark plus driver adjustments. */
export interface MarkProposal {
  month: string;           // YYYY-MM being proposed
  priorMonth: string;      // YYYY-MM it builds from
  priorValue: number;
  drivers: MarkDriver[];
  change: number;          // sum of driver amounts
  proposedValue: number;
  method: MarkMethod;
  status: MarkProposalStatus; // needs_approval whenever |change| > $10K and not yet approved
  analyst: string;         // assigned by market
  approvedBy?: string;
}

// ── Intake ─────────────────────────────────────────────────────
/** AI pre-screen on a new lead: a traffic light, why, and what it recommends. */
export type PreScreenResult = 'green' | 'yellow' | 'red';
export type IntakeRecommendation = 'send' | 'disqualify' | 'hold';

export const DQ_REASONS = ['Lot too small', 'Price too high', 'Zoning', 'Flood risk', 'Location', 'Other'] as const;
export type DqReason = (typeof DQ_REASONS)[number];

export interface PreScreen {
  result: PreScreenResult;
  reason: string;                  // one line
  recommendation: IntakeRecommendation;
  dqReason?: DqReason;             // when recommending disqualify
}

export interface AssetIntake {
  source: Opportunity['source'];
  sdrOwner?: string;     // Off-Market leads only; MLS listings have no SDR
  dateReceived: string; // ISO
  preScreen?: PreScreen; // intake leads
}

/** A lead ruled out at intake (or later in underwriting). */
export interface Disqualification {
  on: string;      // ISO
  reason: DqReason;
  note?: string;
  by: string;
}

/** A lead parked at intake until something comes back, e.g. a survey from the SDR. */
export interface IntakeHold {
  on: string;      // ISO
  note: string;
  by: string;
}

/** Cost stack shared by the underwrite (projected) and the sale (realized). */
export interface CostBreakdown {
  landPrice: number;
  closingCosts: number;    // on land
  buildCost: number;       // vertical
  carryCosts: number;      // construction financing and carry
  sellingCosts: number;    // commissions and seller closing costs
  totalCost: number;       // land + closing + build + carry + selling (see data/underwriting.ts)
  marginPct: number;       // (price - totalCost) / price, as a percent
}

export type UnderwriteOverrideField =
  | 'esp'
  | 'buildCost'
  | 'landPrice'
  | 'compPricePerSqft'
  | 'sideSetback'
  | 'maxCoveragePct';

export interface UnderwriteOverride {
  field: UnderwriteOverrideField;
  aiValue: number;
  finalValue: number;      // matches the underwrite for esp, buildCost and landPrice
  reason: string;
}

export interface UnderwriteReview {
  analyst: string;
  reviewedOn: string;      // ISO
  overrides: UnderwriteOverride[];
}

export interface AssetUnderwrite extends CostBreakdown {
  planName: string;
  esp: number;             // marginPct is against ESP
  underwrittenOn: string;  // ISO
  review?: UnderwriteReview; // assets past underwriting
}

export type DiligenceSignoffKind = 'design_plan_fit' | 'site_visit' | 'procurement_budget' | 'sales_lot_feedback';

export interface DiligenceSignoff {
  kind: DiligenceSignoffKind;
  owner: string;
  date: string;            // ISO; signed-off date, or due date while pending
  status: 'signed_off' | 'conditional' | 'pending'; // conditional = signed with an open issue
}

export interface DiligenceIssue {
  category: string;        // e.g. 'Protected tree', 'Seller condition'
  notes: string;
  raisedBy: DiligenceSignoffKind;
  status: 'open' | 'resolved';
}

export interface AssetDiligence {
  signoffs: DiligenceSignoff[];
  issues: DiligenceIssue[];
}

export interface AssetContract {
  contractDate: string;      // ISO
  inspectionExpires: string; // ISO
  diligence?: AssetDiligence; // under_contract and later
}

// ── Construction (Blueprint) ───────────────────────────────────
export type BudgetCategory =
  | 'site_work'
  | 'foundation'
  | 'framing'
  | 'roofing'
  | 'mep'
  | 'exterior'
  | 'interior_finishes'
  | 'contingency';

/** One cost category of the vertical budget. Contingency is never spent directly; it funds overruns elsewhere. */
export interface BudgetLine {
  category: BudgetCategory;
  budget: number;
  committed: number;            // contracts and POs issued, including change orders; spent ≤ committed ≤ EAC
  spent: number;
  estimateAtCompletion: number;
  costToComplete: number;       // estimateAtCompletion − spent
  note?: string;                // why the line is off budget
}

export type MilestoneKind =
  | 'permit_issued'
  | 'foundation'
  | 'framing'
  | 'dry_in'
  | 'mep_rough'
  | 'drywall'
  | 'finishes'
  | 'co';

export interface ScheduleMilestone {
  kind: MilestoneKind;
  planned: string;      // ISO
  actual?: string;      // ISO, once reached
  note?: string;        // where a slip started
}

export interface ConstructionSchedule {
  plannedStart: string;        // ISO
  plannedCompletion: string;   // ISO, CO
  forecastCompletion: string;  // ISO; the actual CO date once complete
  milestones: ScheduleMilestone[];
}

export type ChangeOrderReason = 'Design change' | 'Unforeseen condition' | 'Code requirement';

export interface ChangeOrder {
  date: string;         // ISO
  category: BudgetCategory;
  description: string;
  amount: number;
  reason: ChangeOrderReason;
  approvedBy: string;
}

export interface ConstructionDraw {
  date: string;         // ISO
  amount: number;
  status: 'funded' | 'pending';
}

export interface AssetOwned {
  closedOn: string;     // ISO
  startedOn?: string;   // ISO, actual construction start; construction and later
  budget: number;       // vertical budget (underwrite.buildCost); equals the sum of budgetLines budgets
  costToDate: number;   // vertical spend to date; equals the sum of budgetLines spent
  pctComplete: number;  // 0–1, costToDate over estimate at completion (excluding unused contingency)
  budgetLines: BudgetLine[];
  schedule: ConstructionSchedule;
  changeOrders: ChangeOrder[];
  draws: ConstructionDraw[]; // construction loan draws; funded + pending never exceeds costToDate
}

export interface ListingWeek {
  weekStart: string;    // ISO
  days: number;         // 7, or fewer for the current week
  showings: number;
  views: number;        // online listing views
  saves: number;        // online saves / favorites
}

export interface PriceDrop {
  date: string;         // ISO
  from: number;
  to: number;
  loggedBy?: string;    // set when accepted from the listing health board this session
}

export type BuyerFinancing = 'Cash' | 'Conventional' | 'Jumbo' | 'FHA' | 'VA';

export interface ListingOffer {
  date: string;         // ISO
  amount: number;
  financing: BuyerFinancing;
  concessions: number;  // $ requested from the seller; 0 for none
  concessionNote?: string;
  status: 'active' | 'countered' | 'rejected' | 'accepted';
}

export interface AssetListing {
  listedOn: string;     // ISO
  listPrice: number;    // current (after any drops)
  daysOnMarket: number;
  showings: number;     // total; equals the sum of weeklyHistory showings
  priceDrops: number;   // equals priceDropHistory.length where history exists
  // For-sale listings carry full history; sold listings only the totals above.
  weeklyHistory?: ListingWeek[];
  priceDropHistory?: PriceDrop[];
  offers?: ListingOffer[];
}

/** Realized costs at sale; marginPct is against salePrice. */
export interface AssetSale extends CostBreakdown {
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
  disqualified?: Disqualification;         // DQ'd at intake or in underwriting; off the board
  hold?: IntakeHold;                       // intake leads parked by a person
  underwritingStatus?: UnderwritingStatus; // underwriting stage only
  underwritingSince?: string;              // ISO, when it entered its current status
  analyst?: string;                        // assigned underwriting analyst
  intake?: AssetIntake;
  underwrite?: AssetUnderwrite;
  contract?: AssetContract;
  owned?: AssetOwned;
  marks?: MonthlyMark[];
  markProposal?: MarkProposal; // owned, unsold assets: the open month-end
  listing?: AssetListing;
  sale?: AssetSale;
}

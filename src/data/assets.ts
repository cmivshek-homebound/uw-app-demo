import type {
  Asset,
  AssetDiligence,
  AssetIntake,
  AssetListing,
  BuyerFinancing,
  AssetStage,
  Market,
  MonthlyMark,
  DiligenceIssue,
  DiligenceSignoffKind,
  ListingOffer,
  PipelineStatus,
  UnderwriteOverrideField,
  UnderwritingStatus,
} from '../types';
import { buildConstruction } from './construction';
import { DEMO_TODAY, daysRemaining } from './dates';
import { buildMarkProposal } from './markProposals';
import { seededRandom } from './random';
import { buildForMargin, closingCostPctFor, costStack, marginPct } from './underwriting';

// ── Unified asset portfolio ────────────────────────────────────
// Single source of truth for property data. opportunities.ts and
// contracts.ts derive their legacy exports from ASSETS.
// Seeds hold only the independent inputs. Everything derivable (margin,
// totals, budgets, spend, days on market, monthly marks) is computed by
// buildAsset so the numbers can't drift out of sync.

interface Seed {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  market: Market;
  stage: AssetStage;
  lotSqFt: number;
  floodZone?: boolean;
  pipelineStatus?: PipelineStatus;
  /** Underwrite board column, the date it entered it, and the assigned analyst. */
  uwBoard?: { status: UnderwritingStatus; since: string; analyst: string };
  intake?: AssetIntake;
  /** Underwrite inputs; the rest of the cost stack is derived. `on` defaults to a week before contract. */
  uw?: { plan: string; esp: number; land: number; build: number; on?: string };
  contractDate?: string;      // defaults to 30 days before closedOn
  inspectionExpires?: string; // defaults to 10 days after contractDate
  closedOn?: string;
  pct?: number;               // construction progress, 0–1; for_sale/sold default to 1. Budget lines, schedule, change orders and draws: construction.ts
  listing?: {
    listedOn: string;
    listPrice: number;   // current list price
    showings: number;
    priceDrops: number;
    /** Weekly [showings, online views, saves] since listing; the last week may be partial. */
    weeks?: [number, number, number][];
    drops?: { date: string; from: number; to: number }[];
    offers?: {
      date: string;
      amount: number;
      financing: BuyerFinancing;
      concessions: number;
      concessionNote?: string;
      status: ListingOffer['status'];
    }[];
  };
  /**
   * Realized at sale: closing as % of land, build vs. budget (%, + = overrun),
   * and carry as % of realized build. Selling costs use the standard rate on sale price.
   */
  sale?: { soldOn: string; salePrice: number; closingPct: number; buildVariancePct?: number; carryPct: number };
  /** Forced mark moves (replace that month's drift). */
  markOverrides?: { month: string; change: number; approvedBy?: string }[];
}

const AUTO_APPROVER = 'Auto-approved';

/** Intake for owned assets, which predate the queue: received this long before underwriting. */
const INTAKE_LEAD_DAYS = 6;
const SDR_BY_MARKET: Record<Market, string> = {
  DFW: 'Ben Teters',
  Houston: 'Ryan Weiss',
  Tampa: 'Danny Gaule',
  'St. Pete': 'Karsten Thompson',
  LA: 'Danny Gaule',
};
const MAX_DRIFT = 9_500; // keeps routine monthly drift under the $10K approval threshold (markProposals.ts)

// ── Helpers ────────────────────────────────────────────────────
function iso(date: string): string {
  return date.length === 10 ? `${date}T00:00:00Z` : date;
}

function addDays(date: string, days: number): string {
  const d = new Date(iso(date));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().replace('.000Z', 'Z');
}

function monthOf(date: string): string {
  return iso(date).slice(0, 7);
}

function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

/** Last finished month-end. April 2026 is still open, so its mark is a proposal. */
export const LAST_MARK_MONTH = '2026-03';

function buildMarks(s: Seed, esp: number): MonthlyMark[] {
  const end = s.sale ? monthOf(s.sale.soldOn) : LAST_MARK_MONTH;
  const listedMonth = s.listing ? monthOf(s.listing.listedOn) : null;
  const rand = seededRandom(s.id);
  const marks: MonthlyMark[] = [];
  let value = esp;

  monthsBetween(monthOf(s.closedOn!), end).forEach((month, i) => {
    const override = s.markOverrides?.find((o) => o.month === month);
    let change = 0;
    if (override) {
      change = override.change;
    } else if (i > 0) {
      // ±0.2–0.8% drift, rounded to $500 and capped below the approval threshold.
      const pct = 0.002 + rand() * 0.006;
      const sign = rand() < 0.55 ? 1 : -1;
      change = sign * Math.min(MAX_DRIFT, Math.round((value * pct) / 500) * 500);
    }
    value += change;
    const approvedBy = override ? override.approvedBy : AUTO_APPROVER;
    marks.push({
      month,
      value,
      method: listedMonth && month >= listedMonth ? 'Post-listing' : 'Asset Valuation',
      changeFromPrior: change,
      ...(approvedBy ? { approvedBy } : {}),
    });
  });
  return marks;
}

/** Listing totals plus, where seeded, weekly history, price drops and offers. Totals must agree. */
function buildListing(s: Seed): AssetListing {
  const l = s.listing!;
  const listedOn = iso(l.listedOn);
  const daysOnMarket = daysRemaining(iso(s.sale?.soldOn ?? DEMO_TODAY), listedOn);
  const listing: AssetListing = {
    listedOn,
    listPrice: l.listPrice,
    daysOnMarket,
    showings: l.showings,
    priceDrops: l.priceDrops,
  };
  const fail = (msg: string) => {
    throw new Error(`Listing for ${s.id}: ${msg}`);
  };

  if (l.weeks) {
    if (l.weeks.length !== Math.ceil(daysOnMarket / 7)) fail(`${l.weeks.length} weeks of history for ${daysOnMarket} days`);
    listing.weeklyHistory = l.weeks.map(([showings, views, saves], i) => ({
      weekStart: addDays(listedOn, i * 7),
      days: Math.min(7, daysOnMarket - i * 7),
      showings,
      views,
      saves,
    }));
    const total = l.weeks.reduce((sum, [showings]) => sum + showings, 0);
    if (total !== l.showings) fail(`weekly showings sum to ${total}, not ${l.showings}`);
  }

  if (l.drops) {
    if (l.drops.length !== l.priceDrops) fail(`${l.drops.length} drops in history, ${l.priceDrops} counted`);
    l.drops.forEach((d, i) => {
      if (i > 0 && d.from !== l.drops![i - 1].to) fail(`drop ${i + 1} starts at ${d.from}, not the prior price`);
    });
    if (l.drops.length && l.drops[l.drops.length - 1].to !== l.listPrice) fail('last drop doesn’t land on the list price');
    listing.priceDropHistory = l.drops.map((d) => ({ ...d, date: iso(d.date) }));
  }

  if (l.offers) listing.offers = l.offers.map((o) => ({ ...o, date: iso(o.date) }));
  return listing;
}

function buildAsset(s: Seed): Asset {
  const asset: Asset = {
    id: s.id,
    address: s.address,
    city: s.city,
    state: s.state,
    zip: s.zip,
    market: s.market,
    stage: s.stage,
    lotSqFt: s.lotSqFt,
  };
  if (s.floodZone) asset.floodZone = true;
  if (s.pipelineStatus) asset.pipelineStatus = s.pipelineStatus;
  if (s.intake) asset.intake = { ...s.intake, dateReceived: iso(s.intake.dateReceived) };
  if (s.uwBoard) {
    asset.underwritingStatus = s.uwBoard.status;
    asset.underwritingSince = iso(s.uwBoard.since);
    asset.analyst = s.uwBoard.analyst;
  }

  const contractDate = s.contractDate ?? (s.closedOn ? addDays(s.closedOn, -30) : undefined);

  if (s.uw) {
    const underwrittenOn = iso(s.uw.on ?? addDays(contractDate!, -7));
    const costs = costStack({
      land: s.uw.land,
      build: s.uw.build,
      esp: s.uw.esp,
      closingPct: closingCostPctFor(underwrittenOn),
    });
    asset.underwrite = {
      planName: s.uw.plan,
      landPrice: s.uw.land,
      closingCosts: costs.closing,
      buildCost: costs.build,
      carryCosts: costs.carry,
      sellingCosts: costs.selling,
      totalCost: costs.total,
      esp: s.uw.esp,
      marginPct: marginPct(s.uw.esp, costs.total),
      underwrittenOn,
    };
    if (!asset.intake) {
      asset.intake = {
        source: Number(s.id.slice(-2)) % 2 ? 'MLS' : 'Off-Market',
        sdrOwner: SDR_BY_MARKET[s.market],
        dateReceived: addDays(underwrittenOn, -INTAKE_LEAD_DAYS),
      };
    }
    const review = REVIEWS[s.id];
    if (review) {
      const uwValues: Partial<Record<UnderwriteOverrideField, number>> = {
        esp: s.uw.esp,
        buildCost: s.uw.build,
        landPrice: s.uw.land,
      };
      asset.underwrite.review = {
        analyst: review.analyst,
        reviewedOn: addDays(underwrittenOn, review.days),
        overrides: (review.overrides ?? []).map((o) => ({
          field: o.field,
          aiValue: o.ai,
          finalValue: uwValues[o.field] ?? o.final!,
          reason: o.reason,
        })),
      };
    }
  }

  if (contractDate) {
    asset.contract = {
      contractDate: iso(contractDate),
      inspectionExpires: iso(s.inspectionExpires ?? addDays(contractDate, 10)),
      diligence: buildDiligence(s, contractDate),
    };
  }

  // Realized build for sold assets; everything else spends against budget.
  const realizedBuild = s.sale && s.uw
    ? Math.round((s.uw.build * (1 + (s.sale.buildVariancePct ?? 0) / 100)) / 500) * 500
    : undefined;

  if (s.closedOn && s.uw) {
    const pct = s.pct ?? 1;
    const build = buildConstruction({
      id: s.id,
      market: s.market,
      stage: s.stage,
      closedOn: iso(s.closedOn),
      budget: s.uw.build,
      pct,
      finalCost: realizedBuild,
      listedOn: s.listing && iso(s.listing.listedOn),
    });
    if (realizedBuild !== undefined && build.costToDate !== realizedBuild) {
      throw new Error(`Construction for ${s.id}: final cost doesn’t match the realized build`);
    }
    asset.owned = {
      closedOn: iso(s.closedOn),
      ...(build.startedOn && { startedOn: build.startedOn }),
      budget: s.uw.build,
      costToDate: build.costToDate,
      pctComplete: pct,
      budgetLines: build.budgetLines,
      schedule: build.schedule,
      changeOrders: build.changeOrders,
      draws: build.draws,
    };
    asset.marks = buildMarks(s, s.uw.esp);
  }

  if (s.listing) asset.listing = buildListing(s);

  if (s.sale && s.uw) {
    const realized = costStack({
      land: s.uw.land,
      build: realizedBuild!,
      esp: s.sale.salePrice,
      closingPct: s.sale.closingPct,
      carryPct: s.sale.carryPct,
    });
    asset.sale = {
      soldOn: iso(s.sale.soldOn),
      salePrice: s.sale.salePrice,
      landPrice: realized.land,
      closingCosts: realized.closing,
      buildCost: realized.build,
      carryCosts: realized.carry,
      sellingCosts: realized.selling,
      totalCost: realized.total,
      marginPct: marginPct(s.sale.salePrice, realized.total),
    };
  }

  return asset;
}

// ── Opportunity & underwriting ─────────────────────────────────
// The intake queue. BOOL-001 has moved on to under contract (below).
const pipelineSeeds: Seed[] = [
  {
    id: 'BOOL-002', address: '5102 Ridgecrest Ln', city: 'Dallas', state: 'TX', zip: '75228',
    market: 'DFW', stage: 'underwriting', lotSqFt: 7100, pipelineStatus: 'in_review',
    uwBoard: { status: 'analyst_review', since: '2026-04-16', analyst: 'Maya Chen' },
    intake: { source: 'MLS', sdrOwner: 'Ben Teters', dateReceived: '2026-04-14' },
    uw: { plan: 'The Emerson', esp: 900_000, land: 215_000, build: 455_000, on: '2026-04-16' },
  },
  {
    id: 'BOOL-003', address: '8834 Sunbrook Ct', city: 'Houston', state: 'TX', zip: '77055',
    market: 'Houston', stage: 'opportunity', lotSqFt: 5800, floodZone: true, pipelineStatus: 'pending_review',
    uwBoard: { status: 'draft_ready', since: '2026-04-17', analyst: 'Priya Shah' },
    intake: { source: 'Off-Market', sdrOwner: 'Ryan Weiss', dateReceived: '2026-04-13' },
  },
  {
    id: 'BOOL-004', address: '4710 Elmwood Pass', city: 'Tampa', state: 'FL', zip: '33606',
    market: 'Tampa', stage: 'underwriting', lotSqFt: 6500, pipelineStatus: 'ready_for_offer',
    uwBoard: { status: 'submitted_to_growth', since: '2026-04-17', analyst: 'Luis Ortega' },
    intake: { source: 'MLS', sdrOwner: 'Danny Gaule', dateReceived: '2026-04-12' },
    uw: { plan: 'The Daniel', esp: 1_210_000, land: 320_000, build: 530_000, on: '2026-04-15' },
  },
  {
    id: 'BOOL-005', address: '3821 Westover Hills Blvd', city: 'Fort Worth', state: 'TX', zip: '76116',
    market: 'DFW', stage: 'opportunity', lotSqFt: 5400, pipelineStatus: 'dqd',
    intake: { source: 'MLS', sdrOwner: 'Ben Teters', dateReceived: '2026-04-10' },
  },
  {
    id: 'BOOL-006', address: '7734 Lawndale St', city: 'Houston', state: 'TX', zip: '77023',
    market: 'Houston', stage: 'underwriting', lotSqFt: 6800, pipelineStatus: 'ready_for_offer',
    uwBoard: { status: 'submitted_to_growth', since: '2026-04-16', analyst: 'Maya Chen' },
    intake: { source: 'Off-Market', sdrOwner: 'Ryan Weiss', dateReceived: '2026-04-10' },
    uw: { plan: 'The Benjamin', esp: 730_000, land: 150_000, build: 420_000, on: '2026-04-13' },
  },
  {
    id: 'BOOL-007', address: '2241 Cove Cay Dr', city: 'Clearwater', state: 'FL', zip: '33760',
    market: 'St. Pete', stage: 'opportunity', lotSqFt: 9000, pipelineStatus: 'pending_review',
    uwBoard: { status: 'draft_ready', since: '2026-04-15', analyst: 'Luis Ortega' },
    intake: { source: 'MLS', sdrOwner: 'Karsten Thompson', dateReceived: '2026-04-09' },
  },
  {
    id: 'BOOL-008', address: '4892 Chevy Chase Dr', city: 'Dallas', state: 'TX', zip: '75225',
    market: 'DFW', stage: 'underwriting', lotSqFt: 8100, pipelineStatus: 'in_review',
    uwBoard: { status: 'analyst_review', since: '2026-04-14', analyst: 'Luis Ortega' },
    intake: { source: 'Off-Market', sdrOwner: 'Grady Knipper', dateReceived: '2026-04-09' },
    uw: { plan: 'The Daniel', esp: 1_355_000, land: 420_000, build: 570_000, on: '2026-04-14' },
  },
  {
    id: 'BOOL-009', address: '11234 Gorham Ave', city: 'Los Angeles', state: 'CA', zip: '90049',
    market: 'LA', stage: 'opportunity', lotSqFt: 7000, pipelineStatus: 'pending_review',
    uwBoard: { status: 'draft_ready', since: '2026-04-13', analyst: 'Maya Chen' },
    intake: { source: 'MLS', sdrOwner: 'Danny Gaule', dateReceived: '2026-04-08' },
  },
  {
    id: 'BOOL-010', address: '5523 Morningside Dr', city: 'Houston', state: 'TX', zip: '77005',
    market: 'Houston', stage: 'underwriting', lotSqFt: 5600, pipelineStatus: 'in_review',
    uwBoard: { status: 'analyst_review', since: '2026-04-13', analyst: 'Priya Shah' },
    intake: { source: 'Off-Market', sdrOwner: 'Ryan Weiss', dateReceived: '2026-04-08' },
    uw: { plan: 'The Ryan', esp: 1_095_000, land: 290_000, build: 555_000, on: '2026-04-13' },
  },
  {
    id: 'BOOL-011', address: '2706 W Prospect Rd', city: 'Tampa', state: 'FL', zip: '33629',
    market: 'Tampa', stage: 'opportunity', lotSqFt: 8460, pipelineStatus: 'pending_review',
    uwBoard: { status: 'ai_drafting', since: '2026-04-18', analyst: 'Priya Shah' },
    intake: { source: 'Off-Market', sdrOwner: 'Danny Gaule', dateReceived: '2026-04-16' },
  },
];

// ── Under contract ─────────────────────────────────────────────
// BOOL-001 is the scripted demo deal: received, underwritten and put under
// contract on Apr 14. Its land price and ESP are the figures shown throughout
// the walkthrough; the build budget is backed out to land at this margin.
const BOOL_001_OFFER = 405_004;
const BOOL_001_ESP = 1_119_788;
const BOOL_001_MARGIN_PCT = 19;

const underContractSeeds: Seed[] = [
  {
    id: 'BOOL-001', address: '4821 Maple Creek Dr', city: 'Dallas', state: 'TX', zip: '75227',
    market: 'DFW', stage: 'under_contract', lotSqFt: 6240,
    intake: { source: 'Off-Market', sdrOwner: 'Ben Teters', dateReceived: '2026-04-14' },
    uw: {
      plan: 'The Emerson',
      esp: BOOL_001_ESP,
      land: BOOL_001_OFFER,
      build: buildForMargin({ esp: BOOL_001_ESP, land: BOOL_001_OFFER }, BOOL_001_MARGIN_PCT),
      on: '2026-04-14',
    },
    contractDate: '2026-04-14',
    inspectionExpires: '2026-04-24',
  },
  {
    id: 'BOOL-012', address: '1418 Superba Ave', city: 'Los Angeles', state: 'CA', zip: '90291',
    market: 'LA', stage: 'under_contract', lotSqFt: 5200,
    uw: { plan: 'The Kendall', esp: 3_450_000, land: 1_180_000, build: 1_270_000 },
    contractDate: '2026-04-13',
  },
  {
    id: 'BOOL-040', address: '1347 Seamist Dr', city: 'Houston', state: 'TX', zip: '77008',
    market: 'Houston', stage: 'under_contract', lotSqFt: 5000,
    uw: { plan: 'The Benjamin', esp: 795_000, land: 190_000, build: 445_000 },
    contractDate: '2026-04-10',
  },
];

// ── Pre-con ────────────────────────────────────────────────────
const preconSeeds: Seed[] = [
  {
    id: 'BOOL-013', address: '6127 Velasco Ave', city: 'Dallas', state: 'TX', zip: '75214',
    market: 'DFW', stage: 'precon', lotSqFt: 7000,
    uw: { plan: 'The Emerson', esp: 1_050_000, land: 255_000, build: 520_000 },
    closedOn: '2026-03-12', pct: 0.02,
  },
  {
    id: 'BOOL-014', address: '2318 Bartlett St', city: 'Houston', state: 'TX', zip: '77098',
    market: 'Houston', stage: 'precon', lotSqFt: 5000,
    uw: { plan: 'The Ryan', esp: 980_000, land: 260_000, build: 485_000 },
    closedOn: '2026-02-20', pct: 0.04,
  },
  {
    id: 'BOOL-015', address: '3107 W Bay to Bay Blvd', city: 'Tampa', state: 'FL', zip: '33629',
    market: 'Tampa', stage: 'precon', lotSqFt: 6600,
    uw: { plan: 'The Daniel', esp: 1_290_000, land: 340_000, build: 630_000 },
    closedOn: '2026-01-28', pct: 0.05,
  },
  {
    id: 'BOOL-016', address: '4415 3rd Ave N', city: 'St. Petersburg', state: 'FL', zip: '33713',
    market: 'St. Pete', stage: 'precon', lotSqFt: 6200, floodZone: true,
    uw: { plan: 'The Benjamin', esp: 845_000, land: 205_000, build: 445_000 },
    closedOn: '2026-01-09', pct: 0.03,
  },
  {
    id: 'BOOL-017', address: '3814 Mentone Ave', city: 'Los Angeles', state: 'CA', zip: '90034',
    market: 'LA', stage: 'precon', lotSqFt: 5600,
    uw: { plan: 'The Kendall', esp: 2_850_000, land: 980_000, build: 1_015_000 },
    closedOn: '2026-03-02', pct: 0.01,
  },
  {
    id: 'BOOL-041', address: '1219 N Clinton Ave', city: 'Dallas', state: 'TX', zip: '75208',
    market: 'DFW', stage: 'precon', lotSqFt: 6000,
    uw: { plan: 'The Emerson', esp: 945_000, land: 215_000, build: 605_000 },
    closedOn: '2025-12-15', pct: 0.06,
  },
];

// ── Construction ───────────────────────────────────────────────
const constructionSeeds: Seed[] = [
  {
    id: 'BOOL-018', address: '5527 Vickery Blvd', city: 'Dallas', state: 'TX', zip: '75206',
    market: 'DFW', stage: 'construction', lotSqFt: 6900,
    uw: { plan: 'The Daniel', esp: 1_080_000, land: 270_000, build: 550_000 },
    closedOn: '2025-11-07', pct: 0.14,
  },
  {
    id: 'BOOL-019', address: '3409 Wabash Ave', city: 'Fort Worth', state: 'TX', zip: '76109',
    market: 'DFW', stage: 'construction', lotSqFt: 7500,
    uw: { plan: 'The Emerson', esp: 920_000, land: 210_000, build: 470_000 },
    closedOn: '2025-09-18', pct: 0.38,
  },
  {
    id: 'BOOL-020', address: '7016 Lakewood Blvd', city: 'Dallas', state: 'TX', zip: '75214',
    market: 'DFW', stage: 'construction', lotSqFt: 8200,
    uw: { plan: 'The Dakota', esp: 1_140_000, land: 300_000, build: 530_000 },
    closedOn: '2025-06-05', pct: 0.71,
    // Lakewood comps re-traded up in January; reviewed and approved.
    markOverrides: [{ month: '2026-01', change: 14_500, approvedBy: 'J. Park' }],
  },
  {
    id: 'BOOL-021', address: '1714 Kipling St', city: 'Houston', state: 'TX', zip: '77006',
    market: 'Houston', stage: 'construction', lotSqFt: 5000,
    uw: { plan: 'The Ryan', esp: 955_000, land: 245_000, build: 490_000 },
    closedOn: '2025-08-12', pct: 0.52,
  },
  {
    id: 'BOOL-022', address: '6334 Edloe St', city: 'Houston', state: 'TX', zip: '77005',
    market: 'Houston', stage: 'construction', lotSqFt: 6250,
    uw: { plan: 'The Daniel', esp: 1_095_000, land: 310_000, build: 510_000 },
    closedOn: '2025-04-22', pct: 0.88,
  },
  {
    id: 'BOOL-023', address: '1022 Wakefield Dr', city: 'Houston', state: 'TX', zip: '77018',
    market: 'Houston', stage: 'construction', lotSqFt: 7200,
    uw: { plan: 'The Benjamin', esp: 760_000, land: 175_000, build: 480_000 },
    closedOn: '2025-10-02', pct: 0.26,
  },
  {
    id: 'BOOL-024', address: '4203 W San Miguel St', city: 'Tampa', state: 'FL', zip: '33629',
    market: 'Tampa', stage: 'construction', lotSqFt: 6500,
    uw: { plan: 'The Emerson', esp: 1_180_000, land: 315_000, build: 570_000 },
    closedOn: '2025-07-14', pct: 0.61,
  },
  {
    id: 'BOOL-025', address: '908 E Frierson Ave', city: 'Tampa', state: 'FL', zip: '33603',
    market: 'Tampa', stage: 'construction', lotSqFt: 6000,
    uw: { plan: 'The Dakota', esp: 815_000, land: 170_000, build: 465_000 },
    closedOn: '2025-03-26', pct: 0.93,
  },
  {
    id: 'BOOL-026', address: '2541 Dartmouth Ave N', city: 'St. Petersburg', state: 'FL', zip: '33713',
    market: 'St. Pete', stage: 'construction', lotSqFt: 5900, floodZone: true,
    uw: { plan: 'The Ryan', esp: 870_000, land: 200_000, build: 470_000 },
    closedOn: '2025-05-30', pct: 0.79,
  },
  {
    id: 'BOOL-027', address: '1257 Federal Ave', city: 'Los Angeles', state: 'CA', zip: '90025',
    market: 'LA', stage: 'construction', lotSqFt: 6100,
    uw: { plan: 'The Daniel', esp: 3_620_000, land: 1_240_000, build: 1_295_000 },
    closedOn: '2025-04-08', pct: 0.84,
  },
  {
    id: 'BOOL-028', address: '4128 Garden Ave', city: 'Los Angeles', state: 'CA', zip: '90039',
    market: 'LA', stage: 'construction', lotSqFt: 5000,
    uw: { plan: 'The Kendall', esp: 2_480_000, land: 820_000, build: 940_000 },
    closedOn: '2025-09-03', pct: 0.33,
  },
  {
    id: 'BOOL-042', address: '8123 Westview Dr', city: 'Houston', state: 'TX', zip: '77055',
    market: 'Houston', stage: 'construction', lotSqFt: 6400,
    uw: { plan: 'The Benjamin', esp: 740_000, land: 165_000, build: 420_000 },
    closedOn: '2025-08-25', pct: 0.48,
  },
];

// ── For sale ───────────────────────────────────────────────────
const forSaleSeeds: Seed[] = [
  {
    id: 'BOOL-029', address: '4615 Abbott Ave', city: 'Dallas', state: 'TX', zip: '75205',
    market: 'DFW', stage: 'for_sale', lotSqFt: 7000,
    uw: { plan: 'The Daniel', esp: 1_060_000, land: 285_000, build: 540_000 },
    closedOn: '2024-11-14',
    listing: {
      // Steady showings, no offers.
      listedOn: '2026-02-06', listPrice: 1_075_000, showings: 18, priceDrops: 0,
      weeks: [[3, 520, 24], [3, 410, 15], [2, 330, 11], [2, 290, 9], [2, 260, 8], [1, 220, 6], [2, 240, 7], [1, 190, 5], [1, 170, 4], [1, 150, 4], [0, 20, 0]],
      drops: [],
      offers: [],
    },
    // No offers in ~50 days on market; March post-listing mark cut to recent Preston Hollow closings.
    markOverrides: [{ month: '2026-03', change: -68_000, approvedBy: 'J. Park' }],
  },
  {
    id: 'BOOL-030', address: '3527 Rice Blvd', city: 'Houston', state: 'TX', zip: '77005',
    market: 'Houston', stage: 'for_sale', lotSqFt: 6250,
    uw: { plan: 'The Emerson', esp: 1_010_000, land: 280_000, build: 510_000 },
    closedOn: '2024-12-09',
    listing: {
      // Active offer below the current mark.
      listedOn: '2026-03-13', listPrice: 1_025_000, showings: 11, priceDrops: 0,
      weeks: [[2, 380, 14], [2, 300, 10], [2, 270, 9], [2, 260, 8], [2, 240, 8], [1, 40, 1]],
      drops: [],
      offers: [
        { date: '2026-03-28', amount: 960_000, financing: 'Conventional', concessions: 15_000, concessionNote: 'Closing-cost credit', status: 'rejected' },
        { date: '2026-04-14', amount: 995_000, financing: 'Conventional', concessions: 10_000, concessionNote: 'Closing-cost credit', status: 'active' },
      ],
    },
  },
  {
    id: 'BOOL-031', address: '2916 W Granada St', city: 'Tampa', state: 'FL', zip: '33629',
    market: 'Tampa', stage: 'for_sale', lotSqFt: 6500,
    uw: { plan: 'The Dakota', esp: 1_150_000, land: 310_000, build: 585_000 },
    closedOn: '2024-09-20',
    listing: {
      // Steady showings, no offers, even after two cuts.
      listedOn: '2026-01-16', listPrice: 1_075_000, showings: 24, priceDrops: 2,
      weeks: [[2, 480, 18], [2, 390, 12], [1, 300, 8], [1, 260, 6], [2, 280, 7], [3, 520, 19], [2, 360, 10], [1, 250, 6], [3, 470, 16], [2, 330, 9], [2, 280, 7], [1, 220, 5], [1, 190, 4], [1, 30, 0]],
      drops: [
        { date: '2026-02-20', from: 1_195_000, to: 1_135_000 },
        { date: '2026-03-18', from: 1_135_000, to: 1_075_000 },
      ],
      offers: [],
    },
    // Price drops in February and March; March cut approved. April's further cut is a proposal.
    markOverrides: [{ month: '2026-03', change: -69_500, approvedBy: 'J. Park' }],
  },
  {
    id: 'BOOL-032', address: '1127 Arlington Ave N', city: 'St. Petersburg', state: 'FL', zip: '33705',
    market: 'St. Pete', stage: 'for_sale', lotSqFt: 5800,
    uw: { plan: 'The Benjamin', esp: 890_000, land: 215_000, build: 500_000 },
    closedOn: '2025-01-17',
    listing: {
      // Healthy: ahead of the St. Pete pace.
      listedOn: '2026-04-01', listPrice: 899_000, showings: 7, priceDrops: 0,
      weeks: [[3, 520, 31], [3, 430, 24], [1, 160, 9]],
      drops: [],
      offers: [],
    },
  },
  {
    id: 'BOOL-033', address: '2423 Glendon Ave', city: 'Los Angeles', state: 'CA', zip: '90064',
    market: 'LA', stage: 'for_sale', lotSqFt: 5500,
    uw: { plan: 'The Kendall', esp: 3_280_000, land: 1_120_000, build: 1_340_000 },
    closedOn: '2024-10-04',
    listing: {
      // Low traffic, even after the March cut.
      listedOn: '2026-02-20', listPrice: 3_199_000, showings: 7, priceDrops: 1,
      weeks: [[2, 310, 9], [1, 220, 5], [1, 240, 6], [1, 180, 4], [1, 150, 3], [0, 120, 2], [0, 110, 2], [1, 100, 2], [0, 10, 0]],
      drops: [{ date: '2026-03-10', from: 3_349_000, to: 3_199_000 }],
      offers: [],
    },
    // Price drop in March after soft showing feedback; mark follows the new list price.
    markOverrides: [{ month: '2026-03', change: -173_000, approvedBy: 'J. Park' }],
  },
  {
    id: 'BOOL-034', address: '818 Pacific St', city: 'Santa Monica', state: 'CA', zip: '90405',
    market: 'LA', stage: 'for_sale', lotSqFt: 6000,
    uw: { plan: 'The Daniel', esp: 4_150_000, land: 1_450_000, build: 1_660_000 },
    closedOn: '2024-08-22',
    listing: {
      // Stale: well past the LA norm, traffic fading after the March cut.
      listedOn: '2026-01-09', listPrice: 3_950_000, showings: 21, priceDrops: 1,
      weeks: [[3, 640, 31], [2, 480, 20], [2, 390, 15], [1, 300, 10], [1, 260, 8], [1, 220, 6], [1, 200, 5], [1, 180, 5], [2, 330, 14], [2, 280, 11], [1, 190, 6], [1, 160, 4], [1, 140, 3], [1, 120, 3], [1, 15, 0]],
      drops: [{ date: '2026-03-12', from: 4_295_000, to: 3_950_000 }],
      offers: [],
    },
    // Price drop in March after 60+ days on market; mark follows the new list price.
    markOverrides: [{ month: '2026-03', change: -254_500, approvedBy: 'J. Park' }],
  },
  {
    id: 'BOOL-043', address: '6107 N Central Ave', city: 'Tampa', state: 'FL', zip: '33604',
    market: 'Tampa', stage: 'for_sale', lotSqFt: 5600,
    uw: { plan: 'The Dakota', esp: 835_000, land: 180_000, build: 490_000 },
    closedOn: '2025-02-11',
    listing: {
      // Active offer above the current mark, two weeks in.
      listedOn: '2026-04-03', listPrice: 849_000, showings: 4, priceDrops: 0,
      weeks: [[2, 410, 22], [1, 330, 15], [1, 50, 3]],
      drops: [],
      offers: [
        { date: '2026-04-13', amount: 840_000, financing: 'Cash', concessions: 0, status: 'active' },
      ],
    },
  },
  {
    id: 'BOOL-044', address: '1845 N Marengo Ave', city: 'Altadena', state: 'CA', zip: '91001',
    market: 'LA', stage: 'for_sale', lotSqFt: 6500,
    uw: { plan: 'The Kendall', esp: 1_980_000, land: 640_000, build: 805_000 },
    closedOn: '2025-03-06',
    listing: {
      // Healthy: ahead of the LA pace with strong saves.
      listedOn: '2026-03-30', listPrice: 2_025_000, showings: 9, priceDrops: 0,
      weeks: [[4, 780, 44], [3, 640, 35], [2, 420, 21]],
      drops: [],
      offers: [],
    },
  },
];

// ── Sold (last 6 months) ───────────────────────────────────────
const soldSeeds: Seed[] = [
  {
    id: 'BOOL-035', address: '6208 Llano Ave', city: 'Dallas', state: 'TX', zip: '75214',
    market: 'DFW', stage: 'sold', lotSqFt: 7100,
    uw: { plan: 'The Emerson', esp: 1_020_000, land: 250_000, build: 550_000 },
    closedOn: '2024-05-16',
    listing: { listedOn: '2025-09-05', listPrice: 1_039_000, showings: 22, priceDrops: 1 },
    sale: { soldOn: '2025-10-24', salePrice: 1_012_000, closingPct: 0.88, carryPct: 6.6 },
  },
  {
    id: 'BOOL-036', address: '2105 Peden St', city: 'Houston', state: 'TX', zip: '77019',
    market: 'Houston', stage: 'sold', lotSqFt: 5000,
    uw: { plan: 'The Ryan', esp: 940_000, land: 250_000, build: 520_000 },
    closedOn: '2024-06-27',
    listing: { listedOn: '2025-10-17', listPrice: 959_000, showings: 16, priceDrops: 0 },
    sale: { soldOn: '2025-12-05', salePrice: 951_000, closingPct: 0.93, buildVariancePct: -2.5, carryPct: 6.0 },
  },
  {
    id: 'BOOL-037', address: '3412 W Bay Vista Ave', city: 'Tampa', state: 'FL', zip: '33611',
    market: 'Tampa', stage: 'sold', lotSqFt: 6700,
    uw: { plan: 'The Daniel', esp: 1_210_000, land: 300_000, build: 650_000 },
    closedOn: '2024-07-30',
    listing: { listedOn: '2025-11-14', listPrice: 1_209_000, showings: 19, priceDrops: 1 },
    sale: { soldOn: '2026-01-22', salePrice: 1_189_000, closingPct: 0.9, buildVariancePct: 6.5, carryPct: 7.2 },
  },
  {
    id: 'BOOL-038', address: '735 18th Ave NE', city: 'St. Petersburg', state: 'FL', zip: '33704',
    market: 'St. Pete', stage: 'sold', lotSqFt: 6000,
    uw: { plan: 'The Emerson', esp: 1_090_000, land: 280_000, build: 605_000 },
    closedOn: '2024-09-10',
    listing: { listedOn: '2026-01-08', listPrice: 1_115_000, showings: 14, priceDrops: 0 },
    sale: { soldOn: '2026-02-27', salePrice: 1_104_000, closingPct: 0.55, carryPct: 6.1 },
  },
  {
    id: 'BOOL-039', address: '3540 Military Ave', city: 'Los Angeles', state: 'CA', zip: '90034',
    market: 'LA', stage: 'sold', lotSqFt: 5600,
    uw: { plan: 'The Kendall', esp: 2_950_000, land: 1_000_000, build: 1_190_000 },
    closedOn: '2024-08-08',
    listing: { listedOn: '2025-12-05', listPrice: 2_995_000, showings: 17, priceDrops: 1 },
    sale: { soldOn: '2026-03-18', salePrice: 2_920_000, closingPct: 0.95, buildVariancePct: 4.5, carryPct: 8.4 },
  },
  {
    id: 'BOOL-045', address: '6814 Lakeshore Dr', city: 'Dallas', state: 'TX', zip: '75214',
    market: 'DFW', stage: 'sold', lotSqFt: 6400,
    uw: { plan: 'The Daniel', esp: 1_045_000, land: 275_000, build: 540_000 },
    closedOn: '2024-12-03',
    listing: { listedOn: '2026-01-30', listPrice: 1_059_000, showings: 12, priceDrops: 0 },
    sale: { soldOn: '2026-04-09', salePrice: 1_048_000, closingPct: 0.6, carryPct: 7.4 },
  },
];

// ── Underwrite reviews ─────────────────────────────────────────
// Who reviewed each underwrite past the underwriting stage, how many days
// after it was drafted, and what they overrode. ESP, build and land overrides
// take their final value from the underwrite above; others state it.
interface ReviewSeed {
  analyst: string;
  days: number;
  overrides?: { field: UnderwriteOverrideField; ai: number; final?: number; reason: string }[];
}

const REVIEWS: Record<string, ReviewSeed> = {
  // Under contract
  'BOOL-001': {
    analyst: 'Luis Ortega', days: 0,
    overrides: [{ field: 'compPricePerSqft', ai: 275, final: 282, reason: 'Corner lot premium on The Daniel’s comps' }],
  },
  'BOOL-012': {
    analyst: 'Maya Chen', days: 2,
    overrides: [{ field: 'buildCost', ai: 1_225_000, reason: 'Protected coast live oak needs a modified foundation' }],
  },
  'BOOL-040': { analyst: 'Priya Shah', days: 1 },
  // Pre-con
  'BOOL-013': {
    analyst: 'Luis Ortega', days: 1,
    overrides: [{ field: 'esp', ai: 1_030_000, reason: 'Two Lakewood comps closed above the draft median after it ran' }],
  },
  'BOOL-014': { analyst: 'Priya Shah', days: 2 },
  'BOOL-015': {
    analyst: 'Maya Chen', days: 1,
    overrides: [{ field: 'esp', ai: 1_315_000, reason: 'Busy-street discount: lot fronts Bay to Bay Blvd' }],
  },
  'BOOL-016': { analyst: 'Luis Ortega', days: 1 },
  'BOOL-017': {
    analyst: 'Priya Shah', days: 2,
    overrides: [{ field: 'buildCost', ai: 997_000, reason: 'LADWP power-line relocation quoted at $18K' }],
  },
  'BOOL-041': {
    analyst: 'Jordan Pike', days: 1,
    overrides: [
      { field: 'esp', ai: 975_000, reason: 'Dropped a Bishop Arts comp with a pool and casita that skewed high' },
      { field: 'buildCost', ai: 575_000, reason: 'Soil report calls for a pier-and-beam foundation' },
    ],
  },
  // Construction
  'BOOL-018': { analyst: 'Luis Ortega', days: 1 },
  'BOOL-019': {
    analyst: 'Jordan Pike', days: 2,
    overrides: [{ field: 'compPricePerSqft', ai: 221, final: 215, reason: 'Dropped an off-market outlier from the comp set' }],
  },
  'BOOL-020': {
    analyst: 'Jordan Pike', days: 1,
    overrides: [{ field: 'esp', ai: 1_110_000, reason: 'Lakewood conservation district premium for brick elevations' }],
  },
  'BOOL-021': {
    analyst: 'Priya Shah', days: 1,
    overrides: [{ field: 'sideSetback', ai: 5, final: 7.5, reason: 'Deed restrictions require 7.5 ft side setbacks' }],
  },
  'BOOL-022': {
    analyst: 'Jordan Pike', days: 2,
    overrides: [{ field: 'buildCost', ai: 485_000, reason: 'Lot sits below street grade; French drain and raised slab per civil' }],
  },
  'BOOL-023': {
    analyst: 'Luis Ortega', days: 1,
    overrides: [
      { field: 'buildCost', ai: 445_000, reason: 'Soil report calls for a pier-and-beam foundation' },
      { field: 'esp', ai: 790_000, reason: 'Lot backs to a commercial alley' },
    ],
  },
  'BOOL-024': { analyst: 'Maya Chen', days: 2 },
  'BOOL-025': {
    analyst: 'Jordan Pike', days: 1,
    overrides: [{ field: 'esp', ai: 830_000, reason: 'Busy-street discount: a block off Florida Ave' }],
  },
  'BOOL-026': { analyst: 'Elena Ruiz', days: 1 },
  'BOOL-027': {
    analyst: 'Elena Ruiz', days: 2,
    overrides: [{ field: 'buildCost', ai: 1_270_000, reason: 'Arborist monitoring for two protected sycamores' }],
  },
  'BOOL-028': { analyst: 'Maya Chen', days: 1 },
  'BOOL-042': {
    analyst: 'Priya Shah', days: 1,
    overrides: [{ field: 'compPricePerSqft', ai: 172, final: 168, reason: 'Excluded a renovated resale miscoded as new construction' }],
  },
  // For sale
  'BOOL-029': { analyst: 'Elena Ruiz', days: 1 },
  'BOOL-030': {
    analyst: 'Jordan Pike', days: 2,
    overrides: [{ field: 'esp', ai: 995_000, reason: 'Park-facing lot sells at a premium' }],
  },
  'BOOL-031': {
    analyst: 'Elena Ruiz', days: 1,
    overrides: [{ field: 'esp', ai: 1_175_000, reason: 'Sales flagged Dale Mabry traffic 0.3 mi away' }],
  },
  'BOOL-032': { analyst: 'Jordan Pike', days: 1 },
  'BOOL-033': { analyst: 'Elena Ruiz', days: 2 },
  'BOOL-034': {
    analyst: 'Elena Ruiz', days: 1,
    overrides: [
      { field: 'esp', ai: 4_250_000, reason: 'Two Ocean Park comps have ocean views this lot lacks' },
      { field: 'buildCost', ai: 1_620_000, reason: 'Coastal zone permit adds engineering and inspections' },
    ],
  },
  'BOOL-043': { analyst: 'Jordan Pike', days: 1 },
  'BOOL-044': {
    analyst: 'Jordan Pike', days: 2,
    overrides: [{ field: 'maxCoveragePct', ai: 50, final: 45, reason: 'Hillside ordinance caps coverage at 45%' }],
  },
  // Sold
  'BOOL-035': { analyst: 'Elena Ruiz', days: 1 },
  'BOOL-036': {
    analyst: 'Elena Ruiz', days: 2,
    overrides: [{ field: 'buildCost', ai: 535_000, reason: 'Procurement locked the framing package before a lumber increase' }],
  },
  'BOOL-037': { analyst: 'Jordan Pike', days: 1 },
  'BOOL-038': {
    analyst: 'Elena Ruiz', days: 1,
    overrides: [{ field: 'esp', ai: 1_075_000, reason: 'Waterfront-adjacent comps support a higher ESP' }],
  },
  'BOOL-039': { analyst: 'Elena Ruiz', days: 2 },
  'BOOL-045': { analyst: 'Jordan Pike', days: 1 },
};

// ── Contract diligence ─────────────────────────────────────────
// Four sign-offs per contract, due a set number of days after signing.
// A sign-off is pending until its date passes, and conditional while an
// issue it raised is still open. Owners are fictional, by market.
const SIGNOFF_SCHEDULE: { kind: DiligenceSignoffKind; days: number }[] = [
  { kind: 'design_plan_fit', days: 2 },
  { kind: 'site_visit', days: 3 },
  { kind: 'sales_lot_feedback', days: 5 },
  { kind: 'procurement_budget', days: 7 },
];

const SIGNOFF_OWNERS: Record<Market, Record<DiligenceSignoffKind, string>> = {
  DFW: { design_plan_fit: 'Ana Brooks', site_visit: 'Marcus Lee', procurement_budget: 'Dev Patel', sales_lot_feedback: 'Kim Alvarez' },
  Houston: { design_plan_fit: 'Ana Brooks', site_visit: 'Dana Whitfield', procurement_budget: 'Dev Patel', sales_lot_feedback: 'Brett Lowe' },
  Tampa: { design_plan_fit: 'Tess Morgan', site_visit: 'Chris Vega', procurement_budget: 'Dev Patel', sales_lot_feedback: 'Jules Martin' },
  'St. Pete': { design_plan_fit: 'Tess Morgan', site_visit: 'Chris Vega', procurement_budget: 'Dev Patel', sales_lot_feedback: 'Jules Martin' },
  LA: { design_plan_fit: 'Rafael Ortiz', site_visit: 'Nora Kim', procurement_budget: 'Dev Patel', sales_lot_feedback: 'Sam Rivera' },
};

interface DiligenceSeed {
  /** Dates that differ from the schedule (BOOL-001 follows its contract workflow). */
  dates?: Partial<Record<DiligenceSignoffKind, string>>;
  /** Still open past their due date. */
  overdue?: DiligenceSignoffKind[];
  issues?: DiligenceIssue[];
}

const DILIGENCE: Record<string, DiligenceSeed> = {
  'BOOL-001': {
    // Matches the Under Contract page: site visit due Apr 15, A&D procurement due Apr 17.
    dates: { design_plan_fit: '2026-04-14', site_visit: '2026-04-15', procurement_budget: '2026-04-17', sales_lot_feedback: '2026-04-21' },
    overdue: ['site_visit', 'procurement_budget'],
    issues: [
      { category: 'Commercial proximity', raisedBy: 'sales_lot_feedback', status: 'open',
        notes: 'Gas station 190 ft NE, flagged at triage. Sales to confirm buyer impact before IC.' },
    ],
  },
  'BOOL-012': {
    issues: [
      { category: 'Protected tree', raisedBy: 'site_visit', status: 'open',
        notes: 'Coast live oak in the rear yard is protected; arborist report ordered and the footprint may shift 4 ft.' },
    ],
  },
  'BOOL-040': {
    issues: [
      { category: 'Seller condition', raisedBy: 'sales_lot_feedback', status: 'open',
        notes: 'Seller wants to keep the iron front gate; agreed to close with the backyard shed removed.' },
    ],
  },
  'BOOL-013': {
    issues: [
      { category: 'Survey encroachment', raisedBy: 'site_visit', status: 'resolved',
        notes: 'Neighbor’s fence sat 1.5 ft over the east line; boundary agreement signed before close.' },
    ],
  },
  'BOOL-015': {
    issues: [
      { category: 'Protected tree', raisedBy: 'site_visit', status: 'resolved',
        notes: 'Grand live oak (34 in DBH) near the front setback; driveway moved to save it, no removal permit needed.' },
    ],
  },
  'BOOL-017': {
    issues: [
      { category: 'Utility conflict', raisedBy: 'site_visit', status: 'resolved',
        notes: 'Overhead power line crosses the rear corner; LADWP relocation quoted at $18K and added to the budget.' },
    ],
  },
  'BOOL-020': {
    issues: [
      { category: 'Design review', raisedBy: 'design_plan_fit', status: 'resolved',
        notes: 'Lakewood conservation district required facade review; approved with the brick elevation.' },
    ],
  },
  'BOOL-022': {
    issues: [
      { category: 'Drainage', raisedBy: 'site_visit', status: 'resolved',
        notes: 'Lot sits 8 in below street grade; French drain and raised slab added per civil.' },
    ],
  },
  'BOOL-024': {
    issues: [
      { category: 'Seller condition', raisedBy: 'sales_lot_feedback', status: 'resolved',
        notes: 'Seller asked for a 30-day rent-back after close; granted, start pushed 3 weeks.' },
    ],
  },
  'BOOL-027': {
    issues: [
      { category: 'Protected tree', raisedBy: 'site_visit', status: 'resolved',
        notes: 'Two protected sycamores along the side yard; arborist monitors foundation work.' },
    ],
  },
  'BOOL-031': {
    issues: [
      { category: 'Location', raisedBy: 'sales_lot_feedback', status: 'resolved',
        notes: 'Sales flagged Dale Mabry traffic 0.3 mi away; ESP set below the AI draft.' },
    ],
  },
  'BOOL-034': {
    issues: [
      { category: 'Seller condition', raisedBy: 'sales_lot_feedback', status: 'resolved',
        notes: 'Seller kept the right to salvage the original Craftsman doors before demo.' },
    ],
  },
  'BOOL-037': {
    issues: [
      { category: 'Soils', raisedBy: 'site_visit', status: 'resolved',
        notes: 'Boring found an organic layer at 6 ft; budget held, but auger-cast piles later ran about $42K over.' },
    ],
  },
  'BOOL-039': {
    issues: [
      { category: 'Retaining wall', raisedBy: 'site_visit', status: 'resolved',
        notes: 'Grade change at the rear line needed a retaining wall; final engineering came in about $54K over budget.' },
    ],
  },
  'BOOL-044': {
    issues: [
      { category: 'Grading permit', raisedBy: 'design_plan_fit', status: 'resolved',
        notes: 'Driveway slope needed a hillside grading permit; approved with a 45% coverage cap.' },
    ],
  },
};

function buildDiligence(s: Seed, contractDate: string): AssetDiligence {
  const seed = DILIGENCE[s.id];
  const issues = seed?.issues ?? [];
  const signoffs = SIGNOFF_SCHEDULE.map(({ kind, days }) => {
    const date = iso(seed?.dates?.[kind] ?? addDays(contractDate, days));
    const openIssue = issues.some((i) => i.raisedBy === kind && i.status === 'open');
    const pending = date > DEMO_TODAY || seed?.overdue?.includes(kind);
    const status = pending ? 'pending' : openIssue ? 'conditional' : 'signed_off';
    return { kind, owner: SIGNOFF_OWNERS[s.market][kind], date, status } as const;
  });
  return { signoffs, issues };
}

export const ASSETS: Asset[] = [
  ...pipelineSeeds,
  ...underContractSeeds,
  ...preconSeeds,
  ...constructionSeeds,
  ...forSaleSeeds,
  ...soldSeeds,
].map(buildAsset);

// April month-end proposals read March's mark and our sold assets, so they
// attach once every asset is built.
for (const asset of ASSETS) {
  const proposal = buildMarkProposal(asset, ASSETS);
  if (proposal) asset.markProposal = proposal;
}

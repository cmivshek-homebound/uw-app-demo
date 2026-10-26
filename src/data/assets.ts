import type {
  Asset,
  AssetStage,
  Market,
  MonthlyMark,
  PipelineStatus,
  ProductType,
} from '../types';
import { mockOpportunities } from './opportunities';
import { CONTRACT_DEALS, DEMO_TODAY, daysRemaining } from './contracts';

// ── Unified asset portfolio ────────────────────────────────────
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
  productType?: ProductType; // defaults to BOOL
  stage: AssetStage;
  lotSqFt: number;
  pipelineStatus?: PipelineStatus;
  /** Underwrite inputs; totalCost = land + build. `on` defaults to a week before contract. */
  uw?: { plan: string; esp: number; land: number; build: number; on?: string };
  contractDate?: string;      // defaults to 30 days before closedOn
  inspectionExpires?: string; // defaults to 10 days after contractDate
  closedOn?: string;
  pct?: number;               // construction progress, 0–1; for_sale/sold default to 1
  listing?: { listedOn: string; listPrice: number; showings: number; priceDrops: number };
  sale?: { soldOn: string; salePrice: number };
  /** Forced mark moves (replace that month's drift). */
  markOverrides?: { month: string; change: number; approvedBy?: string }[];
}

const AUTO_APPROVER = 'Auto-approved';
const MAX_DRIFT = 9_500; // keeps routine monthly drift under the $10K approval threshold

// ── Helpers ────────────────────────────────────────────────────
function iso(date: string): string {
  return date.length === 10 ? `${date}T00:00:00Z` : date;
}

function addDays(date: string, days: number): string {
  const d = new Date(iso(date));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().replace('.000Z', 'Z');
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
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

/** Deterministic PRNG so marks are stable between builds. */
function seededRandom(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMarks(s: Seed, esp: number): MonthlyMark[] {
  const end = monthOf(s.sale?.soldOn ?? DEMO_TODAY);
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

function buildAsset(s: Seed): Asset {
  const asset: Asset = {
    id: s.id,
    address: s.address,
    city: s.city,
    state: s.state,
    zip: s.zip,
    market: s.market,
    productType: s.productType ?? 'BOOL',
    stage: s.stage,
    lotSqFt: s.lotSqFt,
  };
  if (s.pipelineStatus) asset.pipelineStatus = s.pipelineStatus;

  const contractDate = s.contractDate ?? (s.closedOn ? addDays(s.closedOn, -30) : undefined);

  if (s.uw) {
    const totalCost = s.uw.land + s.uw.build;
    asset.underwrite = {
      planName: s.uw.plan,
      landPrice: s.uw.land,
      totalCost,
      esp: s.uw.esp,
      marginPct: round1(((s.uw.esp - totalCost) / s.uw.esp) * 100),
      underwrittenOn: iso(s.uw.on ?? addDays(contractDate!, -7)),
    };
  }

  if (contractDate) {
    asset.contract = {
      contractDate: iso(contractDate),
      inspectionExpires: iso(s.inspectionExpires ?? addDays(contractDate, 10)),
    };
  }

  if (s.closedOn && s.uw) {
    const pct = s.pct ?? 1;
    asset.owned = {
      closedOn: iso(s.closedOn),
      budget: s.uw.build,
      costToDate: Math.round(s.uw.build * pct),
      pctComplete: pct,
    };
    asset.marks = buildMarks(s, s.uw.esp);
  }

  if (s.listing) {
    asset.listing = {
      listedOn: iso(s.listing.listedOn),
      listPrice: s.listing.listPrice,
      daysOnMarket: daysRemaining(iso(s.sale?.soldOn ?? DEMO_TODAY), iso(s.listing.listedOn)),
      showings: s.listing.showings,
      priceDrops: s.listing.priceDrops,
    };
  }

  if (s.sale) {
    asset.sale = { soldOn: iso(s.sale.soldOn), salePrice: s.sale.salePrice };
  }

  return asset;
}

// ── Opportunity & underwriting (existing queue + BOOL-011) ─────
// BOOL-001 has moved to under contract (see below).
const PIPELINE_UW: Record<string, NonNullable<Seed['uw']>> = {
  'BOOL-002': { plan: 'The Emerson',  esp:   905_000, land: 215_000, build: 470_000, on: '2026-04-16' },
  'BOOL-004': { plan: 'The Daniel',   esp: 1_230_000, land: 320_000, build: 600_000, on: '2026-04-15' },
  'BOOL-006': { plan: 'The Benjamin', esp:   720_000, land: 150_000, build: 395_000, on: '2026-04-13' },
  'BOOL-008': { plan: 'The Daniel',   esp: 1_350_000, land: 420_000, build: 600_000, on: '2026-04-12' },
  'BOOL-010': { plan: 'The Ryan',     esp: 1_040_000, land: 290_000, build: 495_000, on: '2026-04-11' },
};

const pipelineSeeds: Seed[] = mockOpportunities
  .filter((o) => o.id !== 'BOOL-001')
  .map((o) => ({
    id: o.id,
    address: o.address,
    city: o.city,
    state: o.state,
    zip: o.zip,
    market: o.market as Market,
    stage: o.status === 'in_review' || o.status === 'ready_for_offer' ? 'underwriting' : 'opportunity',
    lotSqFt: o.lotSqFt,
    pipelineStatus: o.status,
    uw: PIPELINE_UW[o.id],
  }));

pipelineSeeds.push({
  id: 'BOOL-011', address: '2706 W Prospect Rd', city: 'Tampa', state: 'FL', zip: '33629',
  market: 'Tampa', stage: 'opportunity', lotSqFt: 6900, pipelineStatus: 'pending_review',
});

// ── Under contract ─────────────────────────────────────────────
const deal = CONTRACT_DEALS['BOOL-001'];
const opp001 = mockOpportunities.find((o) => o.id === 'BOOL-001')!;

const underContractSeeds: Seed[] = [
  {
    id: deal.oppId, address: deal.address, city: opp001.city, state: opp001.state, zip: opp001.zip,
    market: opp001.market as Market, stage: 'under_contract', lotSqFt: opp001.lotSqFt,
    uw: {
      plan: deal.planLine.split(' · ')[0],
      esp: deal.esp,
      land: deal.offer,
      // Back out total cost from the deal's stated margin so it re-derives to the same %.
      build: Math.round(deal.esp * (1 - deal.marginPct / 100)) - deal.offer,
    },
    contractDate: deal.contractDate,
    inspectionExpires: deal.inspectionExpires,
  },
  {
    id: 'BOOL-012', address: '1418 Superba Ave', city: 'Los Angeles', state: 'CA', zip: '90291',
    market: 'LA', stage: 'under_contract', lotSqFt: 5200,
    uw: { plan: 'The Kendall', esp: 3_450_000, land: 1_180_000, build: 1_520_000 },
    contractDate: '2026-04-03',
  },
  {
    id: 'SUB-001', address: '15422 Cypress Hollow Dr', city: 'Cypress', state: 'TX', zip: '77433',
    market: 'Houston', productType: 'Suburban', stage: 'under_contract', lotSqFt: 8800,
    uw: { plan: 'The Laurel', esp: 535_000, land: 82_000, build: 345_000 },
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
    uw: { plan: 'The Ryan', esp: 980_000, land: 260_000, build: 470_000 },
    closedOn: '2026-02-20', pct: 0.04,
  },
  {
    id: 'BOOL-015', address: '3107 W Bay to Bay Blvd', city: 'Tampa', state: 'FL', zip: '33629',
    market: 'Tampa', stage: 'precon', lotSqFt: 6600,
    uw: { plan: 'The Daniel', esp: 1_290_000, land: 340_000, build: 620_000 },
    closedOn: '2026-01-28', pct: 0.05,
  },
  {
    id: 'BOOL-016', address: '4415 3rd Ave N', city: 'St. Petersburg', state: 'FL', zip: '33713',
    market: 'St. Pete', stage: 'precon', lotSqFt: 6200,
    uw: { plan: 'The Benjamin', esp: 845_000, land: 205_000, build: 430_000 },
    closedOn: '2026-01-09', pct: 0.03,
  },
  {
    id: 'BOOL-017', address: '3814 Mentone Ave', city: 'Los Angeles', state: 'CA', zip: '90034',
    market: 'LA', stage: 'precon', lotSqFt: 5600,
    uw: { plan: 'The Kendall', esp: 2_850_000, land: 980_000, build: 1_180_000 },
    closedOn: '2026-03-02', pct: 0.01,
  },
  {
    id: 'SUB-002', address: '1408 Sandstone Ct', city: 'Frisco', state: 'TX', zip: '75034',
    market: 'DFW', productType: 'Suburban', stage: 'precon', lotSqFt: 8400,
    uw: { plan: 'The Cypress', esp: 585_000, land: 92_000, build: 375_000 },
    closedOn: '2025-12-15', pct: 0.06,
  },
];

// ── Construction ───────────────────────────────────────────────
const constructionSeeds: Seed[] = [
  {
    id: 'BOOL-018', address: '5527 Vickery Blvd', city: 'Dallas', state: 'TX', zip: '75206',
    market: 'DFW', stage: 'construction', lotSqFt: 6900,
    uw: { plan: 'The Daniel', esp: 1_080_000, land: 270_000, build: 535_000 },
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
    uw: { plan: 'The Dakota', esp: 1_140_000, land: 300_000, build: 540_000 },
    closedOn: '2025-06-05', pct: 0.71,
    // Lakewood comps re-traded up in January; reviewed and approved.
    markOverrides: [{ month: '2026-01', change: 14_500, approvedBy: 'J. Park' }],
  },
  {
    id: 'BOOL-021', address: '1714 Kipling St', city: 'Houston', state: 'TX', zip: '77006',
    market: 'Houston', stage: 'construction', lotSqFt: 5000,
    uw: { plan: 'The Ryan', esp: 955_000, land: 245_000, build: 465_000 },
    closedOn: '2025-08-12', pct: 0.52,
  },
  {
    id: 'BOOL-022', address: '6334 Edloe St', city: 'Houston', state: 'TX', zip: '77005',
    market: 'Houston', stage: 'construction', lotSqFt: 6250,
    uw: { plan: 'The Daniel', esp: 1_095_000, land: 310_000, build: 520_000 },
    closedOn: '2025-04-22', pct: 0.88,
    // Strong West U new-construction closings this month; awaiting approval.
    markOverrides: [{ month: '2026-04', change: 12_000 }],
  },
  {
    id: 'BOOL-023', address: '1022 Wakefield Dr', city: 'Houston', state: 'TX', zip: '77018',
    market: 'Houston', stage: 'construction', lotSqFt: 7200,
    uw: { plan: 'The Benjamin', esp: 760_000, land: 175_000, build: 405_000 },
    closedOn: '2025-10-02', pct: 0.26,
  },
  {
    id: 'BOOL-024', address: '4203 W San Miguel St', city: 'Tampa', state: 'FL', zip: '33629',
    market: 'Tampa', stage: 'construction', lotSqFt: 6500,
    uw: { plan: 'The Emerson', esp: 1_180_000, land: 315_000, build: 560_000 },
    closedOn: '2025-07-14', pct: 0.61,
  },
  {
    id: 'BOOL-025', address: '908 E Frierson Ave', city: 'Tampa', state: 'FL', zip: '33603',
    market: 'Tampa', stage: 'construction', lotSqFt: 6000,
    uw: { plan: 'The Dakota', esp: 815_000, land: 170_000, build: 440_000 },
    closedOn: '2025-03-26', pct: 0.93,
  },
  {
    id: 'BOOL-026', address: '2541 Dartmouth Ave N', city: 'St. Petersburg', state: 'FL', zip: '33713',
    market: 'St. Pete', stage: 'construction', lotSqFt: 5900,
    uw: { plan: 'The Ryan', esp: 870_000, land: 200_000, build: 445_000 },
    closedOn: '2025-05-30', pct: 0.79,
  },
  {
    id: 'BOOL-027', address: '1257 Federal Ave', city: 'Los Angeles', state: 'CA', zip: '90025',
    market: 'LA', stage: 'construction', lotSqFt: 6100,
    uw: { plan: 'The Daniel', esp: 3_620_000, land: 1_240_000, build: 1_500_000 },
    closedOn: '2025-04-08', pct: 0.84,
  },
  {
    id: 'BOOL-028', address: '4128 Garden Ave', city: 'Los Angeles', state: 'CA', zip: '90039',
    market: 'LA', stage: 'construction', lotSqFt: 5000,
    uw: { plan: 'The Kendall', esp: 2_480_000, land: 820_000, build: 1_060_000 },
    closedOn: '2025-09-03', pct: 0.33,
  },
  {
    id: 'SUB-003', address: '27814 Willow Bend Ln', city: 'Katy', state: 'TX', zip: '77494',
    market: 'Houston', productType: 'Suburban', stage: 'construction', lotSqFt: 9000,
    uw: { plan: 'The Laurel', esp: 540_000, land: 78_000, build: 350_000 },
    closedOn: '2025-08-25', pct: 0.48,
  },
];

// ── For sale ───────────────────────────────────────────────────
const forSaleSeeds: Seed[] = [
  {
    id: 'BOOL-029', address: '4615 Abbott Ave', city: 'Dallas', state: 'TX', zip: '75205',
    market: 'DFW', stage: 'for_sale', lotSqFt: 7000,
    uw: { plan: 'The Daniel', esp: 1_060_000, land: 285_000, build: 505_000 },
    closedOn: '2024-11-14',
    listing: { listedOn: '2026-02-06', listPrice: 1_075_000, showings: 18, priceDrops: 0 },
  },
  {
    id: 'BOOL-030', address: '3527 Rice Blvd', city: 'Houston', state: 'TX', zip: '77005',
    market: 'Houston', stage: 'for_sale', lotSqFt: 6250,
    uw: { plan: 'The Emerson', esp: 1_010_000, land: 280_000, build: 480_000 },
    closedOn: '2024-12-09',
    listing: { listedOn: '2026-03-13', listPrice: 1_025_000, showings: 11, priceDrops: 0 },
  },
  {
    id: 'BOOL-031', address: '2916 W Granada St', city: 'Tampa', state: 'FL', zip: '33629',
    market: 'Tampa', stage: 'for_sale', lotSqFt: 6500,
    uw: { plan: 'The Dakota', esp: 1_150_000, land: 310_000, build: 545_000 },
    closedOn: '2024-09-20',
    listing: { listedOn: '2026-01-16', listPrice: 1_195_000, showings: 24, priceDrops: 2 },
    // Second price drop after 90 days on market; post-listing mark down awaiting approval.
    markOverrides: [{ month: '2026-04', change: -16_500 }],
  },
  {
    id: 'BOOL-032', address: '1127 Arlington Ave N', city: 'St. Petersburg', state: 'FL', zip: '33705',
    market: 'St. Pete', stage: 'for_sale', lotSqFt: 5800,
    uw: { plan: 'The Benjamin', esp: 890_000, land: 215_000, build: 450_000 },
    closedOn: '2025-01-17',
    listing: { listedOn: '2026-03-27', listPrice: 899_000, showings: 7, priceDrops: 0 },
  },
  {
    id: 'BOOL-033', address: '2423 Glendon Ave', city: 'Los Angeles', state: 'CA', zip: '90064',
    market: 'LA', stage: 'for_sale', lotSqFt: 5500,
    uw: { plan: 'The Kendall', esp: 3_280_000, land: 1_120_000, build: 1_360_000 },
    closedOn: '2024-10-04',
    listing: { listedOn: '2026-02-20', listPrice: 3_349_000, showings: 15, priceDrops: 1 },
  },
  {
    id: 'BOOL-034', address: '818 Pacific St', city: 'Santa Monica', state: 'CA', zip: '90405',
    market: 'LA', stage: 'for_sale', lotSqFt: 6000,
    uw: { plan: 'The Daniel', esp: 4_150_000, land: 1_450_000, build: 1_700_000 },
    closedOn: '2024-08-22',
    listing: { listedOn: '2026-01-09', listPrice: 4_295_000, showings: 21, priceDrops: 1 },
  },
  {
    id: 'SUB-004', address: '31207 Cypress Grove Way', city: 'Wesley Chapel', state: 'FL', zip: '33543',
    market: 'Tampa', productType: 'Suburban', stage: 'for_sale', lotSqFt: 8800,
    uw: { plan: 'The Cypress', esp: 565_000, land: 88_000, build: 362_000 },
    closedOn: '2025-02-11',
    listing: { listedOn: '2026-04-03', listPrice: 569_000, showings: 4, priceDrops: 0 },
  },
  {
    id: 'SUB-005', address: '26511 Meadowlark Ct', city: 'Valencia', state: 'CA', zip: '91355',
    market: 'LA', productType: 'Suburban', stage: 'for_sale', lotSqFt: 7200,
    uw: { plan: 'The Laurel', esp: 1_180_000, land: 290_000, build: 650_000 },
    closedOn: '2025-03-06',
    listing: { listedOn: '2026-03-20', listPrice: 1_195_000, showings: 9, priceDrops: 0 },
  },
];

// ── Sold (last 6 months) ───────────────────────────────────────
const soldSeeds: Seed[] = [
  {
    id: 'BOOL-035', address: '6208 Llano Ave', city: 'Dallas', state: 'TX', zip: '75214',
    market: 'DFW', stage: 'sold', lotSqFt: 7100,
    uw: { plan: 'The Emerson', esp: 1_020_000, land: 250_000, build: 500_000 },
    closedOn: '2024-05-16',
    listing: { listedOn: '2025-09-05', listPrice: 1_039_000, showings: 22, priceDrops: 1 },
    sale: { soldOn: '2025-10-24', salePrice: 1_012_000 },
  },
  {
    id: 'BOOL-036', address: '2105 Peden St', city: 'Houston', state: 'TX', zip: '77019',
    market: 'Houston', stage: 'sold', lotSqFt: 5000,
    uw: { plan: 'The Ryan', esp: 940_000, land: 250_000, build: 455_000 },
    closedOn: '2024-06-27',
    listing: { listedOn: '2025-10-17', listPrice: 959_000, showings: 16, priceDrops: 0 },
    sale: { soldOn: '2025-12-05', salePrice: 951_000 },
  },
  {
    id: 'BOOL-037', address: '3412 W Bay Vista Ave', city: 'Tampa', state: 'FL', zip: '33611',
    market: 'Tampa', stage: 'sold', lotSqFt: 6700,
    uw: { plan: 'The Daniel', esp: 1_210_000, land: 300_000, build: 590_000 },
    closedOn: '2024-07-30',
    listing: { listedOn: '2025-11-14', listPrice: 1_249_000, showings: 19, priceDrops: 1 },
    sale: { soldOn: '2026-01-22', salePrice: 1_218_000 },
  },
  {
    id: 'BOOL-038', address: '735 18th Ave NE', city: 'St. Petersburg', state: 'FL', zip: '33704',
    market: 'St. Pete', stage: 'sold', lotSqFt: 6000,
    uw: { plan: 'The Emerson', esp: 1_090_000, land: 280_000, build: 530_000 },
    closedOn: '2024-09-10',
    listing: { listedOn: '2026-01-08', listPrice: 1_115_000, showings: 14, priceDrops: 0 },
    sale: { soldOn: '2026-02-27', salePrice: 1_104_000 },
  },
  {
    id: 'BOOL-039', address: '3540 Military Ave', city: 'Los Angeles', state: 'CA', zip: '90034',
    market: 'LA', stage: 'sold', lotSqFt: 5600,
    uw: { plan: 'The Kendall', esp: 2_950_000, land: 1_000_000, build: 1_240_000 },
    closedOn: '2024-08-08',
    listing: { listedOn: '2025-12-05', listPrice: 2_995_000, showings: 17, priceDrops: 1 },
    sale: { soldOn: '2026-03-18', salePrice: 2_920_000 },
  },
  {
    id: 'SUB-006', address: '4207 Prairie Rose Dr', city: 'McKinney', state: 'TX', zip: '75071',
    market: 'DFW', productType: 'Suburban', stage: 'sold', lotSqFt: 8600,
    uw: { plan: 'The Cypress', esp: 555_000, land: 85_000, build: 358_000 },
    closedOn: '2024-12-03',
    listing: { listedOn: '2026-01-30', listPrice: 559_000, showings: 12, priceDrops: 0 },
    sale: { soldOn: '2026-04-09', salePrice: 556_000 },
  },
];

export const ASSETS: Asset[] = [
  ...pipelineSeeds,
  ...underContractSeeds,
  ...preconSeeds,
  ...constructionSeeds,
  ...forSaleSeeds,
  ...soldSeeds,
].map(buildAsset);

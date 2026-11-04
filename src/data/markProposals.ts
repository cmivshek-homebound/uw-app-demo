import type { Asset, Market, MarkComp, MarkDriver, MarkProposal, MarkProposalStatus } from '../types';
import { seasonalChangePct } from './seasonality';

// ── April 2026 month-end mark proposals ────────────────────────
// Every owned, unsold asset gets a proposed April mark: March's mark plus
// driver adjustments. Seeds hold what the AI found (comps, Homebound sales,
// listing read). Seasonality, totals, analyst and the approval gate derive.
// All comps and narratives are fictional demo data.

export const PROPOSAL_MONTH = '2026-04';

/** Mark moves larger than this (either direction) need sign-off. */
export const APPROVAL_THRESHOLD = 10_000;

const ANALYST_BY_MARKET: Record<Market, string> = {
  DFW: 'Luis Ortega',
  Houston: 'Priya Shah',
  Tampa: 'Maya Chen',
  'St. Pete': 'Maya Chen',
  LA: 'Elena Ruiz',
};

interface CompSeed {
  address: string;
  salePrice: number;
  sqft: number;
  soldOn: string;
  distanceMi: number;
}

interface ProposalSeed {
  newComps: { amount: number; explanation: string; comps: CompSeed[] };
  /** Our sold assets nearby; the explanation is built from their sale. */
  homeboundSales?: { amount: number; assetIds: string[]; note: string };
  /** For-sale assets only. */
  listingDemand?: { amount: number; explanation: string };
  /** Below the approval threshold; larger moves are needs_approval unless approved. */
  status?: Exclude<MarkProposalStatus, 'needs_approval'>;
  approvedBy?: string;
}

const SEEDS: Record<string, ProposalSeed> = {
  // ── Pre-con ──
  'BOOL-013': {
    newComps: {
      amount: 1_000,
      explanation: 'One Lakewood new build closed slightly above March’s $/sqft basis.',
      comps: [{ address: '6235 Llano Ave', salePrice: 1_085_000, sqft: 4_180, soldOn: '2026-04-02', distanceMi: 0.3 }],
    },
    homeboundSales: { amount: 1_500, assetIds: ['BOOL-045'], note: 'above its ESP in the same Lakewood pocket.' },
    status: 'analyst_reviewed',
  },
  'BOOL-014': {
    newComps: {
      amount: -1_500,
      explanation: 'Two Upper Kirby sales closed a touch under March’s basis.',
      comps: [
        { address: '2410 Albans Rd', salePrice: 955_000, sqft: 4_120, soldOn: '2026-03-20', distanceMi: 0.4 },
        { address: '3015 Bartlett St', salePrice: 968_000, sqft: 4_240, soldOn: '2026-04-08', distanceMi: 0.2 },
      ],
    },
    homeboundSales: { amount: 500, assetIds: ['BOOL-036'], note: 'above ESP; supports inner-loop pricing.' },
  },
  'BOOL-015': {
    newComps: {
      amount: -2_000,
      explanation: 'A Bay to Bay frontage sale closed below interior-street comps.',
      comps: [{ address: '3315 W Bay to Bay Blvd', salePrice: 1_240_000, sqft: 3_820, soldOn: '2026-03-27', distanceMi: 0.2 }],
    },
    homeboundSales: { amount: -1_500, assetIds: ['BOOL-037'], note: 'below its ESP after a price drop.' },
  },
  'BOOL-016': {
    newComps: {
      amount: 500,
      explanation: 'One Kenwood-area new build closed in line with March.',
      comps: [{ address: '4520 2nd Ave N', salePrice: 862_000, sqft: 4_310, soldOn: '2026-04-06', distanceMi: 0.3 }],
    },
    homeboundSales: { amount: 500, assetIds: ['BOOL-038'], note: 'above ESP; St. Pete demand is holding.' },
  },
  'BOOL-017': {
    newComps: {
      amount: -3_000,
      explanation: 'Two Palms resales closed below list after 60+ days.',
      comps: [
        { address: '3720 Motor Ave', salePrice: 2_710_000, sqft: 3_690, soldOn: '2026-03-14', distanceMi: 0.5 },
        { address: '3900 Jasmine Ave', salePrice: 2_780_000, sqft: 3_810, soldOn: '2026-04-03', distanceMi: 0.4 },
      ],
    },
    homeboundSales: {
      amount: -11_000,
      assetIds: ['BOOL-039'],
      note: 'below ESP after 103 days; same Kendall plan four blocks away, so the AI marks this lot down to match.',
    },
  },
  'BOOL-041': {
    newComps: {
      amount: -2_500,
      explanation: 'Two West Dallas sales closed under March’s basis as new supply lands.',
      comps: [
        { address: '1310 N Clinton Ave', salePrice: 905_000, sqft: 4_210, soldOn: '2026-03-25', distanceMi: 0.1 },
        { address: '1120 N Edgefield Ave', salePrice: 918_000, sqft: 4_290, soldOn: '2026-04-10', distanceMi: 0.3 },
      ],
    },
    status: 'analyst_reviewed',
  },
  // ── Construction ──
  'BOOL-018': {
    newComps: {
      amount: 2_000,
      explanation: 'Two M Streets new builds closed above March’s basis.',
      comps: [
        { address: '5622 Vickery Blvd', salePrice: 1_110_000, sqft: 3_720, soldOn: '2026-03-18', distanceMi: 0.1 },
        { address: '5711 Llano Ave', salePrice: 1_125_000, sqft: 3_760, soldOn: '2026-04-09', distanceMi: 0.4 },
      ],
    },
    homeboundSales: { amount: 1_000, assetIds: ['BOOL-045'], note: 'above ESP; East Dallas pricing is firm.' },
  },
  'BOOL-019': {
    newComps: {
      amount: -1_000,
      explanation: 'One TCU-area sale closed slightly under March.',
      comps: [{ address: '3517 Wabash Ave', salePrice: 921_000, sqft: 4_260, soldOn: '2026-03-30', distanceMi: 0.1 }],
    },
    status: 'approved',
    approvedBy: 'Luis Ortega',
  },
  'BOOL-020': {
    newComps: {
      amount: 1_000,
      explanation: 'One Lakewood sale closed in line with March’s basis.',
      comps: [{ address: '7123 Lakewood Blvd', salePrice: 1_150_000, sqft: 4_790, soldOn: '2026-03-21', distanceMi: 0.2 }],
    },
    homeboundSales: {
      amount: 8_000,
      assetIds: ['BOOL-045'],
      note: 'above ESP three blocks away, the strongest Lakewood new-build sale this spring.',
    },
    status: 'approved',
    approvedBy: 'J. Park',
  },
  'BOOL-021': {
    newComps: {
      amount: 1_000,
      explanation: 'One Montrose new build closed just above March.',
      comps: [{ address: '1806 Kipling St', salePrice: 985_000, sqft: 4_230, soldOn: '2026-04-04', distanceMi: 0.1 }],
    },
    homeboundSales: { amount: 500, assetIds: ['BOOL-036'], note: 'above ESP; supports inner-loop pricing.' },
    status: 'analyst_reviewed',
  },
  'BOOL-022': {
    newComps: {
      amount: 8_500,
      explanation: 'Three West U new builds closed $15–40K above March’s basis.',
      comps: [
        { address: '6415 Edloe St', salePrice: 1_128_000, sqft: 3_740, soldOn: '2026-03-26', distanceMi: 0.1 },
        { address: '3810 Rice Blvd', salePrice: 1_115_000, sqft: 3_700, soldOn: '2026-04-07', distanceMi: 0.4 },
        { address: '6522 Buffalo Speedway', salePrice: 1_104_000, sqft: 3_690, soldOn: '2026-04-14', distanceMi: 0.5 },
      ],
    },
  },
  'BOOL-023': {
    newComps: {
      amount: -1_500,
      explanation: 'One Oak Forest sale closed under March on a busier street.',
      comps: [{ address: '1150 W 43rd St', salePrice: 735_000, sqft: 4_340, soldOn: '2026-03-19', distanceMi: 0.6 }],
    },
  },
  'BOOL-024': {
    newComps: {
      amount: 2_000,
      explanation: 'Two Sunset Park new builds closed above March’s basis.',
      comps: [
        { address: '4310 W San Miguel St', salePrice: 1_215_000, sqft: 4_260, soldOn: '2026-03-28', distanceMi: 0.1 },
        { address: '4115 W Bay Vista Ave', salePrice: 1_198_000, sqft: 4_240, soldOn: '2026-04-11', distanceMi: 0.6 },
      ],
    },
    homeboundSales: { amount: -1_000, assetIds: ['BOOL-037'], note: 'below ESP after a price drop.' },
    status: 'analyst_reviewed',
  },
  'BOOL-025': {
    newComps: {
      amount: -4_500,
      explanation: 'Two Seminole Heights sales closed well under list.',
      comps: [
        { address: '1006 E Frierson Ave', salePrice: 782_000, sqft: 4_740, soldOn: '2026-03-12', distanceMi: 0.1 },
        { address: '811 E Hanna Ave', salePrice: 776_000, sqft: 4_690, soldOn: '2026-04-01', distanceMi: 0.3 },
      ],
    },
  },
  'BOOL-026': {
    newComps: {
      amount: 1_500,
      explanation: 'One Disston Heights new build closed above March.',
      comps: [{ address: '2630 Dartmouth Ave N', salePrice: 889_000, sqft: 4_180, soldOn: '2026-04-05', distanceMi: 0.1 }],
    },
    homeboundSales: { amount: 1_500, assetIds: ['BOOL-038'], note: 'above ESP in February.' },
  },
  'BOOL-027': {
    newComps: {
      amount: 2_000,
      explanation: 'One Brentwood-adjacent new build closed above March’s basis.',
      comps: [{ address: '1340 S Barrington Ave', salePrice: 3_710_000, sqft: 3_760, soldOn: '2026-03-31', distanceMi: 0.6 }],
    },
    homeboundSales: { amount: -2_500, assetIds: ['BOOL-039'], note: 'below ESP after 103 days on market.' },
    status: 'analyst_reviewed',
  },
  'BOOL-028': {
    newComps: {
      amount: 4_500,
      explanation: 'Two Atwater Village new builds closed above list in multiple offers.',
      comps: [
        { address: '3215 Glenhurst Ave', salePrice: 2_540_000, sqft: 3_790, soldOn: '2026-03-17', distanceMi: 0.4 },
        { address: '3900 Edenhurst Ave', salePrice: 2_560_000, sqft: 3_760, soldOn: '2026-04-12', distanceMi: 0.5 },
      ],
    },
  },
  'BOOL-042': {
    newComps: {
      amount: -500,
      explanation: 'One Spring Branch sale closed in line with March.',
      comps: [{ address: '8210 Westview Dr', salePrice: 742_000, sqft: 4_380, soldOn: '2026-04-03', distanceMi: 0.1 }],
    },
    status: 'approved',
    approvedBy: 'Priya Shah',
  },
  // ── For sale ──
  'BOOL-029': {
    newComps: {
      amount: 500,
      explanation: 'One Highland Park-area sale closed in line with March.',
      comps: [{ address: '4520 Livingston Ave', salePrice: 1_015_000, sqft: 3_700, soldOn: '2026-04-08', distanceMi: 0.3 }],
    },
    listingDemand: { amount: -6_000, explanation: '71 days on market and 18 showings with no offers; no price drop yet.' },
    status: 'analyst_reviewed',
  },
  'BOOL-030': {
    newComps: {
      amount: 1_000,
      explanation: 'One Rice Village new build closed just above March.',
      comps: [{ address: '3610 Tangley St', salePrice: 1_030_000, sqft: 4_300, soldOn: '2026-04-02', distanceMi: 0.2 }],
    },
    listingDemand: { amount: -500, explanation: '36 days and 11 showings, about the market’s normal pace.' },
  },
  'BOOL-031': {
    newComps: {
      amount: -2_000,
      explanation: 'One Palma Ceia sale closed under list after a price cut.',
      comps: [{ address: '3105 W Granada St', salePrice: 1_055_000, sqft: 4_760, soldOn: '2026-03-29', distanceMi: 0.2 }],
    },
    listingDemand: {
      amount: -19_000,
      explanation: '92 days on market and two price drops; 24 showings but no offers, so the mark follows a third cut.',
    },
  },
  'BOOL-032': {
    newComps: {
      amount: 500,
      explanation: 'One Old Northeast sale closed in line with March.',
      comps: [{ address: '1210 Arlington Ave N', salePrice: 905_000, sqft: 4_380, soldOn: '2026-04-09', distanceMi: 0.1 }],
    },
    homeboundSales: { amount: 1_000, assetIds: ['BOOL-038'], note: 'above ESP half a mile away.' },
    listingDemand: { amount: 1_500, explanation: '7 showings in 22 days and a second showing booked; pace ahead of market.' },
    status: 'analyst_reviewed',
  },
  'BOOL-033': {
    newComps: {
      amount: -1_500,
      explanation: 'One Rancho Park sale closed under list.',
      comps: [{ address: '2530 Midvale Ave', salePrice: 3_090_000, sqft: 3_770, soldOn: '2026-04-01', distanceMi: 0.2 }],
    },
    listingDemand: { amount: -4_000, explanation: '57 days and 15 showings since the March price drop; interest is soft.' },
  },
  'BOOL-034': {
    newComps: {
      amount: -2_000,
      explanation: 'One Ocean Park sale closed under its reduced list.',
      comps: [{ address: '726 Marine St', salePrice: 3_840_000, sqft: 3_720, soldOn: '2026-03-24', distanceMi: 0.3 }],
    },
    listingDemand: { amount: -8_500, explanation: '99 days on market and 21 showings since the March drop, still no offers.' },
    status: 'analyst_reviewed',
  },
  'BOOL-043': {
    newComps: {
      amount: -1_000,
      explanation: 'One Seminole Heights sale closed slightly under March.',
      comps: [{ address: '6210 N Central Ave', salePrice: 815_000, sqft: 4_770, soldOn: '2026-04-04', distanceMi: 0.1 }],
    },
    listingDemand: { amount: 500, explanation: '4 showings in the first 15 days, normal for a new listing.' },
  },
  'BOOL-044': {
    newComps: {
      amount: 1_000,
      explanation: 'One Altadena new build closed in line with March.',
      comps: [{ address: '1920 N Marengo Ave', salePrice: 1_985_000, sqft: 3_780, soldOn: '2026-03-26', distanceMi: 0.1 }],
    },
    listingDemand: { amount: 1_000, explanation: '9 showings in 29 days with one second showing; steady interest.' },
    status: 'approved',
    approvedBy: 'Elena Ruiz',
  },
};

// ── Builder ────────────────────────────────────────────────────
function iso(date: string): string {
  return `${date}T00:00:00Z`;
}

function usd(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

function shortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** The April proposal for an owned, unsold asset; undefined for everything else. */
export function buildMarkProposal(asset: Asset, assets: Asset[]): MarkProposal | undefined {
  const prior = asset.marks?.at(-1);
  if (!asset.owned || asset.sale || !prior) return undefined;
  const seed = SEEDS[asset.id];
  if (!seed) throw new Error(`No ${PROPOSAL_MONTH} mark proposal seed for ${asset.id}`);

  const seasonalPct = seasonalChangePct(asset.market, PROPOSAL_MONTH);
  const drivers: MarkDriver[] = [
    {
      kind: 'newComps',
      amount: seed.newComps.amount,
      explanation: seed.newComps.explanation,
      comps: seed.newComps.comps.map((c): MarkComp => ({ ...c, soldOn: iso(c.soldOn) })),
    },
  ];

  if (seed.homeboundSales) {
    const sold = seed.homeboundSales.assetIds.map((id) => {
      const a = assets.find((x) => x.id === id);
      if (!a?.sale) throw new Error(`Mark proposal for ${asset.id} references ${id}, which isn’t a sold asset`);
      return a;
    });
    const sales = sold.map((a) => `${a.id} (${a.address}) sold ${shortDate(a.sale!.soldOn)} for ${usd(a.sale!.salePrice)}`);
    drivers.push({
      kind: 'homeboundSales',
      amount: seed.homeboundSales.amount,
      explanation: `${sales.join('; ')}, ${seed.homeboundSales.note}`,
      assetIds: seed.homeboundSales.assetIds,
    });
  }

  drivers.push({
    kind: 'seasonality',
    amount: Math.round((prior.value * seasonalPct) / 100 / 500) * 500,
    explanation: `${asset.market} seasonal index ${seasonalPct >= 0 ? '+' : ''}${seasonalPct.toFixed(2)}% from March to April.`,
  });

  if (seed.listingDemand) {
    if (asset.stage !== 'for_sale') throw new Error(`Listing demand driver on ${asset.id}, which isn’t listed`);
    drivers.push({ kind: 'listingDemand', ...seed.listingDemand });
  }

  const change = drivers.reduce((sum, d) => sum + d.amount, 0);
  const needsApproval = Math.abs(change) > APPROVAL_THRESHOLD && !seed.approvedBy;
  const status: MarkProposalStatus = needsApproval ? 'needs_approval' : seed.status ?? 'ai_proposed';

  return {
    month: PROPOSAL_MONTH,
    priorMonth: prior.month,
    priorValue: prior.value,
    drivers,
    change,
    proposedValue: prior.value + change,
    method: asset.listing ? 'Post-listing' : 'Asset Valuation',
    status,
    analyst: ANALYST_BY_MARKET[asset.market],
    ...(status === 'approved' && seed.approvedBy && { approvedBy: seed.approvedBy }),
  };
}

import type {
  AssetStage,
  BudgetCategory,
  BudgetLine,
  ChangeOrder,
  ConstructionDraw,
  ConstructionSchedule,
  Market,
  MilestoneKind,
  ScheduleMilestone,
} from '../types';
import { CONTINGENCY_PCT, DEFAULT_BUILD_DAYS, DEFAULT_PRECON_DAYS, LISTING_PREP_DAYS } from './assumptions';
import { DEMO_TODAY } from './dates';
import { seededRandom } from './random';

// ── Construction data (Blueprint) ──────────────────────────────
// Budget lines, schedule, change orders and loan draws for every owned asset.
// Seeds hold only what makes an asset's build distinct (a change order, a
// slip, a line that ran over). Everything else derives from the budget,
// progress and dates, and is checked so the numbers tie out:
//   Σ line budgets = budget, Σ line spent = costToDate,
//   spent ≤ committed ≤ estimate at completion, Σ draws ≤ costToDate,
//   sold assets' estimate at completion = realized build.
// Most builds land within 2% of budget and on schedule. The exceptions:
//   BOOL-022  +6.6%  change order: finish upgrade to match West U comps
//   BOOL-021  +5.6%  framing lumber re-priced at delivery
//   BOOL-028  5 wks late  LADBS permit held in plan check
//   BOOL-026  4 wks late  October tropical storms stopped framing
//   BOOL-042  −3.4%  foundation rebid came in under
//   BOOL-027  +1.8%  sycamore root-zone work (over, but inside the 2% tolerance)

// Pre-con length, build duration, listing prep and contingency come from assumptions.ts.
export { DEFAULT_PRECON_DAYS };
/** Permits issue this long before the planned start. */
const PERMIT_LEAD_DAYS = 10;
/** Derived durations outside this band mean progress and dates disagree. */
const BUILD_DAYS_RANGE = [300, 470] as const;
/** Builds without a seeded variance land within this % of budget. */
const ON_BUDGET_PCT = 1.5;

/** Change-order approvers by market (construction managers). */
const CM_BY_MARKET: Record<Market, string> = {
  DFW: 'Marcus Lee',
  Houston: 'Dana Whitfield',
  Tampa: 'Chris Vega',
  'St. Pete': 'Chris Vega',
  LA: 'Nora Kim',
};

/**
 * Budget share, the progress window (fraction complete) over which the line
 * is spent, and when it's bought out. Contingency takes the rounding remainder.
 */
const LINES: { category: BudgetCategory; share: number; spend: [number, number]; buyoutAt: number }[] = [
  { category: 'site_work', share: 0.07, spend: [0, 0.1], buyoutAt: 0 },
  { category: 'foundation', share: 0.12, spend: [0.03, 0.14], buyoutAt: 0 },
  { category: 'framing', share: 0.18, spend: [0.1, 0.33], buyoutAt: 0.05 },
  { category: 'roofing', share: 0.05, spend: [0.3, 0.45], buyoutAt: 0.2 },
  { category: 'mep', share: 0.2, spend: [0.25, 0.8], buyoutAt: 0.2 },
  { category: 'exterior', share: 0.1, spend: [0.35, 0.85], buyoutAt: 0.35 },
  { category: 'interior_finishes', share: 0.25, spend: [0.55, 1], buyoutAt: 0.5 },
  { category: 'contingency', share: CONTINGENCY_PCT / 100, spend: [1, 1], buyoutAt: 1 },
];

/** Build milestones: when they fall (fraction of duration) and how much cost is in place by then. */
const MILESTONES: { kind: Exclude<MilestoneKind, 'permit_issued'>; t: number; cost: number }[] = [
  { kind: 'foundation', t: 0.12, cost: 0.1 },
  { kind: 'framing', t: 0.3, cost: 0.27 },
  { kind: 'dry_in', t: 0.42, cost: 0.4 },
  { kind: 'mep_rough', t: 0.55, cost: 0.53 },
  { kind: 'drywall', t: 0.68, cost: 0.66 },
  { kind: 'finishes', t: 0.88, cost: 0.9 },
  { kind: 'co', t: 1, cost: 1 },
];
const MILESTONE_ORDER: MilestoneKind[] = ['permit_issued', ...MILESTONES.map((m) => m.kind)];

// ── Seeds ──────────────────────────────────────────────────────
interface BuildSeed {
  /** Planned close-to-start, when it differs from the default. */
  preconDays?: number;
  /** Estimate at completion vs. budget, %. Sold assets take theirs from the realized build. */
  variancePct?: number;
  /** Line overruns (+) or savings (−) outside change orders. */
  lines?: Partial<Record<BudgetCategory, { amount: number; note: string }>>;
  /** Approver defaults to the market's construction manager. */
  changeOrders?: (Omit<ChangeOrder, 'date' | 'approvedBy'> & { date: string; approvedBy?: string })[];
  /** Milestones from `from` onward land `days` late; a permit slip also delays the start. */
  slip?: { from: MilestoneKind; days: number; note: string };
}

const SEEDS: Record<string, BuildSeed> = {
  // ── Pre-con: planned starts reflect each lot's permitting path ──
  'BOOL-014': { preconDays: 75 },
  'BOOL-015': { preconDays: 105 }, // driveway redesigned around the grand live oak
  'BOOL-016': { preconDays: 120 }, // flood-zone elevation certificate and raised slab design
  'BOOL-017': { preconDays: 75 },  // LADWP power-line relocation before start
  'BOOL-041': { preconDays: 140 }, // pier-and-beam engineering

  // ── Construction ──
  'BOOL-018': { preconDays: 100 }, // closed into the holiday plan-review backlog
  'BOOL-019': {
    preconDays: 60,
    changeOrders: [
      { date: '2026-02-03', category: 'framing', amount: 3_800, reason: 'Code requirement',
        description: 'Steel flitch beam at the kitchen opening per engineer’s framing review' },
    ],
  },
  'BOOL-020': {
    changeOrders: [
      { date: '2025-09-22', category: 'exterior', amount: 6_200, reason: 'Design change',
        description: 'Brick blend swapped to the conservation-district approved palette' },
    ],
  },
  'BOOL-021': {
    // Over budget: framing lumber.
    variancePct: 5.6,
    lines: {
      framing: { amount: 27_000, note: 'Lumber package re-priced at delivery after the fall lumber increase; the quote had lapsed before buyout.' },
    },
  },
  'BOOL-022': {
    // Over budget: change order. Matches the April mark, where West U new builds closed $15–40K above basis.
    variancePct: 6.6,
    changeOrders: [
      { date: '2025-11-20', category: 'mep', amount: 4_600, reason: 'Design change',
        description: 'EV charger circuit and whole-home surge protection' },
      { date: '2026-02-19', category: 'interior_finishes', amount: 29_800, reason: 'Design change', approvedBy: 'J. Park',
        description: 'Upgraded kitchen and primary-bath finish package to match West U new builds closing above basis' },
    ],
  },
  'BOOL-023': { preconDays: 90 }, // pier-and-beam foundation design (see underwrite review)
  'BOOL-024': {
    preconDays: 66, // seller's 30-day rent-back pushed the start 3 weeks
    changeOrders: [
      { date: '2026-01-14', category: 'exterior', amount: 2_900, reason: 'Code requirement',
        description: 'Impact-rated garage door per wind-zone plan review' },
    ],
  },
  'BOOL-025': {
    changeOrders: [
      { date: '2025-08-12', category: 'framing', amount: 3_400, reason: 'Code requirement',
        description: 'Upgraded roof-to-wall hurricane straps per framing inspection' },
    ],
  },
  'BOOL-026': {
    // Late: weather.
    variancePct: 1.3,
    lines: { framing: { amount: 4_200, note: 'Replaced water-damaged roof sheathing after the October storms.' } },
    slip: { from: 'framing', days: 28, note: 'Back-to-back October tropical systems stopped framing for about four weeks.' },
  },
  'BOOL-027': {
    // Demo story: slightly over budget, still inside tolerance.
    variancePct: 1.8,
    lines: { foundation: { amount: 9_800, note: 'Hand-dug footings inside the sycamore root zones per the arborist.' } },
    changeOrders: [
      { date: '2025-07-08', category: 'foundation', amount: 5_200, reason: 'Unforeseen condition',
        description: 'Arborist-directed root bridge where the footing crossed sycamore roots' },
    ],
  },
  'BOOL-028': {
    // Late: permit.
    slip: { from: 'permit_issued', days: 35, note: 'LADBS plan check held the permit five weeks on a second round of structural corrections.' },
  },
  'BOOL-042': {
    // Under budget.
    variancePct: -3.4,
    lines: { foundation: { amount: -9_500, note: 'Slab rebid came in under the original bid.' } },
  },

  // ── For sale ──
  'BOOL-030': {
    changeOrders: [
      { date: '2025-03-04', category: 'site_work', amount: 3_100, reason: 'Unforeseen condition',
        description: 'Rear-yard drainage swale after the grading survey' },
    ],
  },

  // ── Sold: overruns tie to the realized build ──
  'BOOL-036': {
    lines: { framing: { amount: -16_000, note: 'Procurement locked the framing package before the lumber increase.' } },
  },
  'BOOL-037': {
    changeOrders: [
      { date: '2024-10-08', category: 'foundation', amount: 42_500, reason: 'Unforeseen condition', approvedBy: 'J. Park',
        description: 'Auger-cast piles through the organic layer found at 6 ft' },
    ],
    slip: { from: 'foundation', days: 21, note: 'Pile design and install added three weeks to the foundation.' },
  },
  'BOOL-039': {
    changeOrders: [
      { date: '2024-10-21', category: 'site_work', amount: 53_500, reason: 'Unforeseen condition', approvedBy: 'J. Park',
        description: 'Rear retaining wall after final engineering on the grade change' },
    ],
    slip: { from: 'foundation', days: 14, note: 'Retaining wall had to go in before the rear footings.' },
  },
};

// ── Helpers ────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
const TODAY = DEMO_TODAY;

function iso(date: string): string {
  return date.length === 10 ? `${date}T00:00:00Z` : date;
}

function addDays(date: string, days: number): string {
  return new Date(new Date(iso(date)).getTime() + days * DAY_MS).toISOString().replace('.000Z', 'Z');
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(iso(to)).getTime() - new Date(iso(from)).getTime()) / DAY_MS);
}

const minDate = (a: string, b: string) => (a < b ? a : b);
const round100 = (n: number) => Math.round(n / 100) * 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** Fraction of the build duration elapsed when `pct` of cost is in place. */
function timeAtProgress(pct: number): number {
  let prev = { t: 0, cost: 0 };
  for (const m of MILESTONES) {
    if (pct <= m.cost) return prev.t + ((pct - prev.cost) / (m.cost - prev.cost)) * (m.t - prev.t);
    prev = m;
  }
  return 1;
}

/** The 10th of each month, from the first after `from`. */
function drawDates(from: string, through: string): string[] {
  const d = new Date(iso(from));
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  const dates: string[] = [];
  for (;;) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
    const date = `${y}-${String(m + 1).padStart(2, '0')}-10T00:00:00Z`;
    if (date > through) return dates;
    dates.push(date);
  }
}

/** Nudge values toward `target`: proportionally across `pool`, then in order. Each value stays within [0, cap]. */
function rebalance(values: number[], caps: number[], pool: number[], target: number) {
  let r = target - sum(values);
  const room = (i: number) => (r > 0 ? caps[i] - values[i] : values[i]);
  const total = sum(pool.map(room));
  if (total > 0 && r !== 0) {
    const rooms = pool.map(room);
    pool.forEach((i, k) => {
      const d = Math.trunc((r * rooms[k]) / total);
      values[i] += Math.sign(d) * Math.min(Math.abs(d), rooms[k]);
    });
  }
  r = target - sum(values);
  const order = values.map((_, i) => i);
  if (r < 0) order.reverse();
  for (const i of order) {
    if (r === 0) break;
    const d = r > 0 ? Math.min(r, caps[i] - values[i]) : Math.max(r, -values[i]);
    values[i] += d;
    r -= d;
  }
  return r;
}

// ── Builder ────────────────────────────────────────────────────
export interface ConstructionInput {
  id: string;
  market: Market;
  stage: AssetStage;
  closedOn: string;     // ISO
  budget: number;
  pct: number;          // 0–1
  finalCost?: number;   // sold: realized build
  listedOn?: string;    // ISO; for_sale and sold
}

export interface ConstructionData {
  startedOn?: string;
  costToDate: number;
  budgetLines: BudgetLine[];
  schedule: ConstructionSchedule;
  changeOrders: ChangeOrder[];
  draws: ConstructionDraw[];
}

export function buildConstruction(input: ConstructionInput): ConstructionData {
  const { id, market, stage, closedOn, budget } = input;
  const fail = (msg: string): never => {
    throw new Error(`Construction for ${id}: ${msg}`);
  };
  const seed = SEEDS[id] ?? {};
  const rand = seededRandom(`${id}:construction`);
  const done = stage === 'for_sale' || stage === 'sold';
  const started = done || stage === 'construction';
  const pct = done ? 1 : input.pct;

  // ── Schedule ──
  const slip = seed.slip;
  if (slip && !started) fail('pre-con assets can’t carry a slip');
  const startDelay = slip?.from === 'permit_issued' ? slip.days : 0;
  const buildSlip = slip && !startDelay ? slip.days : 0;
  const plannedStart = addDays(closedOn, seed.preconDays ?? DEFAULT_PRECON_DAYS);
  const actualStart = addDays(plannedStart, startDelay);
  if (started && actualStart > TODAY) fail('started after today');
  if (!started && plannedStart <= TODAY) fail('planned start has passed but the asset is still in pre-con');

  const coActual = done ? addDays(input.listedOn ?? fail('missing listing date'), -LISTING_PREP_DAYS) : undefined;
  // Duration is backed out of progress so milestones and percent complete agree.
  const duration = coActual
    ? daysBetween(actualStart, coActual) - buildSlip
    : started
      ? Math.round((daysBetween(actualStart, TODAY) - buildSlip) / timeAtProgress(pct))
      : DEFAULT_BUILD_DAYS[market];
  if (duration < BUILD_DAYS_RANGE[0] || duration > BUILD_DAYS_RANGE[1]) fail(`${duration}-day build is out of range`);
  const plannedCompletion = addDays(plannedStart, duration);

  const slipAt = (kind: MilestoneKind) =>
    slip && MILESTONE_ORDER.indexOf(kind) >= MILESTONE_ORDER.indexOf(slip.from) ? slip.days : 0;
  const jitter = () => Math.round(rand() * 6) - 3;
  const latest = coActual ?? addDays(TODAY, -1);

  const permitPlanned = addDays(plannedStart, -PERMIT_LEAD_DAYS);
  const milestones: ScheduleMilestone[] = [
    {
      kind: 'permit_issued',
      planned: permitPlanned,
      ...((started || permitPlanned <= TODAY) && { actual: minDate(addDays(permitPlanned, slipAt('permit_issued') + jitter()), latest) }),
    },
    ...MILESTONES.map((m): ScheduleMilestone => {
      const planned = addDays(plannedStart, Math.round(m.t * duration));
      const reached = done || (started && pct >= m.cost);
      let actual: string | undefined;
      if (reached) {
        actual = m.kind === 'co' && coActual ? coActual : minDate(addDays(planned, slipAt(m.kind) + jitter()), latest);
      }
      return { kind: m.kind, planned, ...(actual ? { actual } : {}) };
    }),
  ];
  if (slip) milestones.find((m) => m.kind === slip.from)!.note = slip.note;
  milestones.forEach((m, i) => {
    if (i && m.actual && milestones[i - 1].actual! >= m.actual) fail(`${m.kind} reached before ${milestones[i - 1].kind}`);
  });

  const schedule: ConstructionSchedule = {
    plannedStart,
    plannedCompletion,
    forecastCompletion: coActual ?? addDays(plannedCompletion, slip?.days ?? 0),
    milestones,
  };

  // ── Change orders ──
  const changeOrders: ChangeOrder[] = (seed.changeOrders ?? []).map((co) => {
    const date = iso(co.date);
    if (date < closedOn || date > latest) fail(`change order dated ${co.date} falls outside the build`);
    if (co.category === 'contingency') fail('change orders can’t post to contingency');
    return { ...co, date, approvedBy: co.approvedBy ?? CM_BY_MARKET[market] };
  });

  // ── Budget lines ──
  const progress = LINES.map(({ category, spend: [a, b] }) =>
    category === 'contingency' || !started ? 0 : done ? 1 : clamp01((pct - a) / (b - a)),
  );
  const budgets = LINES.map((l) => (l.category === 'contingency' ? 0 : round100(budget * l.share)));
  const ci = LINES.length - 1;
  budgets[ci] = budget - sum(budgets);

  const explicit = LINES.map(({ category }) =>
    sum(changeOrders.filter((co) => co.category === category).map((co) => co.amount)) + (seed.lines?.[category]?.amount ?? 0),
  );

  const targetVariance = input.finalCost !== undefined
    ? input.finalCost - budget
    : round100((budget * (seed.variancePct ?? (stage === 'construction' ? (rand() * 2 - 1) * ON_BUDGET_PCT : 0))) / 100);
  const contingencyEac = done ? 0 : started ? round100(budgets[ci] * (1 - pct)) : budgets[ci];

  // Overruns elsewhere draw down contingency; spread what the seeds don't explain across work in place.
  const remainder = targetVariance + budgets[ci] - contingencyEac - sum(explicit);
  const weights = LINES.map((_, i) => (i === ci || explicit[i] !== 0 ? 0 : budgets[i] * progress[i]));
  const variances = [...explicit];
  if (remainder !== 0) {
    const totalWeight = sum(weights);
    if (!totalWeight) variances[0] += remainder;
    else {
      const spread = weights.map((w) => round100((remainder * w) / totalWeight));
      const heaviest = weights.indexOf(Math.max(...weights));
      spread[heaviest] += remainder - sum(spread);
      spread.forEach((s, i) => (variances[i] += s));
    }
  }
  const eac = LINES.map((_, i) => (i === ci ? contingencyEac : budgets[i] + variances[i]));
  if (eac.some((e) => e < 0)) fail('negative estimate at completion');
  if (sum(eac) - budget !== targetVariance) fail('estimate at completion doesn’t tie to the target variance');

  // Spent follows each line's progress window, nudged to land exactly on pct of the work estimate.
  const workEac = sum(eac) - contingencyEac;
  const costToDate = Math.round(workEac * pct);
  const spent = LINES.map((_, i) => Math.round(eac[i] * progress[i]));
  if (!started) spent[0] = costToDate; // pre-con spend is site prep, surveys and demo
  else {
    const caps = eac.map((e, i) => (i === ci ? 0 : e));
    const inProgress = progress.flatMap((p, i) => (p > 0 && p < 1 ? [i] : []));
    if (rebalance(spent, caps, inProgress, costToDate) !== 0) fail('couldn’t place spend to date');
  }
  if (spent[0] > eac[0]) fail('pre-con spend exceeds site work');

  const daysToStart = daysBetween(TODAY, plannedStart);
  const budgetLines: BudgetLine[] = LINES.map((l, i) => {
    const committed = i === ci
      ? 0
      : done || (started && pct >= l.buyoutAt) || (!started && (i === 0 || (l.category === 'foundation' && daysToStart <= 30)))
        ? eac[i]
        : spent[i];
    const note = seed.lines?.[l.category]?.note;
    return {
      category: l.category,
      budget: budgets[i],
      committed,
      spent: spent[i],
      estimateAtCompletion: eac[i],
      costToComplete: eac[i] - spent[i],
      ...(note ? { note } : {}),
    };
  });
  if (sum(budgetLines.map((l) => l.spent)) !== costToDate) fail('line spend doesn’t sum to cost to date');
  budgetLines.forEach((l) => {
    if (l.spent > l.committed || l.committed > l.estimateAtCompletion) fail(`${l.category} commitments out of order`);
  });

  // ── Draws: monthly on the 10th, for spend through the prior month-end ──
  const end = coActual ?? TODAY;
  const preconSpend = started ? Math.min(costToDate, Math.round(workEac * 0.02)) : costToDate;
  const spendBy = (date: string): number => {
    if (date <= closedOn) return 0;
    if (date >= end) return costToDate;
    if (!started) return (preconSpend * daysBetween(closedOn, date)) / daysBetween(closedOn, end);
    if (date < actualStart) return (preconSpend * daysBetween(closedOn, date)) / daysBetween(closedOn, actualStart);
    return preconSpend + ((costToDate - preconSpend) * daysBetween(actualStart, date)) / daysBetween(actualStart, end);
  };
  const currentMonth = TODAY.slice(0, 7);
  const draws: ConstructionDraw[] = [];
  let drawn = 0;
  for (const date of drawDates(closedOn, TODAY)) {
    const cutoff = `${date.slice(0, 8)}01T00:00:00Z`;
    const amount = Math.round(spendBy(cutoff)) - drawn;
    if (amount > 0) {
      draws.push({ date, amount, status: date.slice(0, 7) === currentMonth ? 'pending' : 'funded' });
      drawn += amount;
    }
    if (coActual && cutoff >= coActual) break;
  }
  if (drawn > costToDate) fail('draws exceed cost to date');

  return {
    ...(started && { startedOn: actualStart }),
    costToDate,
    budgetLines,
    schedule,
    changeOrders,
    draws,
  };
}

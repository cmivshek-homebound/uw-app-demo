import { createContext, useContext } from 'react';
import type { Asset, BudgetCategory, Market } from '../types';
import { ASSETS } from './assets';
import { DEMO_TODAY, hoursAgo } from './dates';
import { ANALYST_BY_MARKET } from './markProposals';
import { MARKS_MANAGER } from './markReview';
import { DFW_PLANS, defaultSpecIdx } from './plans';
import type { SpecLevelName } from './plans';
import { MARKETS, latestMark, marketPlanNames, projectedTotalCost } from './selectors';

// ── Blueprint sync ─────────────────────────────────────────────
// Blueprint (construction system) holds the plan cost book and each owned
// lot's working build budget. Underwriting keeps its own budget version until
// someone reviews Blueprint's and promotes it. This file seeds what makes each
// lot's sync distinct; amounts derive from the asset's budget lines so they tie out.
//   BOOL-023  Blueprint changed  +$38K: grade beams after the soil report (≈5 pts of margin)
//   BOOL-018  Blueprint changed  +$9.5K: cabinet package re-quote
//   BOOL-016  Blueprint changed  −$6K: site work rebid
//   BOOL-020, BOOL-025  Stale: last promoted more than 30 days ago
//   BOOL-013  Never promoted: closed Mar 12, still on the underwrite budget
// Completed builds (for sale) carry their final budget, promoted at CO.

/** Active builds whose last promotion is older than this read as stale. */
export const STALE_PROMOTION_DAYS = 30;
/** Cost book rows older than this are flagged. */
export const STALE_COST_BOOK_DAYS = 90;

const DAY_MS = 86_400_000;

function daysBefore(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() - days * DAY_MS).toISOString();
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}

/** Stable small number from an asset id, for deterministic versions and dates. */
function idNum(id: string): number {
  return Number(id.slice(-3));
}

// ── Sync status ────────────────────────────────────────────────
export interface SyncError {
  project: string;
  detail: string;
  reason: string;
}

export const LAST_SYNC = hoursAgo(2);

export const SYNC_ERRORS: SyncError[] = [
  {
    project: 'BP-10432',
    detail: '2210 Ashby St, Houston',
    reason: 'No plan code on the Blueprint project, so it couldn’t be matched to a plan or an asset. Skipped.',
  },
];

// ── Plan cost book ─────────────────────────────────────────────
export interface CostBookRow {
  market: Market;
  plan: string;
  code: string;
  perSqft: Record<SpecLevelName, number>;
  updatedOn: string; // ISO
}

/** Cost book rows Blueprint hasn't refreshed in a while (by market · plan). */
const COST_BOOK_AGE_DAYS: Record<string, number> = {
  'Tampa · The Dakota': 118,
  'LA · The Kendall': 104,
};

/**
 * $/sqft by spec level for each plan offered in each market. DFW is the plan
 * library itself; other markets scale it by how their underwritten builds
 * compare to library pricing, so the book agrees with the underwrites.
 */
function marketCostFactor(market: Market): number {
  if (market === 'DFW') return 1;
  const ratios = ASSETS.filter((a) => a.market === market && a.underwrite).flatMap((a) => {
    const plan = DFW_PLANS.find((p) => p.name === a.underwrite!.planName);
    if (!plan) return [];
    const base = plan.elevations[0].sqft * plan.specLevels[defaultSpecIdx(plan)].costPerSqft;
    return [a.underwrite!.buildCost / base];
  });
  return ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 1;
}

export const COST_BOOK: CostBookRow[] = MARKETS.flatMap((market) => {
  const factor = marketCostFactor(market);
  const names = marketPlanNames(market);
  return DFW_PLANS.filter((p) => market === 'DFW' || names.has(p.name)).map((plan, i) => {
    const key = `${market} · ${plan.name}`;
    const age = COST_BOOK_AGE_DAYS[key] ?? 12 + ((MARKETS.indexOf(market) * 7 + i * 11) % 50);
    return {
      market,
      plan: plan.name,
      code: plan.code,
      perSqft: Object.fromEntries(plan.specLevels.map((s) => [s.level, Math.round(s.costPerSqft * factor)])) as Record<SpecLevelName, number>,
      updatedOn: daysBefore(DEMO_TODAY, age),
    };
  });
});

export function costBookAge(row: CostBookRow): number {
  return daysBetween(row.updatedOn, DEMO_TODAY);
}

// ── Project budgets ────────────────────────────────────────────
interface BudgetSeed {
  /** Blueprint's newer version, by budget line. */
  change?: { lines: Partial<Record<BudgetCategory, number>>; note: string; on: string };
  /** Days since the last promotion, when it isn't recent. */
  promotedDaysAgo?: number;
  neverPromoted?: boolean;
}

const BUDGET_SEEDS: Record<string, BudgetSeed> = {
  'BOOL-023': {
    change: {
      lines: { foundation: 26_000, framing: 12_000 },
      note: 'Engineer added grade beams after the soil report; framing re-quoted to match.',
      on: '2026-04-15',
    },
  },
  'BOOL-018': { change: { lines: { interior_finishes: 9_500 }, note: 'Cabinet package re-quoted after the vendor change.', on: '2026-04-11' } },
  'BOOL-016': { change: { lines: { site_work: -6_000 }, note: 'Site work rebid came in under.', on: '2026-04-09' } },
  'BOOL-020': { promotedDaysAgo: 41 },
  'BOOL-025': { promotedDaysAgo: 58 },
  'BOOL-013': { neverPromoted: true, change: { lines: { site_work: 4_200 }, note: 'Blueprint v1 from the plan’s cost book; tree protection added to site work.', on: '2026-03-20' } },
};

export type BudgetSyncStatus = 'in_sync' | 'changed' | 'stale' | 'never';

export const BUDGET_STATUS_LABELS: Record<BudgetSyncStatus, string> = {
  in_sync: 'In sync',
  changed: 'Blueprint changed',
  stale: 'Stale (>30 days)',
  never: 'Never promoted',
};

export interface Promotion {
  assetId: string;
  at: string;          // ISO
  by: string;
  fromVersion: string; // e.g. "v3", or "UW" for the underwrite budget
  toVersion: string;
  change: number;      // $
}

export interface LineDiff {
  category: BudgetCategory;
  uw: number;
  blueprint: number;
  change: number;
}

export interface BudgetSync {
  asset: Asset;
  uwVersion: string;
  uwAmount: number;
  bpVersion: string;
  bpAmount: number;
  diff: number;                 // Blueprint − underwriting
  lastPromoted?: { at: string; by: string };
  status: BudgetSyncStatus;
  note?: string;                // why Blueprint changed
  lines: LineDiff[];
}

function activeBuild(a: Asset): boolean {
  return a.stage === 'precon' || a.stage === 'construction';
}

function seededPromotion(a: Asset, seed: BudgetSeed | undefined): { at: string; by: string } | undefined {
  if (seed?.neverPromoted) return undefined;
  const by = idNum(a.id) % 4 === 0 ? MARKS_MANAGER : ANALYST_BY_MARKET[a.market];
  // Completed builds were last promoted at CO; active ones recently unless seeded stale.
  if (!activeBuild(a)) return { at: a.owned!.schedule.forecastCompletion, by };
  return { at: daysBefore(DEMO_TODAY, seed?.promotedDaysAgo ?? 3 + (idNum(a.id) * 7) % 24), by };
}

/**
 * Sync row for an owned, unsold asset. `asset` carries this session's promotions
 * (withBudgetPromotions), so a promoted lot's underwriting budget already
 * matches Blueprint.
 */
export function budgetSync(asset: Asset, promotions: Record<string, Promotion>): BudgetSync {
  const seed = BUDGET_SEEDS[asset.id];
  const promoted = promotions[asset.id];
  const base = ASSETS.find((a) => a.id === asset.id)!;           // before any session promotion
  const version = 2 + (idNum(asset.id) % 4);
  const pending = seed?.change && !promoted ? seed.change.lines : {};
  const lines: LineDiff[] = asset.owned!.budgetLines.map((l) => {
    const delta = pending[l.category] ?? 0;
    return { category: l.category, uw: l.budget, blueprint: l.budget + delta, change: delta };
  });
  const seedDelta = Object.values(seed?.change?.lines ?? {}).reduce((s, n) => s + (n ?? 0), 0);
  const bpAmount = base.owned!.budget + (seed?.change ? seedDelta : 0);
  const uwAmount = asset.owned!.budget;
  const lastPromoted = promoted ? { at: promoted.at, by: promoted.by } : seededPromotion(asset, seed);

  const uwVersion = promoted ? promoted.toVersion : seed?.neverPromoted ? 'UW' : `v${version}`;
  const bpVersion = seed?.neverPromoted ? 'v1' : seed?.change ? `v${version + 1}` : `v${version}`;

  let status: BudgetSyncStatus = 'in_sync';
  if (!promoted) {
    if (seed?.neverPromoted) status = 'never';
    else if (bpAmount !== uwAmount) status = 'changed';
    else if (activeBuild(asset) && lastPromoted && daysBetween(lastPromoted.at, DEMO_TODAY) > STALE_PROMOTION_DAYS) status = 'stale';
  }

  return {
    asset,
    uwVersion,
    uwAmount,
    bpVersion,
    bpAmount,
    diff: bpAmount - uwAmount,
    lastPromoted,
    status,
    note: seed?.change?.note,
    lines,
  };
}

export interface PromotionImpact {
  mark: number;
  costBefore: number;
  costAfter: number;
  marginBefore: number; // implied margin on the current mark, %
  marginAfter: number;
}

/** Projected total cost (land + full build budget) and implied margin on the current mark, before and after. */
export function promotionImpact(sync: BudgetSync): PromotionImpact {
  const mark = latestMark(sync.asset)?.value ?? 0;
  const costBefore = projectedTotalCost(sync.asset);
  const costAfter = costBefore + sync.diff;
  const pct = (cost: number) => (mark > 0 ? ((mark - cost) / mark) * 100 : 0);
  return { mark, costBefore, costAfter, marginBefore: pct(costBefore), marginAfter: pct(costAfter) };
}

/** Seeded promotion history: each lot's last promotion, newest first. */
export function seededPromotionLog(): Promotion[] {
  return ASSETS.filter((a) => a.owned && a.stage !== 'sold').flatMap((a) => {
    const seed = BUDGET_SEEDS[a.id];
    const last = seededPromotion(a, seed);
    if (!last) return [];
    const version = 2 + (idNum(a.id) % 4);
    // The change each promotion carried: a small re-quote, deterministic per lot.
    const change = Math.round((((idNum(a.id) * 37) % 23) - 9) * 500);
    return [{ assetId: a.id, at: last.at, by: last.by, fromVersion: `v${version - 1}`, toVersion: `v${version}`, change }];
  });
}

/**
 * Assets with this session's promotions applied: each promoted line's budget,
 * estimate at completion and cost to complete move by Blueprint's change, so
 * projected total cost and implied margin pick up the new budget everywhere.
 */
export function withBudgetPromotions(assets: Asset[], promotions: Record<string, Promotion>): Asset[] {
  return assets.map((a) => {
    const seed = BUDGET_SEEDS[a.id];
    if (!promotions[a.id] || !a.owned || !seed?.change) return a;
    const delta = seed.change.lines;
    const budgetLines = a.owned.budgetLines.map((l) => {
      const d = delta[l.category] ?? 0;
      return d ? { ...l, budget: l.budget + d, estimateAtCompletion: l.estimateAtCompletion + d, costToComplete: l.costToComplete + d } : l;
    });
    const total = Object.values(delta).reduce((s, n) => s + (n ?? 0), 0);
    return { ...a, owned: { ...a.owned, budget: a.owned.budget + total, budgetLines } };
  });
}

// ── React context ──────────────────────────────────────────────
export interface BlueprintStore {
  promotions: Record<string, Promotion>;
  promote: (sync: BudgetSync, by: string) => void;
}

export const BlueprintContext = createContext<BlueprintStore>({
  promotions: {},
  promote: () => {},
});

export function useBlueprint(): BlueprintStore {
  return useContext(BlueprintContext);
}

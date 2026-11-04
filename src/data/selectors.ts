import type { Asset, AssetStage, Market, MonthlyMark, UnderwritingStatus } from '../types';
import { ASSETS } from './assets';
import { DEMO_TODAY, daysSince } from './dates';

// ── Portfolio selectors ────────────────────────────────────────
// Pure functions over the asset list. Every selector defaults to the full
// portfolio; pass the output of filterAssets to scope by market.

export const ASSET_STAGES: AssetStage[] = [
  'opportunity',
  'underwriting',
  'under_contract',
  'precon',
  'construction',
  'for_sale',
  'sold',
];

/** Pre-contract stages that carry a pipelineStatus. */
export const PIPELINE_STAGES: AssetStage[] = ['opportunity', 'underwriting'];

export const MARKETS: Market[] = ['DFW', 'Houston', 'Tampa', 'St. Pete', 'LA'];

/** Owned, not-yet-sold stages that sit on the balance sheet. */
export const BALANCE_SHEET_STAGES = ['precon', 'construction', 'for_sale'] as const;
export type BalanceSheetStage = (typeof BALANCE_SHEET_STAGES)[number];

/** Sold assets count toward the lifecycle only within this trailing window. */
export const SOLD_WINDOW_MONTHS = 6;

/** For-sale listings older than this many days on market are flagged as stale. */
export const STALE_LISTING_DAYS = 60;

export { APPROVAL_THRESHOLD } from './markProposals';

function byStage<T>(assets: Asset[], value: (stageAssets: Asset[]) => T): Record<AssetStage, T> {
  return Object.fromEntries(
    ASSET_STAGES.map((stage) => [stage, value(assets.filter((a) => a.stage === stage))]),
  ) as Record<AssetStage, T>;
}

export function filterAssets(
  assets: Asset[] = ASSETS,
  { market }: { market?: Market } = {},
): Asset[] {
  return assets.filter((a) => !market || a.market === market);
}

export function pipelineAssets(assets: Asset[] = ASSETS): Asset[] {
  return assets.filter((a) => PIPELINE_STAGES.includes(a.stage));
}

/** Underwrite board columns, left to right. */
export const UNDERWRITING_STATUSES: UnderwritingStatus[] = [
  'ai_drafting',
  'draft_ready',
  'analyst_review',
  'submitted_to_growth',
];

/** Days in the current board column turn amber, then red, after these thresholds. */
export const BOARD_WARN_DAYS = 2;
export const BOARD_LATE_DAYS = 4;

/** Pipeline assets grouped by board column, longest-waiting first. DQ'd assets are left out. */
export function underwritingBoard(assets: Asset[] = ASSETS): Record<UnderwritingStatus, Asset[]> {
  return Object.fromEntries(
    UNDERWRITING_STATUSES.map((status) => [
      status,
      pipelineAssets(assets)
        .filter((a) => a.underwritingStatus === status)
        .sort((a, b) => daysInColumn(b) - daysInColumn(a)),
    ]),
  ) as Record<UnderwritingStatus, Asset[]>;
}

export function daysInColumn(asset: Asset, asOf: string = DEMO_TODAY): number {
  return asset.underwritingSince ? daysSince(asset.underwritingSince, asOf) : 0;
}

export function disqualifiedPipeline(assets: Asset[] = ASSETS): Asset[] {
  return pipelineAssets(assets).filter((a) => a.pipelineStatus === 'dqd');
}

/** Analysts with at least one asset on the board, alphabetical. */
export function boardAnalysts(assets: Asset[] = ASSETS): string[] {
  return [...new Set(pipelineAssets(assets).flatMap((a) => (a.underwritingStatus && a.analyst ? [a.analyst] : [])))].sort();
}

/** Plan names already underwritten on assets in a market (non-DFW markets use these). */
export function marketPlanNames(market: Market, assets: Asset[] = ASSETS): Set<string> {
  return new Set(assets.filter((a) => a.market === market && a.underwrite).map((a) => a.underwrite!.planName));
}

/** Date the asset entered each stage it has reached, in lifecycle order. */
export function stageHistory(asset: Asset): { stage: AssetStage; date?: string; reached: boolean }[] {
  const dates: Record<AssetStage, string | undefined> = {
    opportunity: asset.intake?.dateReceived,
    underwriting: asset.underwrite?.underwrittenOn,
    under_contract: asset.contract?.contractDate,
    precon: asset.owned?.closedOn,
    construction: asset.owned?.startedOn,
    for_sale: asset.listing?.listedOn,
    sold: asset.sale?.soldOn,
  };
  const current = ASSET_STAGES.indexOf(asset.stage);
  return ASSET_STAGES.map((stage, i) => ({ stage, date: i <= current ? dates[stage] : undefined, reached: i <= current }));
}

// ── Underwritten vs realized ───────────────────────────────────
export type GapLineKey = 'salePrice' | 'land' | 'closing' | 'build' | 'carry' | 'selling';

export interface GapLine {
  key: GapLineKey;
  label: string;
  uw: number;
  realized: number;
  marginImpact: number; // + helps margin dollars
}

export interface UnderwritingGap {
  lines: GapLine[];       // sale price first, then each cost line
  uwMargin: number;       // $
  realizedMargin: number; // $
  marginPts: number;      // realized − underwritten margin %
  driver: GapLine;        // line with the largest margin impact
}

/** Line-by-line underwritten vs realized for a sold asset. */
export function underwritingGap(asset: Asset): UnderwritingGap | undefined {
  const uw = asset.underwrite;
  const sale = asset.sale;
  if (!uw || !sale) return undefined;
  const cost = (key: GapLineKey, label: string, u: number, r: number): GapLine => ({
    key, label, uw: u, realized: r, marginImpact: u - r,
  });
  const lines: GapLine[] = [
    { key: 'salePrice', label: 'Sale price', uw: uw.esp, realized: sale.salePrice, marginImpact: sale.salePrice - uw.esp },
    cost('land', 'Land', uw.landPrice, sale.landPrice),
    cost('closing', 'Closing costs', uw.closingCosts, sale.closingCosts),
    cost('build', 'Build', uw.buildCost, sale.buildCost),
    cost('carry', 'Carry / financing', uw.carryCosts, sale.carryCosts),
    cost('selling', 'Selling costs', uw.sellingCosts, sale.sellingCosts),
  ];
  return {
    lines,
    uwMargin: uw.esp - uw.totalCost,
    realizedMargin: sale.salePrice - sale.totalCost,
    marginPts: Math.round((sale.marginPct - uw.marginPct) * 10) / 10,
    driver: lines.reduce((top, l) => (Math.abs(l.marginImpact) > Math.abs(top.marginImpact) ? l : top)),
  };
}

export function assetsByStage(assets: Asset[] = ASSETS): Record<AssetStage, Asset[]> {
  return byStage(assets, (list) => list);
}

export function countByStage(assets: Asset[] = ASSETS): Record<AssetStage, number> {
  return byStage(assets, (list) => list.length);
}

export function latestMark(asset: Asset): MonthlyMark | undefined {
  return asset.marks?.[asset.marks.length - 1];
}

/** Capital deployed: land plus vertical spend to date. Zero before close. */
export function costBasis(asset: Asset): number {
  if (!asset.owned || !asset.underwrite) return 0;
  return asset.underwrite.landPrice + asset.owned.costToDate;
}

export function costBasisByStage(assets: Asset[] = ASSETS): Record<AssetStage, number> {
  return byStage(assets, (list) => list.reduce((sum, a) => sum + costBasis(a), 0));
}

/** Projected land + full vertical budget (excludes closing, carry and selling). Zero before close. */
export function projectedTotalCost(asset: Asset): number {
  if (!asset.owned || !asset.underwrite) return 0;
  return asset.underwrite.landPrice + asset.owned.budget;
}

export function projectedTotalCostByStage(assets: Asset[] = ASSETS): Record<AssetStage, number> {
  return byStage(assets, (list) => list.reduce((sum, a) => sum + projectedTotalCost(a), 0));
}

/** Sum of each asset's latest mark value. Only owned stages carry marks. */
export function currentMarkByStage(assets: Asset[] = ASSETS): Record<AssetStage, number> {
  return byStage(assets, (list) => list.reduce((sum, a) => sum + (latestMark(a)?.value ?? 0), 0));
}

/** Assets whose open month-end mark proposal moves more than the threshold and isn't approved. */
export function assetsNeedingApproval(assets: Asset[] = ASSETS): Asset[] {
  return assets.filter((a) => a.markProposal?.status === 'needs_approval');
}

export function staleListings(assets: Asset[] = ASSETS, days: number = STALE_LISTING_DAYS): Asset[] {
  return assets.filter((a) => a.stage === 'for_sale' && a.listing && a.listing.daysOnMarket > days);
}

/** Sold assets whose sale closed within the trailing window ending at `asOf`. */
export function soldWithin(
  assets: Asset[] = ASSETS,
  months: number = SOLD_WINDOW_MONTHS,
  asOf: string = DEMO_TODAY,
): Asset[] {
  const start = new Date(asOf);
  start.setUTCMonth(start.getUTCMonth() - months);
  return assets.filter(
    (a) => a.stage === 'sold' && a.sale && new Date(a.sale.soldOn) >= start && new Date(a.sale.soldOn) <= new Date(asOf),
  );
}

/**
 * Dollar value of one asset at its stage: UW ESP before close, latest mark
 * while owned, sale price once sold.
 */
export function stageValue(asset: Asset): number {
  if (asset.stage === 'sold') return asset.sale?.salePrice ?? 0;
  if (asset.owned) return latestMark(asset)?.value ?? 0;
  return asset.underwrite?.esp ?? 0;
}

export interface LifecycleStage {
  count: number;
  value: number;
  valuedCount: number; // assets that carry a value (e.g. underwritten opportunities)
}

/** Count and dollar value per stage. Sold is limited to the trailing window. */
export function lifecycleByStage(assets: Asset[] = ASSETS): Record<AssetStage, LifecycleStage> {
  const recentlySold = new Set(soldWithin(assets));
  const inScope = assets.filter((a) => a.stage !== 'sold' || recentlySold.has(a));
  return byStage(inScope, (list) => {
    const valued = list.filter((a) => stageValue(a) > 0);
    return {
      count: list.length,
      value: valued.reduce((sum, a) => sum + stageValue(a), 0),
      valuedCount: valued.length,
    };
  });
}

export interface BalanceSheetRow {
  count: number;
  costBasis: number;          // land + vertical spend to date
  projectedTotalCost: number; // land + full vertical budget
  currentMark: number;        // sum of latest marks
  impliedMarginPct: number | null; // (currentMark - projectedTotalCost) / currentMark
}

function balanceRow(list: Asset[]): BalanceSheetRow {
  const costBasisSum = list.reduce((sum, a) => sum + costBasis(a), 0);
  const projectedTotal = list.reduce((sum, a) => sum + projectedTotalCost(a), 0);
  const currentMark = list.reduce((sum, a) => sum + (latestMark(a)?.value ?? 0), 0);
  return {
    count: list.length,
    costBasis: costBasisSum,
    projectedTotalCost: projectedTotal,
    currentMark,
    impliedMarginPct: currentMark > 0 ? ((currentMark - projectedTotal) / currentMark) * 100 : null,
  };
}

/** Balance sheet rows for owned, unsold stages, plus a total row. */
export function balanceSheet(assets: Asset[] = ASSETS): {
  rows: Record<BalanceSheetStage, BalanceSheetRow>;
  total: BalanceSheetRow;
} {
  const owned = assets.filter((a) => (BALANCE_SHEET_STAGES as readonly AssetStage[]).includes(a.stage));
  const rows = Object.fromEntries(
    BALANCE_SHEET_STAGES.map((stage) => [stage, balanceRow(owned.filter((a) => a.stage === stage))]),
  ) as Record<BalanceSheetStage, BalanceSheetRow>;
  return { rows, total: balanceRow(owned) };
}

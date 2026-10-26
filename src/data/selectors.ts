import type { Asset, AssetStage, Market, MonthlyMark, ProductType } from '../types';
import { ASSETS } from './assets';
import { DEMO_TODAY } from './dates';

// ── Portfolio selectors ────────────────────────────────────────
// Pure functions over the asset list. Every selector defaults to the full
// portfolio; pass the output of filterAssets to scope by product or market.

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
export const PRODUCT_TYPES: ProductType[] = ['BOOL', 'Suburban'];

/** Owned, not-yet-sold stages that sit on the balance sheet. */
export const BALANCE_SHEET_STAGES = ['precon', 'construction', 'for_sale'] as const;
export type BalanceSheetStage = (typeof BALANCE_SHEET_STAGES)[number];

/** Sold assets count toward the lifecycle only within this trailing window. */
export const SOLD_WINDOW_MONTHS = 6;

/** For-sale listings older than this many days on market are flagged as stale. */
export const STALE_LISTING_DAYS = 60;

/** Latest-mark moves larger than this (either direction) need sign-off. */
export const APPROVAL_THRESHOLD = 10_000;

function byStage<T>(assets: Asset[], value: (stageAssets: Asset[]) => T): Record<AssetStage, T> {
  return Object.fromEntries(
    ASSET_STAGES.map((stage) => [stage, value(assets.filter((a) => a.stage === stage))]),
  ) as Record<AssetStage, T>;
}

export function filterAssets(
  assets: Asset[] = ASSETS,
  { productType, market }: { productType?: ProductType; market?: Market } = {},
): Asset[] {
  return assets.filter(
    (a) => (!productType || a.productType === productType) && (!market || a.market === market),
  );
}

export function pipelineAssets(assets: Asset[] = ASSETS): Asset[] {
  return assets.filter((a) => PIPELINE_STAGES.includes(a.stage));
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

/** Sum of each asset's latest mark value. Only owned stages carry marks. */
export function currentMarkByStage(assets: Asset[] = ASSETS): Record<AssetStage, number> {
  return byStage(assets, (list) => list.reduce((sum, a) => sum + (latestMark(a)?.value ?? 0), 0));
}

export function assetsNeedingApproval(assets: Asset[] = ASSETS): Asset[] {
  return assets.filter((a) => {
    const mark = latestMark(a);
    return mark !== undefined && Math.abs(mark.changeFromPrior) > APPROVAL_THRESHOLD && !mark.approvedBy;
  });
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
  costBasis: number;      // land + vertical spend to date
  currentMark: number;    // sum of latest marks
  totalCost: number;      // underwritten all-in cost (land + full vertical budget)
  impliedMarginPct: number | null; // (currentMark - totalCost) / currentMark
}

function balanceRow(list: Asset[]): BalanceSheetRow {
  const costBasisSum = list.reduce((sum, a) => sum + costBasis(a), 0);
  const currentMark = list.reduce((sum, a) => sum + (latestMark(a)?.value ?? 0), 0);
  const totalCost = list.reduce((sum, a) => sum + (a.underwrite?.totalCost ?? 0), 0);
  return {
    count: list.length,
    costBasis: costBasisSum,
    currentMark,
    totalCost,
    impliedMarginPct: currentMark > 0 ? ((currentMark - totalCost) / currentMark) * 100 : null,
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

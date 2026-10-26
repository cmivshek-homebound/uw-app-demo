import type { Asset, AssetStage, Market, MonthlyMark, ProductType } from '../types';
import { ASSETS } from './assets';

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

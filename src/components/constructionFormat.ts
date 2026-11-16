import { AI, BLUEPRINT } from '../data/provenance';
import type { ConstructionStatus } from '../data/selectors';
import type { Asset, BudgetCategory, MilestoneKind, ProvenanceInfo } from '../types';

// ── Construction labels, provenance and formatters ─────────────
// Shared by ConstructionDetail, the Construction page and the asset page.

export { AI, BLUEPRINT };

/** Estimate at completion is an AI forecast until the build finishes; then it's the final cost. */
export function eacInfo(asset: Asset): ProvenanceInfo {
  return (asset.owned?.pctComplete ?? 0) >= 1 ? BLUEPRINT : AI;
}

export const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  site_work: 'Site work',
  foundation: 'Foundation',
  framing: 'Framing',
  roofing: 'Roofing',
  mep: 'MEP',
  exterior: 'Exterior',
  interior_finishes: 'Interior finishes',
  contingency: 'Contingency',
};

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  permit_issued: 'Permit issued',
  foundation: 'Foundation',
  framing: 'Framing',
  dry_in: 'Dry-in',
  mep_rough: 'MEP rough',
  drywall: 'Drywall',
  finishes: 'Finishes',
  co: 'CO',
};

export const STATUS_LABELS: Record<ConstructionStatus, string> = {
  on_track: 'On track',
  over_budget: 'Over budget',
  behind_schedule: 'Behind schedule',
  both: 'Both',
};

// ── Formatters ─────────────────────────────────────────────────
export function usd(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

export function signedUsd(n: number) {
  if (Math.round(n) === 0) return '$0';
  return `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

export function usdK(n: number, signed = false) {
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  return `${sign}$${(abs / 1_000).toFixed(1)}K`;
}

export function signedPct(n: number) {
  if (Number(n.toFixed(1)) === 0) return '0.0%';
  return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(1)}%`;
}

export function shortDate(iso: string, withYear = false) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear && { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

export function weeksLate(days: number) {
  if (days <= 0) return 'On schedule';
  const weeks = Math.round(days / 7);
  return weeks >= 1 ? `${weeks} wk${weeks === 1 ? '' : 's'} late` : `${days} days late`;
}

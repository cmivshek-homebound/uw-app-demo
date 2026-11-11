import type { Market } from '../types';
import { getAIDraft } from './aiDrafts';
import type { AIDraft } from './aiDrafts';
import { ASSETS } from './assets';
import { DEMO_DEAL_ID } from './contracts';
import { DFW_PLANS, calcFinancials, defaultSpecIdx } from './plans';
import type { Plan } from './plans';
import { marketPlanNames } from './selectors';

// ── Scenario pricing per lot ───────────────────────────────────
// The scenario engine and comp selection price plans from the plan library,
// calibrated to the lot's own numbers so every screen agrees:
//   1. lots with an AI draft match the draft's ESP and build for its plan;
//   2. otherwise lots with an underwrite match the underwrite (the source of
//      truth once reviewed), e.g. BOOL-001's $1,119,788 ESP and $410,000 build;
//   3. anything else uses library pricing as-is.
// Each factor scales every plan on the lot, so alternates move with the anchor.

export interface Calibration {
  esp: number;    // multiplier on espPerSqft
  build: number;  // multiplier on every spec level's costPerSqft
}

function draftCalibration(draft: AIDraft): Calibration {
  const rec = draft.recommendation.plan;
  const spec = rec.plan.specLevels[defaultSpecIdx(rec.plan)];
  return {
    esp: draft.recommendation.esp / rec.sqft / rec.plan.espPerSqft,
    build: rec.build / rec.sqft / spec.costPerSqft,
  };
}

function underwriteCalibration(assetId: string): Calibration | undefined {
  const uw = ASSETS.find((a) => a.id === assetId)?.underwrite;
  const plan = uw && DFW_PLANS.find((p) => p.name === uw.planName);
  if (!uw || !plan) return undefined;
  const base = calcFinancials({ plan, elevationIdx: 0, specLevelIdx: defaultSpecIdx(plan), selectedOptionIds: [] });
  return { esp: uw.esp / base.estSalePrice, build: uw.buildCost / base.buildCost };
}

export function pricingCalibration(assetId: string | undefined): Calibration | undefined {
  if (!assetId) return undefined;
  const draft = getAIDraft(assetId);
  return draft ? draftCalibration(draft) : underwriteCalibration(assetId);
}

export function calibrate(plan: Plan, c: Calibration | undefined): Plan {
  if (!c) return plan;
  return {
    ...plan,
    espPerSqft: plan.espPerSqft * c.esp,
    specLevels: plan.specLevels.map((s) => ({ ...s, costPerSqft: s.costPerSqft * c.build })),
  };
}

/** Plans available on a lot (DFW: full library; elsewhere: plans already underwritten there), priced for it. */
export function lotPlans(assetId: string | undefined, market: Market): Plan[] {
  const names = marketPlanNames(market);
  const c = pricingCalibration(assetId);
  return DFW_PLANS.filter((p) => market === 'DFW' || names.has(p.name)).map((p) => calibrate(p, c));
}

// ── Analyst overrides of AI-drafted comp $/sqft ────────────────
// From BOOL-001's underwrite review: the Daniel's comps were bumped for the
// corner lot. Applies only to that lot.
export type CompOverrides = Record<string, { espPerSqft: number; reason: string }>;

const LOT_COMP_OVERRIDES: Record<string, CompOverrides> = {
  [DEMO_DEAL_ID]: { daniel: { espPerSqft: 282, reason: 'corner lot premium' } },
};

export function compOverridesFor(assetId: string | undefined): CompOverrides {
  return (assetId && LOT_COMP_OVERRIDES[assetId]) || {};
}

/** Plan with any analyst comp override applied, for calcFinancials. */
export function withOverrides(plan: Plan, overrides: CompOverrides): Plan {
  const override = overrides[plan.id];
  return override ? { ...plan, espPerSqft: override.espPerSqft } : plan;
}

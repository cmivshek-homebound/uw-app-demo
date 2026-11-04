// ── Underwriting cost stack ────────────────────────────────────
// Shared by assets.ts and aiDrafts.ts so every underwrite uses the same
// definition of total cost:
//   land + closing (on land) + build + carry/financing (on build) + selling (on ESP)

export const CLOSING_COST_PCT = 0.9;  // of land price
export const CARRY_COST_PCT = 6;      // of build, construction-period financing and carry
export const SELLING_COST_PCT = 5.5;  // of ESP, commissions and seller closing costs

export interface CostStack {
  land: number;
  closing: number;
  build: number;
  carry: number;
  selling: number;
  total: number;
}

export function costStack({ land, build, esp }: { land: number; build: number; esp: number }): CostStack {
  const closing = Math.round(land * (CLOSING_COST_PCT / 100));
  const carry = Math.round(build * (CARRY_COST_PCT / 100));
  const selling = Math.round(esp * (SELLING_COST_PCT / 100));
  return { land, closing, build, carry, selling, total: land + closing + build + carry + selling };
}

export function marginPct(esp: number, totalCost: number): number {
  return Math.round(((esp - totalCost) / esp) * 1000) / 10;
}

/** Highest land price that still clears `targetPct` margin, rounded down to $1K. */
export function maxLandPrice({ esp, build }: { esp: number; build: number }, targetPct: number): number {
  const { carry, selling } = costStack({ land: 0, build, esp });
  const land = (esp * (1 - targetPct / 100) - build - carry - selling) / (1 + CLOSING_COST_PCT / 100);
  return Math.floor(land / 1000) * 1000;
}

/** Build budget that lands an underwrite at `targetPct` margin, rounded to $5K. */
export function buildForMargin({ esp, land }: { esp: number; land: number }, targetPct: number): number {
  const { closing, selling } = costStack({ land, build: 0, esp });
  const build = (esp * (1 - targetPct / 100) - land - closing - selling) / (1 + CARRY_COST_PCT / 100);
  return Math.round(build / 5000) * 5000;
}

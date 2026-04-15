export interface Plan {
  id: string;
  name: string;
  sqft: number;
  beds: number;
  baths: number;
  tier: string;
  elevation: number;
  buildCost: number;
  estSalePrice: number;
  minLotWidth: number;
  minLotDepth: number;
  recommended?: boolean;
}

export const DFW_PLANS: Plan[] = [
  {
    id: 'plan-a',
    name: 'The Elm',
    sqft: 1850,
    beds: 3,
    baths: 2.5,
    tier: 'Deluxe',
    elevation: 2,
    buildCost: 312000,
    estSalePrice: 498000,
    minLotWidth: 40,
    minLotDepth: 90,
  },
  {
    id: 'plan-b',
    name: 'The Birch',
    sqft: 2100,
    beds: 4,
    baths: 3,
    tier: 'Premium',
    elevation: 1,
    buildCost: 348000,
    estSalePrice: 567000,
    minLotWidth: 38,
    minLotDepth: 90,
    recommended: true,
  },
  {
    id: 'plan-c',
    name: 'The Cedar',
    sqft: 2350,
    beds: 4,
    baths: 3.5,
    tier: 'Premium Plus',
    elevation: 3,
    buildCost: 391000,
    estSalePrice: 594000,
    minLotWidth: 42,
    minLotDepth: 95,
  },
];

// ── Financial model ────────────────────────────────────────────
export interface PlanFinancials {
  buildCost: number;
  estSalePrice: number;
  financingCost: number;
  transactionCosts: number;
  homeboundFee: number;
  totalCostExLand: number;
  maxLotOffer: number;
  projectedMargin: number;
}

export function calcFinancials(
  buildCost: number,
  estSalePrice: number,
): PlanFinancials {
  const financingCost     = buildCost * 0.06;
  const transactionCosts  = estSalePrice * 0.03;
  const homeboundFee      = estSalePrice * 0.05;
  const totalCostExLand   = buildCost + financingCost + transactionCosts + homeboundFee;
  const maxLotOffer       = estSalePrice - totalCostExLand;
  const projectedMargin   = (maxLotOffer / estSalePrice) * 100;
  return {
    buildCost,
    estSalePrice,
    financingCost,
    transactionCosts,
    homeboundFee,
    totalCostExLand,
    maxLotOffer,
    projectedMargin,
  };
}

export function calcPlanFinancials(plan: Plan): PlanFinancials {
  return calcFinancials(plan.buildCost, plan.estSalePrice);
}

// ── Domain types ───────────────────────────────────────────────
export interface Elevation {
  name: string;
  sqft: number;
  widthFt: number;
  depthFt: number;
}

export type SpecLevelName = 'Essential' | 'Deluxe' | 'Premium' | 'Premium+';

export interface SpecLevelPricing {
  level: SpecLevelName;
  costPerSqft: number;
}

export interface Plan {
  id: string;
  code: string;           // e.g. SFH-3571
  name: string;
  beds: string;
  baths: string;
  stories: number;
  elevations: Elevation[];
  specLevels: SpecLevelPricing[];
  minLotWidth: number;
  minLotDepth: number;
  espPerSqft: number;     // market ESP per sqft for this plan tier
}

// ── DFW plan library ───────────────────────────────────────────
export const DFW_PLANS: Plan[] = [
  {
    id: 'daniel',
    code: 'SFH-3571',
    name: 'The Daniel',
    beds: '4',
    baths: '4.5',
    stories: 2,
    elevations: [
      { name: 'Transitional Farmhouse', sqft: 3734, widthFt: 34.92, depthFt: 61.83 },
      { name: 'Modern Cape Dutch',      sqft: 3733, widthFt: 34.92, depthFt: 60.58 },
      { name: 'English Estate',         sqft: 3738, widthFt: 34.92, depthFt: 59.92 },
      { name: 'Contemporary Colonial',  sqft: 3714, widthFt: 34.92, depthFt: 59.46 },
    ],
    specLevels: [
      { level: 'Essential', costPerSqft: 140 },
      { level: 'Deluxe',    costPerSqft: 150 },
      { level: 'Premium',   costPerSqft: 165 },
      { level: 'Premium+',  costPerSqft: 170 },
    ],
    minLotWidth: 45,
    minLotDepth: 90,
    espPerSqft: 275,
  },
  {
    id: 'emerson',
    code: 'SFH-012',
    name: 'The Emerson',
    beds: '5',
    baths: '4',
    stories: 2,
    elevations: [
      { name: 'Modern Farmhouse',       sqft: 4274, widthFt: 39.00, depthFt: 71.00 },
      { name: 'Transitional',           sqft: 4496, widthFt: 39.92, depthFt: 70.92 },
      { name: 'Transitional Farmhouse', sqft: 4337, widthFt: 39.00, depthFt: 70.46 },
    ],
    specLevels: [
      { level: 'Essential', costPerSqft: 130 },
      { level: 'Deluxe',    costPerSqft: 138 },
      { level: 'Premium',   costPerSqft: 147 },
      { level: 'Premium+',  costPerSqft: 155 },
    ],
    minLotWidth: 50,
    minLotDepth: 100,
    espPerSqft: 262,
  },
  {
    id: 'kendall',
    code: 'SFH-117',
    name: 'The Kendall',
    beds: '4-5',
    baths: '4-5',
    stories: 2,
    elevations: [
      { name: 'Transitional',           sqft: 3774, widthFt: 46.92, depthFt: 70.46 },
      { name: 'Modern Tudor',           sqft: 3757, widthFt: 46.92, depthFt: 69.46 },
      { name: 'Modern Farmhouse',       sqft: 3705, widthFt: 46.00, depthFt: 74.83 },
    ],
    specLevels: [
      { level: 'Essential', costPerSqft: 140 },
      { level: 'Deluxe',    costPerSqft: 150 },
      { level: 'Premium',   costPerSqft: 165 },
      { level: 'Premium+',  costPerSqft: 170 },
    ],
    minLotWidth: 57,
    minLotDepth: 100,
    espPerSqft: 278,
  },
  {
    id: 'ryan',
    code: 'SFH-4067',
    name: 'The Ryan',
    beds: '4',
    baths: '5',
    stories: 2,
    elevations: [
      { name: 'Transitional Farmhouse', sqft: 4210, widthFt: 39.92, depthFt: 76.75 },
      { name: 'Modern Tudor',           sqft: 4214, widthFt: 39.92, depthFt: 74.46 },
      { name: 'English Estate',         sqft: 4199, widthFt: 39.92, depthFt: 74.92 },
      { name: 'Contemporary Colonial',  sqft: 4189, widthFt: 39.92, depthFt: 75.96 },
    ],
    specLevels: [
      { level: 'Essential', costPerSqft: 140 },
      { level: 'Deluxe',    costPerSqft: 150 },
      { level: 'Premium',   costPerSqft: 165 },
      { level: 'Premium+',  costPerSqft: 170 },
    ],
    minLotWidth: 50,
    minLotDepth: 107,
    espPerSqft: 272,
  },
  {
    id: 'benjamin',
    code: 'SFH-4251',
    name: 'The Benjamin',
    beds: '5',
    baths: '5.5',
    stories: 2,
    elevations: [
      { name: 'Transitional Farmhouse', sqft: 4398, widthFt: 49.92, depthFt: 69.92 },
      { name: 'Modern Cape Dutch',      sqft: 4405, widthFt: 49.92, depthFt: 69.92 },
      { name: 'English Estate',         sqft: 4413, widthFt: 49.92, depthFt: 69.92 },
      { name: 'Contemporary Colonial',  sqft: 4352, widthFt: 49.92, depthFt: 69.46 },
    ],
    specLevels: [
      { level: 'Essential', costPerSqft: 140 },
      { level: 'Deluxe',    costPerSqft: 150 },
      { level: 'Premium',   costPerSqft: 165 },
      { level: 'Premium+',  costPerSqft: 170 },
    ],
    minLotWidth: 60,
    minLotDepth: 100,
    espPerSqft: 285,
  },
  {
    id: 'dakota',
    code: 'SFH-4619',
    name: 'The Dakota',
    beds: '5',
    baths: '6',
    stories: 2,
    elevations: [
      { name: 'Transitional Farmhouse', sqft: 4787, widthFt: 59.92, depthFt: 64.92 },
      { name: 'Modern Cape Dutch',      sqft: 4756, widthFt: 59.92, depthFt: 64.92 },
      { name: 'English Estate',         sqft: 4766, widthFt: 59.92, depthFt: 64.92 },
      { name: 'Contemporary Colonial',  sqft: 4718, widthFt: 59.92, depthFt: 64.46 },
    ],
    specLevels: [
      { level: 'Essential', costPerSqft: 135 },
      { level: 'Deluxe',    costPerSqft: 145 },
      { level: 'Premium',   costPerSqft: 155 },
      { level: 'Premium+',  costPerSqft: 170 },
    ],
    minLotWidth: 70,
    minLotDepth: 95,
    espPerSqft: 292,
  },
];

// ── Design packages ────────────────────────────────────────────
export const DESIGN_PACKAGES = ['Classic', 'Modern', 'Transitional', 'Coastal'] as const;
export type DesignPackage = (typeof DESIGN_PACKAGES)[number];

// ── Add-on options ─────────────────────────────────────────────
export interface AddOnOption {
  id: string;
  name: string;
  type: 'Structural' | 'Add-On';
  cost: number;
  sqftDelta: number;
}

export const ADD_ON_OPTIONS: AddOnOption[] = [
  { id: 'scullery',        name: 'Convert Pantry to Scullery',    type: 'Structural', cost:  8500, sqftDelta:   0 },
  { id: 'side-garage',     name: 'Side Entry Garage',             type: 'Structural', cost: 12000, sqftDelta:   0 },
  { id: 'steam-shower',    name: 'Steam Shower Upgrade',          type: 'Structural', cost:  4200, sqftDelta:   0 },
  { id: 'outdoor-kitchen', name: 'Outdoor Kitchen',               type: 'Add-On',     cost: 18000, sqftDelta:   0 },
  { id: 'faux-beams',      name: 'Faux Ceiling Beams',            type: 'Add-On',     cost:  3800, sqftDelta:   0 },
  { id: 'flex-room',       name: 'Add Flex Room',                 type: 'Structural', cost: 22000, sqftDelta: 150 },
  { id: 'lux-appliance',   name: 'Luxury Appliance Upgrade',      type: 'Add-On',     cost: 14500, sqftDelta:   0 },
  { id: 'patio-screens',   name: 'Patio Screens',                 type: 'Structural', cost:  6200, sqftDelta:   0 },
  { id: 'cast-stone',      name: 'Cast Stone Fireplace Surround', type: 'Add-On',     cost:  5400, sqftDelta:   0 },
  { id: 'lux-speaker',     name: 'Luxury Speaker System',         type: 'Add-On',     cost:  2800, sqftDelta:   0 },
];

// ── Feasibility ────────────────────────────────────────────────
export interface FeasibilityLot {
  widthFt: number;
  depthFt: number;
}

export type FeasibilityReason =
  | 'ok'
  | 'width-too-narrow'
  | 'depth-too-shallow'
  | 'width-and-depth';

export function checkFeasibility(plan: Plan, lot: FeasibilityLot): FeasibilityReason {
  const widthFail = plan.minLotWidth > lot.widthFt;
  const depthFail = plan.minLotDepth > lot.depthFt;
  if (widthFail && depthFail) return 'width-and-depth';
  if (widthFail) return 'width-too-narrow';
  if (depthFail) return 'depth-too-shallow';
  return 'ok';
}

export function feasibilityReasonLabel(plan: Plan, reason: FeasibilityReason): string {
  switch (reason) {
    case 'width-too-narrow':
      return `Lot too narrow — needs ${plan.minLotWidth}ft wide`;
    case 'depth-too-shallow':
      return `Lot too shallow — needs ${plan.minLotDepth}ft deep`;
    case 'width-and-depth':
      return `Lot too small — needs ${plan.minLotWidth}ft × ${plan.minLotDepth}ft`;
    default:
      return 'Fits lot';
  }
}

// ── Financial model ────────────────────────────────────────────
export interface PlanFinancials {
  sqft: number;
  costPerSqft: number;
  optionsCost: number;
  buildCost: number;
  estSalePrice: number;
  financingCost: number;
  transactionCosts: number;
  homeboundFee: number;
  totalCostExLand: number;
  maxLotOffer: number;
  projectedMargin: number;
}

export interface FinancialsInput {
  plan: Plan;
  elevationIdx: number;
  specLevelIdx: number;
  selectedOptionIds: string[];
}

export function calcFinancials({
  plan,
  elevationIdx,
  specLevelIdx,
  selectedOptionIds,
}: FinancialsInput): PlanFinancials {
  const elevation = plan.elevations[elevationIdx];
  const spec = plan.specLevels[specLevelIdx];
  const opts = ADD_ON_OPTIONS.filter((o) => selectedOptionIds.includes(o.id));
  const sqftDelta = opts.reduce((s, o) => s + o.sqftDelta, 0);
  const optionsCost = opts.reduce((s, o) => s + o.cost, 0);
  const sqft = elevation.sqft + sqftDelta;
  const buildCost = sqft * spec.costPerSqft + optionsCost;
  const estSalePrice = sqft * plan.espPerSqft;
  const financingCost = buildCost * 0.06;
  const transactionCosts = estSalePrice * 0.03;
  const homeboundFee = estSalePrice * 0.05;
  const totalCostExLand = buildCost + financingCost + transactionCosts + homeboundFee;
  const maxLotOffer = estSalePrice - totalCostExLand;
  const projectedMargin = estSalePrice > 0 ? (maxLotOffer / estSalePrice) * 100 : 0;
  return {
    sqft,
    costPerSqft: spec.costPerSqft,
    optionsCost,
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

// ── Default selections ─────────────────────────────────────────
export function defaultSpecIdx(plan: Plan): number {
  // Default to "Deluxe" if present, otherwise 1.
  const idx = plan.specLevels.findIndex((s) => s.level === 'Deluxe');
  return idx >= 0 ? idx : 1;
}

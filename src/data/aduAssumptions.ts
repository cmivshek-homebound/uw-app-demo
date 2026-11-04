import type { Market } from '../types';

// ── ADU assumptions by market ──────────────────────────────────
// DEMO PLACEHOLDERS. Every number in this file is fictional, chosen to make
// the demo's ADU story read realistically. None of it is real cost,
// pricing, code or permitting data. Replace with sourced figures before use.
//
// This file is the single source for ADU fit and economics: the Scenario
// Engine and the AI drafts both read from it (via adu.ts).

export type AduKind = 'detached' | 'over_garage' | 'attached' | 'garage_apartment';

export interface AduType {
  id: string;
  name: string;
  kind: AduKind;
  sqft: number;                                 // living area
  footprint: { widthFt: number; depthFt: number }; // ground footprint (the garage, for over-garage units)
}

export interface OfferedAduMarket {
  offered: true;
  types: AduType[];
  buildPerSqft: number;         // ADU build cost per living sqft
  upliftPerSqft: number;        // added sale price per ADU sqft
  minRearYardFt: number;        // back of primary to rear lot line, code minimum for any ADU
  rearSetbackFt: number;        // ADU to rear lot line
  sideSetbackFt?: number;       // ADU to side lot lines; defaults to the lot's side setback
  separationFt: number;         // ADU to primary house (detached kinds only)
  permitsAndFees: number;
  addedDays: number;            // added to the build schedule
  floodElevationCost?: number;  // extra cost when the lot is in a flood zone
  note?: string;
}

export interface NotOfferedAduMarket {
  offered: false;
  reason: string;
}

export type MarketAduAssumptions = OfferedAduMarket | NotOfferedAduMarket;

/** Below this added margin, an ADU that fits is "thin". Placeholder. */
export const ADU_THIN_MARGIN = 20_000;

export const ADU_ASSUMPTIONS: Record<Market, MarketAduAssumptions> = {
  LA: {
    offered: true,
    types: [
      { id: 'la-detached-750', name: 'Detached ADU', kind: 'detached', sqft: 750, footprint: { widthFt: 25, depthFt: 30 } },
      { id: 'la-detached-1000', name: 'Detached ADU', kind: 'detached', sqft: 1_000, footprint: { widthFt: 25, depthFt: 40 } },
      { id: 'la-over-garage-600', name: 'Over-garage ADU', kind: 'over_garage', sqft: 600, footprint: { widthFt: 24, depthFt: 25 } },
      { id: 'la-attached-500', name: 'Attached ADU', kind: 'attached', sqft: 500, footprint: { widthFt: 20, depthFt: 25 } },
    ],
    buildPerSqft: 450,
    upliftPerSqft: 600,
    minRearYardFt: 20,
    rearSetbackFt: 4,
    sideSetbackFt: 4,
    separationFt: 6,
    permitsAndFees: 28_000,
    addedDays: 60,
  },
  'St. Pete': {
    offered: true,
    types: [
      { id: 'stp-over-garage-500', name: 'Over-garage ADU', kind: 'over_garage', sqft: 500, footprint: { widthFt: 22, depthFt: 24 } },
      { id: 'stp-detached-650', name: 'Detached ADU', kind: 'detached', sqft: 650, footprint: { widthFt: 25, depthFt: 26 } },
    ],
    buildPerSqft: 265,
    upliftPerSqft: 360,
    minRearYardFt: 22,
    rearSetbackFt: 5,
    separationFt: 10,
    permitsAndFees: 12_000,
    addedDays: 45,
    floodElevationCost: 22_000,
  },
  Tampa: {
    // Fits on some lots, but returns are thin.
    offered: true,
    types: [
      { id: 'tpa-detached-600', name: 'Detached ADU', kind: 'detached', sqft: 600, footprint: { widthFt: 24, depthFt: 25 } },
    ],
    buildPerSqft: 255,
    upliftPerSqft: 310,
    minRearYardFt: 20,  // placeholder, not specified
    rearSetbackFt: 5,   // placeholder, not specified
    separationFt: 10,   // placeholder, not specified
    permitsAndFees: 10_000,
    addedDays: 45,      // placeholder, not specified
  },
  Houston: {
    offered: true,
    types: [
      { id: 'hou-garage-apt-500', name: 'Garage apartment', kind: 'garage_apartment', sqft: 500, footprint: { widthFt: 22, depthFt: 24 } },
    ],
    buildPerSqft: 235,
    upliftPerSqft: 240,
    minRearYardFt: 20,       // placeholder, not specified
    rearSetbackFt: 3,        // placeholder, not specified
    separationFt: 6,         // placeholder, not specified
    permitsAndFees: 8_000,   // placeholder, not specified
    addedDays: 40,           // placeholder, not specified
    note: 'Deed restrictions must be checked.',
  },
  DFW: {
    offered: false,
    reason: 'ADUs need special approval in most Dallas single-family districts.',
  },
};

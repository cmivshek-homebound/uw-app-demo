import { useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { findOpportunity } from '../data/opportunities';
import { ASSETS } from '../data/assets';
import AssetLink from '../components/AssetLink';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { evaluateAdus, aduRuleText } from '../data/adu';
import type { AduEconomics, LotForFit } from '../data/adu';
import { getAIDraft } from '../data/aiDrafts';
import { AI, SFDC, computed, human } from '../data/provenance';
import { compOverridesFor, lotPlans, pricingCalibration, withOverrides } from '../data/scenarioPricing';
import type { CompOverrides } from '../data/scenarioPricing';
import { CARRY_COST_PCT, SELLING_COST_PCT } from '../data/underwriting';
import type { Market, ProvenanceInfo } from '../types';
import {
  ADD_ON_OPTIONS,
  DESIGN_PACKAGES,
  calcFinancials,
  checkFeasibility,
  feasibilityReasonLabel,
  defaultSpecIdx,
} from '../data/plans';
import type {
  Plan,
  PlanFinancials,
  DesignPackage,
  FeasibilityLot,
  FeasibilityReason,
} from '../data/plans';
import './ScenarioEngine.css';

// ── Formatters ─────────────────────────────────────────────────
const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const pct = (n: number) => n.toFixed(1) + '%';

// ── Lot data ───────────────────────────────────────────────────
// Pipeline lots come from their AI draft (Salesforce lot data). BOOL-001 is
// under contract and has no draft, so its lot (52 × 120) lives here.
const FALLBACK_LOT: Omit<LotForFit, 'lotSqFt' | 'floodZone'> = {
  widthFt: 52,
  depthFt: 120,
  setbacks: { front: 25, side: 5, rear: 10 },
  maxCoveragePct: 50,
};

const ASSUMPTION = human('Underwriting assumption');

function compProvenance(plan: Plan, overrides: CompOverrides): ProvenanceInfo {
  const override = overrides[plan.id];
  if (!override) return { provenance: 'ai' };
  return {
    provenance: 'human',
    note: `Overrode AI comp $/sqft ($${plan.espPerSqft} → $${override.espPerSqft}): ${override.reason}`,
  };
}

function espProvenance(plan: Plan, overrides: CompOverrides): ProvenanceInfo {
  const override = overrides[plan.id];
  if (!override) return { provenance: 'ai' };
  return { provenance: 'human', note: `Uses analyst comp $/sqft: ${override.reason}` };
}

// ── Per-card state ─────────────────────────────────────────────
interface PlanCardState {
  elevationIdx: number;
  specWindowStart: number;   // 0..(specLevels.length - 2), window of 2 visible
  specSelectedIdx: number;
  designPkg: DesignPackage;
  optionsExpanded: boolean;
  selectedOptionIds: string[];
}

function initialCardState(plan: Plan): PlanCardState {
  const selected = defaultSpecIdx(plan);
  const maxStart = Math.max(0, plan.specLevels.length - 2);
  // Default window shows [Deluxe, Premium]; clamp so the selected level stays visible.
  const start = Math.min(selected, maxStart);
  return {
    elevationIdx: 0,
    specWindowStart: start,
    specSelectedIdx: selected,
    designPkg: 'Transitional',
    optionsExpanded: false,
    selectedOptionIds: [],
  };
}

// ── Scenario provenance ────────────────────────────────────────
// A card on its starting elevation, spec level and no options is the AI's
// draft scenario, so its numbers keep their base provenance. Once the analyst
// changes any of those, readouts of the choice are scenario inputs and the
// numbers computed from it are scenario outputs.
const SCENARIO_INPUT = human('Scenario input');
const SCENARIO_OUTPUT = computed('Scenario output');

function isDefaultScenario(plan: Plan, state: PlanCardState): boolean {
  const initial = initialCardState(plan);
  return (
    state.elevationIdx === initial.elevationIdx &&
    state.specSelectedIdx === initial.specSelectedIdx &&
    state.selectedOptionIds.length === 0
  );
}

/** Provenance for a financial output of a plan card's scenario. */
function outputProvenance(plan: Plan, state: PlanCardState, base: ProvenanceInfo): ProvenanceInfo {
  return isDefaultScenario(plan, state) ? base : SCENARIO_OUTPUT;
}

/** Provenance for the selected elevation's footprint. */
function elevationProvenance(plan: Plan, state: PlanCardState): ProvenanceInfo {
  return state.elevationIdx === initialCardState(plan).elevationIdx ? AI : SCENARIO_INPUT;
}

// ── Rendering placeholder ──────────────────────────────────────
function RenderingPlaceholder({ planName, elevationName }: { planName: string; elevationName: string }) {
  return (
    <div className="sc-render-placeholder">
      <svg
        className="sc-render-lines"
        viewBox="0 0 400 220"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 190 L200 90 L400 190" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />
        <path d="M40 190 L40 130 L120 130 L120 190" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />
        <path d="M280 190 L280 130 L360 130 L360 190" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />
        <line x1="0" y1="205" x2="400" y2="205" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      </svg>
      <div className="sc-render-caption">
        <div className="sc-render-name">{planName}</div>
        <div className="sc-render-elev">{elevationName}</div>
      </div>
      <div className="sc-render-tag">Rendering placeholder</div>
    </div>
  );
}

// ── Plan Card ──────────────────────────────────────────────────
interface PlanCardProps {
  plan: Plan;
  state: PlanCardState;
  fin: PlanFinancials;
  isRecommended: boolean;
  isSelected: boolean;
  compOverrides: CompOverrides;
  onToggleSelect: () => void;
  onChange: (patch: Partial<PlanCardState>) => void;
}

function PlanCard({
  plan, state, fin, isRecommended, isSelected, compOverrides, onToggleSelect, onChange,
}: PlanCardProps) {
  const elevation = plan.elevations[state.elevationIdx];
  const specVisible = plan.specLevels.slice(state.specWindowStart, state.specWindowStart + 2);
  const canShiftLeft = state.specWindowStart > 0;
  const canShiftRight = state.specWindowStart < plan.specLevels.length - 2;

  const shiftSpec = (dir: -1 | 1) => {
    const nextStart = state.specWindowStart + dir;
    if (nextStart < 0 || nextStart > plan.specLevels.length - 2) return;
    // Keep selection valid inside the visible window.
    const nextWindow = [nextStart, nextStart + 1];
    const selectedStays = nextWindow.includes(state.specSelectedIdx);
    onChange({
      specWindowStart: nextStart,
      specSelectedIdx: selectedStays ? state.specSelectedIdx : nextWindow[dir === 1 ? 0 : 1],
    });
  };

  const toggleOption = (id: string) => {
    const has = state.selectedOptionIds.includes(id);
    onChange({
      selectedOptionIds: has
        ? state.selectedOptionIds.filter((x) => x !== id)
        : [...state.selectedOptionIds, id],
    });
  };

  const selectedOptionsCount = state.selectedOptionIds.length;
  const buildInfo = outputProvenance(plan, state, AI);
  const espInfo = outputProvenance(plan, state, espProvenance(plan, compOverrides));

  return (
    <div className={`sc-plan-card ${isSelected ? 'sc-plan-card--selected' : ''}`}>
      {/* Rendering */}
      <RenderingPlaceholder planName={plan.name} elevationName={elevation.name} />

      {/* Header */}
      <div className="sc-plan-card-header">
        <div>
          <div className="sc-plan-name-row">
            <span className="sc-plan-name">{plan.name}</span>
            <span className="sc-plan-code">{plan.code}</span>
          </div>
          <div className="sc-plan-specs">
            {plan.beds}bd / {plan.baths}ba &nbsp;·&nbsp; {plan.stories} stories &nbsp;·&nbsp; {plan.elevations.length} elevations
          </div>
        </div>
        <div className="sc-plan-card-badges">
          {isRecommended && <span className="sc-recommended-badge">Recommended</span>}
          <button
            className={`sc-select-btn ${isSelected ? 'sc-select-btn--active' : ''}`}
            onClick={onToggleSelect}
          >
            {isSelected ? '✓ Selected' : 'Select'}
          </button>
        </div>
      </div>

      {/* Selectors */}
      <div className="sc-selectors">
        <div className="sc-selector">
          <label className="sc-selector-label">Elevation</label>
          <select
            className="sc-select"
            value={state.elevationIdx}
            onChange={(e) => onChange({ elevationIdx: Number(e.target.value) })}
          >
            {plan.elevations.map((el, i) => (
              <option key={el.name} value={i}>
                {el.name} — {el.sqft.toLocaleString()} sqft
              </option>
            ))}
          </select>
          <div className="sc-selector-hint">
            <ProvenanceValue info={elevationProvenance(plan, state)}>
              {elevation.widthFt.toFixed(2)}ft W × {elevation.depthFt.toFixed(2)}ft D
            </ProvenanceValue>
          </div>
        </div>

        <div className="sc-selector">
          <label className="sc-selector-label">Spec Level</label>
          <div className="sc-spec-toggle">
            <button
              type="button"
              className="sc-spec-arrow"
              onClick={() => shiftSpec(-1)}
              disabled={!canShiftLeft}
              aria-label="Show lower spec level"
            >
              ‹
            </button>
            {specVisible.map((s) => {
              const globalIdx = plan.specLevels.indexOf(s);
              const selected = globalIdx === state.specSelectedIdx;
              return (
                <button
                  key={s.level}
                  type="button"
                  className={`sc-spec-chip ${selected ? 'sc-spec-chip--selected' : ''}`}
                  onClick={() => onChange({ specSelectedIdx: globalIdx })}
                >
                  <span className="sc-spec-chip-name">{s.level}</span>
                  <span className="sc-spec-chip-price">${Math.round(s.costPerSqft)}/sqft</span>
                </button>
              );
            })}
            <button
              type="button"
              className="sc-spec-arrow"
              onClick={() => shiftSpec(1)}
              disabled={!canShiftRight}
              aria-label="Show higher spec level"
            >
              ›
            </button>
          </div>
        </div>

        <div className="sc-selector">
          <label className="sc-selector-label">Design Package</label>
          <div className="sc-pill-row">
            {DESIGN_PACKAGES.map((pkg) => (
              <button
                key={pkg}
                type="button"
                className={`sc-pill ${state.designPkg === pkg ? 'sc-pill--selected' : ''}`}
                onClick={() => onChange({ designPkg: pkg })}
              >
                {pkg}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Financials */}
      <div className="sc-plan-financials">
        <div className="sc-fin-row sc-fin-row--primary">
          <span>Sellable Sqft</span>
          <span><ProvenanceValue info={buildInfo}>{fin.sqft.toLocaleString()} sqft</ProvenanceValue></span>
        </div>
        <div className="sc-fin-row sc-fin-row--primary">
          <span>Est. Sale Price</span>
          <span><ProvenanceValue info={espInfo}>{usd(fin.estSalePrice)}</ProvenanceValue></span>
        </div>
        <div className="sc-fin-divider" />
        <div className="sc-fin-row">
          <span>Build Cost</span>
          <span><ProvenanceValue info={buildInfo}>{usd(fin.buildCost)}</ProvenanceValue></span>
        </div>
        <div className="sc-fin-row sc-fin-row--sub">
          <span>Financing (6%)</span>
          <span><ProvenanceValue info={buildInfo}>{usd(fin.financingCost)}</ProvenanceValue></span>
        </div>
        <div className="sc-fin-row sc-fin-row--sub">
          <span>Transaction (3%)</span>
          <span><ProvenanceValue info={espInfo}>{usd(fin.transactionCosts)}</ProvenanceValue></span>
        </div>
        <div className="sc-fin-row sc-fin-row--sub">
          <span>Homebound Fee (5%)</span>
          <span><ProvenanceValue info={espInfo}>{usd(fin.homeboundFee)}</ProvenanceValue></span>
        </div>
        <div className="sc-fin-row sc-fin-row--total">
          <span>Total Cost Ex-Land</span>
          <span><ProvenanceValue info={espInfo}>{usd(fin.totalCostExLand)}</ProvenanceValue></span>
        </div>
        <div className="sc-fin-divider" />
        <div className="sc-fin-row sc-fin-row--highlight">
          <span>Max Lot Offer</span>
          <span><ProvenanceValue info={espInfo}>{usd(fin.maxLotOffer)}</ProvenanceValue></span>
        </div>
        <div className={`sc-fin-row sc-fin-row--margin ${fin.projectedMargin < 0 ? 'sc-fin-row--margin-neg' : ''}`}>
          <span>Margin Before Land</span>
          <span><ProvenanceValue info={espInfo}>{pct(fin.projectedMargin)}</ProvenanceValue></span>
        </div>
      </div>

      {/* Add-ons */}
      <div className="sc-addons">
        <button
          type="button"
          className="sc-addons-toggle"
          onClick={() => onChange({ optionsExpanded: !state.optionsExpanded })}
          aria-expanded={state.optionsExpanded}
        >
          <span className="sc-addons-toggle-caret">{state.optionsExpanded ? '▾' : '▸'}</span>
          <span>
            {selectedOptionsCount > 0
              ? `Add-Ons (${selectedOptionsCount} selected · ${ADD_ON_OPTIONS.length} available)`
              : `View Add-Ons (${ADD_ON_OPTIONS.length} available)`}
          </span>
        </button>

        {state.optionsExpanded && (
          <div className="sc-addons-body">
            {selectedOptionsCount > 0 && (
              <div className="sc-addons-summary">
                Selected options:{' '}
                <strong><ProvenanceValue info={SCENARIO_INPUT}>+{usd(fin.optionsCost)}</ProvenanceValue></strong>
              </div>
            )}
            <ul className="sc-addons-list">
              {ADD_ON_OPTIONS.map((o) => {
                const checked = state.selectedOptionIds.includes(o.id);
                return (
                  <li key={o.id} className={`sc-addon-row ${checked ? 'sc-addon-row--on' : ''}`}>
                    <label className="sc-addon-label">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOption(o.id)}
                        className="sc-addon-check"
                      />
                      <span className="sc-addon-name">{o.name}</span>
                    </label>
                    <div className="sc-addon-meta">
                      <span className={`sc-addon-type sc-addon-type--${o.type === 'Structural' ? 'struct' : 'addon'}`}>
                        {o.type}
                      </span>
                      <span className="sc-addon-cost">+{usd(o.cost)}</span>
                      <span className="sc-addon-sqft">
                        {o.sqftDelta > 0 ? `+${o.sqftDelta} sqft` : 'no sqft change'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pro Forma Table ────────────────────────────────────────────
interface ProFormaRow {
  label: string;
  key: keyof PlanFinancials | 'compPerSqft' | 'landPrice';
  format: (n: number) => string;
  style?: string;
  /** Provenance while the plan card is on the AI's draft scenario. */
  provenance: (plan: Plan, overrides: CompOverrides) => ProvenanceInfo;
  /** Not changed by the card's scenario inputs, so always the base provenance. */
  fixed?: boolean;
}

const aiRow = () => AI;

const PROFORMA_ROWS: ProFormaRow[] = [
  { label: 'Sellable Sqft',        key: 'sqft',             format: (n) => n.toLocaleString() + ' sqft', style: 'primary', provenance: aiRow },
  { label: 'Comp ESP / Sqft',      key: 'compPerSqft',      format: (n) => usd(n) + '/sqft',              style: 'sub', provenance: compProvenance, fixed: true },
  { label: 'Est. Sale Price',      key: 'estSalePrice',     format: usd,                                  style: 'primary', provenance: espProvenance },
  { label: 'Build Cost',           key: 'buildCost',        format: usd,                                  provenance: aiRow },
  { label: 'Options',              key: 'optionsCost',      format: (n) => (n > 0 ? '+' + usd(n) : '—'), style: 'sub', provenance: () => SCENARIO_INPUT, fixed: true },
  { label: 'Financing (6%)',       key: 'financingCost',    format: usd,                                  style: 'sub', provenance: aiRow },
  { label: 'Transaction (3%)',     key: 'transactionCosts', format: usd,                                  style: 'sub', provenance: espProvenance },
  { label: 'Homebound Fee (5%)',   key: 'homeboundFee',     format: usd,                                  style: 'sub', provenance: espProvenance },
  { label: 'Total Cost Ex-Land',   key: 'totalCostExLand',  format: usd,                                  style: 'total', provenance: espProvenance },
  { label: 'Max Lot Offer',        key: 'maxLotOffer',      format: usd,                                  style: 'highlight', provenance: espProvenance },
  { label: 'Land Price',           key: 'landPrice',        format: usd,                                  provenance: () => SFDC, fixed: true },
  { label: 'Margin Before Land',   key: 'projectedMargin',  format: pct,                                  style: 'margin', provenance: espProvenance },
];

interface ExtraRow {
  key: string;
  label: ReactNode;
  value: string;          // selected plan only
  provenance: ProvenanceInfo;
  style?: string;
}

function ProFormaTable({
  plans,
  states,
  financials,
  recommendedId,
  selectedId,
  landPrice,
  compOverrides,
  extraRows = [],
}: {
  plans: Plan[];
  states: PlanCardState[];
  financials: PlanFinancials[];
  recommendedId: string;
  selectedId: string;
  landPrice?: number;
  compOverrides: CompOverrides;
  extraRows?: ExtraRow[];
}) {
  const rows = PROFORMA_ROWS.filter((row) => row.key !== 'landPrice' || landPrice !== undefined);
  const cellValue = (row: ProFormaRow, fin: PlanFinancials): number => {
    if (row.key === 'compPerSqft') return fin.estSalePrice / fin.sqft;
    if (row.key === 'landPrice') return landPrice!;
    return fin[row.key];
  };
  const cellInfo = (row: ProFormaRow, i: number): ProvenanceInfo => {
    const base = row.provenance(plans[i], compOverrides);
    return row.fixed ? base : outputProvenance(plans[i], states[i], base);
  };

  return (
    <div className="sc-table-wrapper">
      <table className="sc-table">
        <thead>
          <tr>
            <th className="sc-table-label-col">Line Item</th>
            {plans.map((p) => (
              <th key={p.id} className={p.id === selectedId ? 'sc-table-col--selected' : ''}>
                {p.name}
                {p.id === recommendedId && <span className="sc-table-rec-dot"> ★</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.style ? `sc-table-row--${row.style}` : ''}>
              <td className="sc-table-label">{row.label}</td>
              {financials.map((fin, i) => {
                const value = cellValue(row, fin);
                return (
                  <td
                    key={plans[i].id}
                    className={plans[i].id === selectedId ? 'sc-table-col--selected' : ''}
                  >
                    {row.key === 'optionsCost' && value === 0 ? (
                      row.format(value)
                    ) : (
                      <ProvenanceValue info={cellInfo(row, i)}>{row.format(value)}</ProvenanceValue>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {extraRows.map((row) => (
            <tr key={row.key} className={`sc-table-row--adu ${row.style ? `sc-table-row--${row.style}` : ''}`}>
              <td className="sc-table-label">{row.label}</td>
              {plans.map((p) => (
                <td key={p.id} className={p.id === selectedId ? 'sc-table-col--selected' : ''}>
                  {p.id === selectedId ? <ProvenanceValue info={row.provenance}>{row.value}</ProvenanceValue> : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sensitivity Panel ──────────────────────────────────────────
function SensitivityPanel({
  plan, fin, buildInfo, espInfo,
}: {
  plan: Plan;
  fin: PlanFinancials;
  buildInfo: ProvenanceInfo;
  espInfo: ProvenanceInfo;
}) {
  const scenarios = [
    {
      label: 'ESP −5%',
      paramLabel: 'Adjusted ESP',
      paramValue: fin.estSalePrice * 0.95,
      build: fin.buildCost,
      esp: fin.estSalePrice * 0.95,
    },
    {
      label: 'ESP −10%',
      paramLabel: 'Adjusted ESP',
      paramValue: fin.estSalePrice * 0.90,
      build: fin.buildCost,
      esp: fin.estSalePrice * 0.90,
    },
    {
      label: 'Build Cost +3%',
      paramLabel: 'Adjusted Build Cost',
      paramValue: fin.buildCost * 1.03,
      build: fin.buildCost * 1.03,
      esp: fin.estSalePrice,
    },
    {
      label: 'Build Cost +5%',
      paramLabel: 'Adjusted Build Cost',
      paramValue: fin.buildCost * 1.05,
      build: fin.buildCost * 1.05,
      esp: fin.estSalePrice,
    },
  ];

  return (
    <div className="sc-sensitivity">
      <div className="sc-sensitivity-header">
        <h3 className="sc-sens-panel-title">Sensitivity Analysis — {plan.name}</h3>
        <p className="sc-sens-panel-sub">
          Based on live selection: <ProvenanceValue info={buildInfo}>{fin.sqft.toLocaleString()} sqft</ProvenanceValue> ·
          ESP <ProvenanceValue info={espInfo}>{usd(fin.estSalePrice)}</ProvenanceValue> ·
          Build <ProvenanceValue info={buildInfo}>{usd(fin.buildCost)}</ProvenanceValue>
        </p>
      </div>
      <div className="sc-sensitivity-grid">
        {scenarios.map((s) => {
          const financing = s.build * 0.06;
          const txn = s.esp * 0.03;
          const fee = s.esp * 0.05;
          const totalCost = s.build + financing + txn + fee;
          const maxOffer = s.esp - totalCost;
          const negative = maxOffer < 0;
          return (
            <div
              key={s.label}
              className={`sc-sensitivity-card ${negative ? 'sc-sensitivity-card--breach' : ''}`}
            >
              <div className="sc-sens-label">{s.label}</div>
              <div className="sc-sens-param">
                <span className="sc-sens-param-key">{s.paramLabel}</span>
                <span className="sc-sens-param-val">
                  <ProvenanceValue info={SCENARIO_OUTPUT}>{usd(s.paramValue)}</ProvenanceValue>
                </span>
              </div>
              <div className="sc-sens-offer-label">Max Lot Offer</div>
              <div className={`sc-sens-offer ${negative ? 'sc-sens-offer--negative' : ''}`}>
                <ProvenanceValue info={SCENARIO_OUTPUT}>{usd(maxOffer)}</ProvenanceValue>
              </div>
              {negative && <div className="sc-sens-breach">Margin floor breached</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Excluded Plans Section ─────────────────────────────────────
function ExcludedPlansSection({
  excluded,
}: {
  excluded: { plan: Plan; reason: FeasibilityReason }[];
}) {
  const [open, setOpen] = useState(false);
  if (excluded.length === 0) return null;

  return (
    <div className="sc-excluded">
      <button
        type="button"
        className="sc-excluded-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sc-excluded-caret">{open ? '▾' : '▸'}</span>
        <span>{excluded.length} plans excluded — lot constraints</span>
      </button>
      {open && (
        <ul className="sc-excluded-list">
          {excluded.map(({ plan, reason }) => (
            <li key={plan.id} className="sc-excluded-item">
              <div className="sc-excluded-item-main">
                <div className="sc-excluded-name">
                  {plan.name} <span className="sc-excluded-code">{plan.code}</span>
                </div>
                <div className="sc-excluded-meta">
                  {plan.beds}bd / {plan.baths}ba · Min lot {plan.minLotWidth}ft × {plan.minLotDepth}ft
                </div>
              </div>
              <div className="sc-excluded-reason">{feasibilityReasonLabel(plan, reason)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── ADU Section ────────────────────────────────────────────────
const signedUsd = (n: number) => (n < 0 ? '−' : '+') + usd(Math.abs(n));

interface AduImpact {
  name: string;           // ADU type name
  economics: AduEconomics;
  maxLotOffer: number;
  estSalePrice: number;
  projectedMargin: number;
}

/** Engine margin is max lot offer ÷ ESP; the ADU adds its net margin and uplift. */
function aduImpact(fin: PlanFinancials, name: string, economics: AduEconomics): AduImpact {
  const maxLotOffer = fin.maxLotOffer + economics.marginDelta;
  const estSalePrice = fin.estSalePrice + economics.uplift;
  return { name, economics, maxLotOffer, estSalePrice, projectedMargin: (maxLotOffer / estSalePrice) * 100 };
}

function VerdictChip({ economics }: { economics: AduEconomics }) {
  return economics.verdict === 'adds' ? (
    <span className="sc-adu-verdict sc-adu-verdict--adds">
      Adds <ProvenanceValue info={AI}>{usd(economics.marginDelta)}</ProvenanceValue> margin
    </span>
  ) : (
    <span className="sc-adu-verdict sc-adu-verdict--thin">
      Fits but thin · <ProvenanceValue info={AI}>{signedUsd(economics.marginDelta)}</ProvenanceValue>
    </span>
  );
}

function AduSection({
  market,
  lot,
  plan,
  elevationIdx,
  fin,
  finInfo,
  elevationInfo,
  addedTypeId,
  onAdd,
  onRemove,
}: {
  market: Market;
  lot: LotForFit;
  plan: Plan;
  elevationIdx: number;
  fin: PlanFinancials;
  finInfo: ProvenanceInfo;          // the plan's own max lot offer and margin
  elevationInfo: ProvenanceInfo;
  addedTypeId: string | null;
  onAdd: (typeId: string) => void;
  onRemove: () => void;
}) {
  const elevation = plan.elevations[elevationIdx];
  const evaluation = evaluateAdus(market, lot, elevation);
  const { geometry } = evaluation;
  const added = evaluation.offered ? evaluation.options.find((o) => o.type.id === addedTypeId && o.fits) : undefined;
  const impact = added && aduImpact(fin, added.type.name, added.economics);
  const e = added?.economics;

  return (
    <section className="sc-section">
      <div className="sc-section-header">
        <h2 className="sc-section-title">ADU — {market}</h2>
        {!evaluation.offered ? (
          <span className="sc-adu-verdict sc-adu-verdict--none">Not offered in this market</span>
        ) : e ? (
          <VerdictChip economics={e} />
        ) : (
          <span className="sc-section-caption">Add an ADU that fits to see its effect on the pro forma</span>
        )}
      </div>

      <div className="sc-adu-card">
        <p className="sc-adu-context">
          For <strong>{plan.name}</strong> ({elevation.name},{' '}
          <ProvenanceValue info={elevationInfo}>
            {elevation.widthFt.toFixed(1)} × {elevation.depthFt.toFixed(1)} ft
          </ProvenanceValue>):
          remaining buildable area <ProvenanceValue info={AI}>{geometry.remainingSqFt.toLocaleString()} sqft</ProvenanceValue>
          <span className="sc-adu-sep">·</span>
          rear yard <ProvenanceValue info={AI}>{geometry.rearYardFt} ft</ProvenanceValue>
          <span className="sc-adu-sep">·</span>
          flood zone <ProvenanceValue info={SFDC}>{lot.floodZone ? 'Yes' : 'No'}</ProvenanceValue>
        </p>

        {!evaluation.offered ? (
          <p className="sc-adu-reason">{evaluation.reason}</p>
        ) : (
          <>
            {evaluation.note && <p className="sc-adu-note">{evaluation.note}</p>}
            <ul className="sc-adu-list">
              {evaluation.options.map((o) => {
                const isAdded = o.type.id === added?.type.id;
                return (
                  <li key={o.type.id} className={`sc-adu-row ${o.fits ? '' : 'sc-adu-row--nofit'} ${isAdded ? 'sc-adu-row--added' : ''}`}>
                    <div className="sc-adu-type">
                      <span className="sc-adu-name">{o.type.name}</span>
                      <span className="sc-adu-size">
                        <ProvenanceValue info={AI}>{o.type.sqft.toLocaleString()} sqft</ProvenanceValue> ·{' '}
                        <ProvenanceValue info={AI}>{o.type.footprint.widthFt} × {o.type.footprint.depthFt} ft</ProvenanceValue> footprint
                      </span>
                    </div>
                    {o.fits ? (
                      <>
                        <span className="sc-adu-fit sc-adu-fit--yes">
                          <ProvenanceValue info={AI}>Fits</ProvenanceValue>
                        </span>
                        <VerdictChip economics={o.economics} />
                        {isAdded ? (
                          <button className="sc-adu-btn sc-adu-btn--added" onClick={onRemove}>✓ Added · Remove</button>
                        ) : (
                          <button className="sc-adu-btn" onClick={() => onAdd(o.type.id)}>Add</button>
                        )}
                      </>
                    ) : (
                      <span className="sc-adu-fit sc-adu-fit--no">
                        Doesn’t fit: <ProvenanceValue info={AI}>{o.reason}</ProvenanceValue>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {addedTypeId && !added && (
              <p className="sc-adu-note">The ADU you added doesn’t fit {plan.name} with this elevation, so it’s left out.</p>
            )}
          </>
        )}

        {impact && e && (
          <div className="sc-adu-impact">
            <dl className="sc-adu-lines">
              <dt>ADU build (<ProvenanceValue info={AI}>{e.sqft.toLocaleString()} sqft</ProvenanceValue>)</dt>
              <dd><ProvenanceValue info={AI}>{usd(e.build)}</ProvenanceValue></dd>
              <dt>Permits &amp; fees</dt>
              <dd><ProvenanceValue info={AI}>{usd(e.fees)}</ProvenanceValue></dd>
              {e.flood > 0 && (
                <>
                  <dt>Flood-zone elevation</dt>
                  <dd><ProvenanceValue info={AI}>{usd(e.flood)}</ProvenanceValue></dd>
                </>
              )}
              <dt>Carry (<ProvenanceValue info={ASSUMPTION}>{CARRY_COST_PCT}%</ProvenanceValue> of build)</dt>
              <dd><ProvenanceValue info={AI}>{usd(e.carry)}</ProvenanceValue></dd>
              <dt>ESP uplift</dt>
              <dd><ProvenanceValue info={AI}>+{usd(e.uplift)}</ProvenanceValue></dd>
              <dt>Selling costs (<ProvenanceValue info={ASSUMPTION}>{SELLING_COST_PCT}%</ProvenanceValue> of uplift)</dt>
              <dd><ProvenanceValue info={AI}>{usd(e.selling)}</ProvenanceValue></dd>
              <dt className="sc-adu-total">Change in margin</dt>
              <dd className="sc-adu-total"><ProvenanceValue info={AI}>{signedUsd(e.marginDelta)}</ProvenanceValue></dd>
            </dl>
            <div className="sc-adu-stats">
              <div>
                <span className="sc-adu-stat-label">Max lot offer</span>
                <span className="sc-adu-stat-value">
                  <ProvenanceValue info={finInfo}>{usd(fin.maxLotOffer)}</ProvenanceValue> →{' '}
                  <ProvenanceValue info={SCENARIO_OUTPUT}>{usd(impact.maxLotOffer)}</ProvenanceValue>
                </span>
              </div>
              <div>
                <span className="sc-adu-stat-label">Margin before land</span>
                <span className="sc-adu-stat-value">
                  <ProvenanceValue info={finInfo}>{pct(fin.projectedMargin)}</ProvenanceValue> →{' '}
                  <ProvenanceValue info={SCENARIO_OUTPUT}>{pct(impact.projectedMargin)}</ProvenanceValue>
                </span>
              </div>
              <div>
                <span className="sc-adu-stat-label">Schedule</span>
                <span className="sc-adu-stat-value">
                  <ProvenanceValue info={AI}>+{e.addedDays} days</ProvenanceValue>
                </span>
              </div>
            </div>
          </div>
        )}
        <p className="sc-adu-rule">{aduRuleText(market)}</p>
      </div>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function ScenarioEngine() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const opp = id ? findOpportunity(id) : null;
  const asset = ASSETS.find((a) => a.id === id);
  const landPrice = asset?.underwrite?.landPrice;
  const draft = id ? getAIDraft(id) : undefined;
  const market: Market = asset?.market ?? 'DFW';
  const lot: LotForFit = {
    ...(draft?.lot ?? FALLBACK_LOT),
    lotSqFt: asset?.lotSqFt ?? 0,
    floodZone: asset?.floodZone ?? false,
  };
  const feasibilityLot: FeasibilityLot = { widthFt: lot.widthFt, depthFt: lot.depthFt };

  // DFW uses the full plan library; other markets use the plans already
  // underwritten there. Lots with an AI draft (else an underwrite) are priced
  // to it; see data/scenarioPricing.ts. A handful of plans, so no memoization.
  const calibration = pricingCalibration(id);
  const compOverrides: CompOverrides = compOverridesFor(id);
  const marketPlans = lotPlans(id, market);

  // Compute feasibility for every plan.
  const feasibilityMap = marketPlans.map((plan) => ({
    plan,
    reason: checkFeasibility(plan, feasibilityLot),
  }));

  const feasiblePlans = feasibilityMap.filter((f) => f.reason === 'ok').map((f) => f.plan);
  const excludedPlans = feasibilityMap.filter((f) => f.reason !== 'ok');

  // Persistent state per feasible plan card. Feasible plan set is derived from
  // the URL id and is stable for the lifetime of this mount.
  const [cardStates, setCardStates] = useState<Record<string, PlanCardState>>(() => {
    const initial: Record<string, PlanCardState> = {};
    for (const plan of feasiblePlans) initial[plan.id] = initialCardState(plan);
    return initial;
  });

  const financials = feasiblePlans.map((plan) => {
    const s = cardStates[plan.id] ?? initialCardState(plan);
    return calcFinancials({
      plan: withOverrides(plan, compOverrides),
      elevationIdx: s.elevationIdx,
      specLevelIdx: s.specSelectedIdx,
      selectedOptionIds: s.selectedOptionIds,
    });
  });

  // Recommended = plan with highest projected margin.
  const recommendedIdx = financials.reduce(
    (best, f, i) => (f.projectedMargin > financials[best].projectedMargin ? i : best),
    0,
  );
  const recommendedPlan = feasiblePlans[recommendedIdx];
  const recommendedFin = financials[recommendedIdx];

  // Analyst override; null means "use the recommended plan".
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPlan = feasiblePlans.find((p) => p.id === selectedId) ?? recommendedPlan;
  const selectedFin = financials[feasiblePlans.indexOf(selectedPlan)];

  // One ADU at a time, on the selected plan.
  const [aduTypeId, setAduTypeId] = useState<string | null>(null);
  const selectedState = selectedPlan ? cardStates[selectedPlan.id] ?? initialCardState(selectedPlan) : undefined;
  const aduEvaluation = selectedPlan && selectedState
    ? evaluateAdus(market, lot, selectedPlan.elevations[selectedState.elevationIdx])
    : undefined;
  const addedAdu = aduEvaluation?.offered
    ? aduEvaluation.options.find((o) => o.type.id === aduTypeId && o.fits)
    : undefined;
  const addedImpact = addedAdu && selectedFin
    ? aduImpact(selectedFin, addedAdu.type.name, addedAdu.economics)
    : undefined;
  // The ADU's own economics are AI modeling; totals with the analyst's added
  // ADU are scenario outputs.
  const aduRows: ExtraRow[] = addedImpact
    ? [
        {
          key: 'adu-cost',
          label: (
            <>
              ADU: {addedImpact.name}{' '}
              <ProvenanceValue info={AI}>{addedImpact.economics.sqft.toLocaleString()} sqft</ProvenanceValue>
            </>
          ),
          value: `${usd(addedImpact.economics.hardCost)} cost`,
          provenance: AI,
          style: 'sub',
        },
        { key: 'adu-uplift', label: 'ADU ESP uplift', value: '+' + usd(addedImpact.economics.uplift), provenance: AI, style: 'sub' },
        { key: 'adu-margin-delta', label: 'ADU change in margin', value: signedUsd(addedImpact.economics.marginDelta), provenance: AI },
        { key: 'adu-max-lot', label: 'Max Lot Offer with ADU', value: usd(addedImpact.maxLotOffer), provenance: SCENARIO_OUTPUT, style: 'highlight' },
        { key: 'adu-margin', label: 'Margin Before Land with ADU', value: pct(addedImpact.projectedMargin), provenance: SCENARIO_OUTPUT, style: 'margin' },
      ]
    : [];
  const cardStateList = feasiblePlans.map((plan) => cardStates[plan.id] ?? initialCardState(plan));
  const scenarioInfo = (plan: Plan, state: PlanCardState) => ({
    build: outputProvenance(plan, state, AI),
    esp: outputProvenance(plan, state, espProvenance(plan, compOverrides)),
  });
  const recommendedInfo = recommendedPlan
    ? scenarioInfo(recommendedPlan, cardStateList[recommendedIdx])
    : undefined;
  const selectedInfo = selectedPlan && selectedState ? scenarioInfo(selectedPlan, selectedState) : undefined;

  const patchCard = (planId: string, patch: Partial<PlanCardState>) => {
    setCardStates((prev) => ({
      ...prev,
      [planId]: { ...prev[planId], ...patch },
    }));
  };

  if (!opp) {
    return (
      <div className="sc-page">
        <p className="sc-not-found">
          Lot not found.{' '}
          <button onClick={() => navigate('/underwrite')}>← Back to Underwrite</button>
        </p>
      </div>
    );
  }

  return (
    <div className="sc-page">
      {/* Breadcrumb */}
      <div className="sc-breadcrumb">
        <button className="sc-breadcrumb-link" onClick={() => navigate('/underwrite')}>
          Underwrite
        </button>
        <span className="sc-breadcrumb-sep">›</span>
        <button className="sc-breadcrumb-link" onClick={() => navigate(`/underwrite/${opp.id}`)}>
          {opp.id}
        </button>
        <span className="sc-breadcrumb-sep">›</span>
        <span className="sc-breadcrumb-current">Plan Selection</span>
      </div>

      {/* Page header */}
      <div className="sc-page-header">
        <div>
          <h1 className="sc-page-title">Plan Selection &amp; Scenario Engine</h1>
          <p className="sc-page-subtitle">
            {opp.address}, {opp.city} {opp.state} &nbsp;·&nbsp; {opp.market} &nbsp;·&nbsp;{' '}
            <ProvenanceValue info={SFDC}>{opp.lotSqFt.toLocaleString()} sqft</ProvenanceValue> lot (
            <ProvenanceValue info={SFDC}>{lot.widthFt}ft × {lot.depthFt}ft</ProvenanceValue>)
            {asset && (
              <>
                &nbsp;·&nbsp; <AssetLink id={asset.id} record />
              </>
            )}
          </p>
        </div>
        <div className="sc-header-summary">
          <div className="sc-header-summary-item">
            <span className="sc-header-summary-label">Feasible Plans</span>
            <span className="sc-header-summary-value">
              {feasiblePlans.length} of {marketPlans.length}
            </span>
          </div>
          {recommendedPlan && recommendedInfo && (
            <div className="sc-header-summary-item">
              <span className="sc-header-summary-label">Top Margin Before Land</span>
              <span className="sc-header-summary-value sc-header-summary-value--margin">
                {recommendedPlan.name} ·{' '}
                <ProvenanceValue info={recommendedInfo.esp}>{pct(recommendedFin.projectedMargin)}</ProvenanceValue>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Plan cards */}
      <section className="sc-section">
        <div className="sc-section-header">
          <h2 className="sc-section-title">Feasible Plans — {market} Market</h2>
          <span className="sc-section-caption">
            Filtered by lot: <ProvenanceValue info={SFDC}>{lot.widthFt}ft W × {lot.depthFt}ft D</ProvenanceValue>
            {calibration && (draft ? ' · priced to this lot’s AI draft' : ' · priced to this lot’s underwrite')}
          </span>
        </div>
        <div className={`sc-plan-grid sc-plan-grid--n${feasiblePlans.length}`}>
          {feasiblePlans.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              state={cardStates[plan.id] ?? initialCardState(plan)}
              fin={financials[i]}
              isRecommended={plan.id === recommendedPlan?.id}
              isSelected={plan.id === selectedPlan?.id}
              compOverrides={compOverrides}
              onToggleSelect={() => setSelectedId(plan.id === selectedId ? null : plan.id)}
              onChange={(patch) => patchCard(plan.id, patch)}
            />
          ))}
        </div>
        {feasiblePlans.length > 0 && (
          <div className="sc-plan-action-row">
            <button
              className="sc-confirm-btn"
              onClick={() => navigate(`/underwrite/${opp.id}/scenario/comps?plan=${selectedPlan.id}`)}
            >
              Confirm {selectedPlan?.name} &amp; Proceed
            </button>
          </div>
        )}
      </section>

      {/* ADU */}
      {selectedPlan && selectedState && selectedFin && selectedInfo && (
        <AduSection
          market={market}
          lot={lot}
          plan={selectedPlan}
          elevationIdx={selectedState.elevationIdx}
          fin={selectedFin}
          finInfo={selectedInfo.esp}
          elevationInfo={elevationProvenance(selectedPlan, selectedState)}
          addedTypeId={aduTypeId}
          onAdd={setAduTypeId}
          onRemove={() => setAduTypeId(null)}
        />
      )}

      {/* Pro forma */}
      {feasiblePlans.length > 0 && (
        <section className="sc-section">
          <h2 className="sc-section-title">Pro Forma Comparison</h2>
          <ProvenanceLegend />
          <ProFormaTable
            plans={feasiblePlans}
            states={cardStateList}
            financials={financials}
            recommendedId={recommendedPlan.id}
            selectedId={selectedPlan.id}
            landPrice={landPrice}
            compOverrides={compOverrides}
            extraRows={aduRows}
          />
        </section>
      )}

      {/* Sensitivity */}
      {selectedPlan && selectedInfo && (
        <section className="sc-section">
          <SensitivityPanel
            plan={selectedPlan}
            fin={selectedFin}
            buildInfo={selectedInfo.build}
            espInfo={selectedInfo.esp}
          />
        </section>
      )}

      {/* Excluded plans */}
      <section className="sc-section">
        <ExcludedPlansSection excluded={excludedPlans} />
      </section>
    </div>
  );
}

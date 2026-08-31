import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockOpportunities } from '../data/opportunities';
import {
  DFW_PLANS,
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

// ── Opportunity → lot dimensions (BOOL-001 = 52 × 120) ─────────
const LOT_DIMS: Record<string, FeasibilityLot> = {
  'BOOL-001': { widthFt: 52, depthFt: 120 },
  'BOOL-002': { widthFt: 58, depthFt: 122 },
  'BOOL-003': { widthFt: 48, depthFt: 121 },
  'BOOL-004': { widthFt: 55, depthFt: 118 },
};

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
  onChange: (patch: Partial<PlanCardState>) => void;
}

function PlanCard({ plan, state, fin, isRecommended, onChange }: PlanCardProps) {
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

  return (
    <div className={`sc-plan-card ${isRecommended ? 'sc-plan-card--recommended' : ''}`}>
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
        {isRecommended && <span className="sc-recommended-badge">Recommended</span>}
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
            {elevation.widthFt.toFixed(2)}ft W × {elevation.depthFt.toFixed(2)}ft D
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
                  <span className="sc-spec-chip-price">${s.costPerSqft}/sqft</span>
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
          <span>{fin.sqft.toLocaleString()} sqft</span>
        </div>
        <div className="sc-fin-row sc-fin-row--primary">
          <span>Est. Sale Price</span>
          <span>{usd(fin.estSalePrice)}</span>
        </div>
        <div className="sc-fin-divider" />
        <div className="sc-fin-row">
          <span>Build Cost</span>
          <span>{usd(fin.buildCost)}</span>
        </div>
        <div className="sc-fin-row sc-fin-row--sub">
          <span>Financing (6%)</span>
          <span>{usd(fin.financingCost)}</span>
        </div>
        <div className="sc-fin-row sc-fin-row--sub">
          <span>Transaction (3%)</span>
          <span>{usd(fin.transactionCosts)}</span>
        </div>
        <div className="sc-fin-row sc-fin-row--sub">
          <span>Homebound Fee (5%)</span>
          <span>{usd(fin.homeboundFee)}</span>
        </div>
        <div className="sc-fin-row sc-fin-row--total">
          <span>Total Cost Ex-Land</span>
          <span>{usd(fin.totalCostExLand)}</span>
        </div>
        <div className="sc-fin-divider" />
        <div className="sc-fin-row sc-fin-row--highlight">
          <span>Max Lot Offer</span>
          <span>{usd(fin.maxLotOffer)}</span>
        </div>
        <div className={`sc-fin-row sc-fin-row--margin ${fin.projectedMargin < 0 ? 'sc-fin-row--margin-neg' : ''}`}>
          <span>Projected Margin</span>
          <span>{pct(fin.projectedMargin)}</span>
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
                Selected options: <strong>+{usd(fin.optionsCost)}</strong>
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
  key: keyof PlanFinancials;
  format: (n: number) => string;
  style?: string;
}

const PROFORMA_ROWS: ProFormaRow[] = [
  { label: 'Sellable Sqft',        key: 'sqft',             format: (n) => n.toLocaleString() + ' sqft', style: 'primary' },
  { label: 'Est. Sale Price',      key: 'estSalePrice',     format: usd,                                  style: 'primary' },
  { label: 'Build Cost',           key: 'buildCost',        format: usd },
  { label: 'Options',              key: 'optionsCost',      format: (n) => (n > 0 ? '+' + usd(n) : '—'), style: 'sub' },
  { label: 'Financing (6%)',       key: 'financingCost',    format: usd,                                  style: 'sub' },
  { label: 'Transaction (3%)',     key: 'transactionCosts', format: usd,                                  style: 'sub' },
  { label: 'Homebound Fee (5%)',   key: 'homeboundFee',     format: usd,                                  style: 'sub' },
  { label: 'Total Cost Ex-Land',   key: 'totalCostExLand',  format: usd,                                  style: 'total' },
  { label: 'Max Lot Offer',        key: 'maxLotOffer',      format: usd,                                  style: 'highlight' },
  { label: 'Projected Margin',     key: 'projectedMargin',  format: pct,                                  style: 'margin' },
];

function ProFormaTable({
  plans,
  financials,
  recommendedId,
}: {
  plans: Plan[];
  financials: PlanFinancials[];
  recommendedId: string;
}) {
  return (
    <div className="sc-table-wrapper">
      <table className="sc-table">
        <thead>
          <tr>
            <th className="sc-table-label-col">Line Item</th>
            {plans.map((p) => (
              <th key={p.id} className={p.id === recommendedId ? 'sc-table-col--recommended' : ''}>
                {p.name}
                {p.id === recommendedId && <span className="sc-table-rec-dot"> ★</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PROFORMA_ROWS.map((row) => (
            <tr key={row.key} className={row.style ? `sc-table-row--${row.style}` : ''}>
              <td className="sc-table-label">{row.label}</td>
              {financials.map((fin, i) => (
                <td
                  key={plans[i].id}
                  className={plans[i].id === recommendedId ? 'sc-table-col--recommended' : ''}
                >
                  {row.format(fin[row.key] as number)}
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
function SensitivityPanel({ plan, fin }: { plan: Plan; fin: PlanFinancials }) {
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
          Based on live selection: {fin.sqft.toLocaleString()} sqft ·
          ESP {usd(fin.estSalePrice)} · Build {usd(fin.buildCost)}
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
                <span className="sc-sens-param-val">{usd(s.paramValue)}</span>
              </div>
              <div className="sc-sens-offer-label">Max Lot Offer</div>
              <div className={`sc-sens-offer ${negative ? 'sc-sens-offer--negative' : ''}`}>
                {usd(maxOffer)}
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

// ── Page ───────────────────────────────────────────────────────
export default function ScenarioEngine() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const opp = id ? mockOpportunities.find((o) => o.id === id) : null;
  const lot: FeasibilityLot = (id && LOT_DIMS[id]) || { widthFt: 52, depthFt: 120 };

  // Compute feasibility for every plan.
  const feasibilityMap = useMemo(() => {
    return DFW_PLANS.map((plan) => ({
      plan,
      reason: checkFeasibility(plan, lot),
    }));
  }, [lot]);

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
      plan,
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
          Opportunity not found.{' '}
          <button onClick={() => navigate('/')}>← Back to Queue</button>
        </p>
      </div>
    );
  }

  return (
    <div className="sc-page">
      {/* Breadcrumb */}
      <div className="sc-breadcrumb">
        <button className="sc-breadcrumb-link" onClick={() => navigate('/')}>
          Opportunity Queue
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
            {opp.lotSqFt.toLocaleString()} sqft lot ({lot.widthFt}ft × {lot.depthFt}ft)
          </p>
        </div>
        <div className="sc-header-summary">
          <div className="sc-header-summary-item">
            <span className="sc-header-summary-label">Feasible Plans</span>
            <span className="sc-header-summary-value">
              {feasiblePlans.length} of {DFW_PLANS.length}
            </span>
          </div>
          {recommendedPlan && (
            <div className="sc-header-summary-item">
              <span className="sc-header-summary-label">Top Margin</span>
              <span className="sc-header-summary-value sc-header-summary-value--margin">
                {recommendedPlan.name} · {pct(recommendedFin.projectedMargin)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Plan cards */}
      <section className="sc-section">
        <div className="sc-section-header">
          <h2 className="sc-section-title">Feasible Plans — DFW Market</h2>
          <span className="sc-section-caption">
            Filtered by lot: {lot.widthFt}ft W × {lot.depthFt}ft D
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
              onChange={(patch) => patchCard(plan.id, patch)}
            />
          ))}
        </div>
        {feasiblePlans.length > 0 && (
          <div className="sc-plan-action-row">
            <button
              className="sc-confirm-btn"
              onClick={() => navigate(`/underwrite/${opp.id}/scenario/comps`)}
            >
              Confirm {recommendedPlan?.name} &amp; Proceed
            </button>
          </div>
        )}
      </section>

      {/* Pro forma */}
      {feasiblePlans.length > 0 && (
        <section className="sc-section">
          <h2 className="sc-section-title">Pro Forma Comparison</h2>
          <ProFormaTable
            plans={feasiblePlans}
            financials={financials}
            recommendedId={recommendedPlan.id}
          />
        </section>
      )}

      {/* Sensitivity */}
      {recommendedPlan && (
        <section className="sc-section">
          <SensitivityPanel plan={recommendedPlan} fin={recommendedFin} />
        </section>
      )}

      {/* Excluded plans */}
      <section className="sc-section">
        <ExcludedPlansSection excluded={excludedPlans} />
      </section>
    </div>
  );
}

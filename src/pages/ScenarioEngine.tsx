import { useParams, useNavigate } from 'react-router-dom';
import { mockOpportunities } from '../data/opportunities';
import { DFW_PLANS, calcPlanFinancials, calcFinancials } from '../data/plans';
import type { Plan, PlanFinancials } from '../data/plans';
import './ScenarioEngine.css';

// ── Helpers ────────────────────────────────────────────────────
function usd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number) {
  return n.toFixed(1) + '%';
}

function bathLabel(b: number) {
  return b % 1 === 0 ? `${b}ba` : `${b}ba`;
}

// ── Plan Card ──────────────────────────────────────────────────
function PlanCard({
  plan,
  fin,
  onConfirm,
}: {
  plan: Plan;
  fin: PlanFinancials;
  onConfirm?: () => void;
}) {
  return (
    <div className={`sc-plan-card ${plan.recommended ? 'sc-plan-card--recommended' : ''}`}>
      <div className="sc-plan-card-header">
        <div>
          <div className="sc-plan-name">{plan.name}</div>
          <div className="sc-plan-specs">
            {plan.sqft.toLocaleString()} sqft &nbsp;·&nbsp; {plan.beds}bd / {bathLabel(plan.baths)} &nbsp;·&nbsp; {plan.tier}
          </div>
          <div className="sc-plan-elev">Elevation {plan.elevation}</div>
        </div>
        {plan.recommended && (
          <span className="sc-recommended-badge">Recommended</span>
        )}
      </div>

      <div className="sc-plan-financials">
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
        <div className="sc-fin-row sc-fin-row--margin">
          <span>Projected Margin</span>
          <span>{pct(fin.projectedMargin)}</span>
        </div>
      </div>

      <div className="sc-plan-lot-reqs">
        <span className="sc-lot-label">Min Lot</span>
        <span className="sc-lot-value">{plan.minLotWidth}ft wide × {plan.minLotDepth}ft deep</span>
      </div>

      {plan.recommended && onConfirm && (
        <div className="sc-plan-action">
          <button className="sc-confirm-btn" onClick={onConfirm}>
            Confirm Plan &amp; Proceed
          </button>
        </div>
      )}
    </div>
  );
}

// ── Pro Forma Table ────────────────────────────────────────────
function ProFormaTable({ plans, financials }: { plans: Plan[]; financials: PlanFinancials[] }) {
  const rows: { label: string; key: keyof PlanFinancials; format: (n: number) => string; style?: string }[] = [
    { label: 'Est. Sale Price',      key: 'estSalePrice',      format: usd,                 style: 'primary' },
    { label: 'Build Cost',           key: 'buildCost',         format: usd },
    { label: 'Financing Cost (6%)',  key: 'financingCost',     format: usd,                 style: 'sub' },
    { label: 'Transaction (3%)',     key: 'transactionCosts',  format: usd,                 style: 'sub' },
    { label: 'Homebound Fee (5%)',   key: 'homeboundFee',      format: usd,                 style: 'sub' },
    { label: 'Total Cost Ex-Land',   key: 'totalCostExLand',   format: usd,                 style: 'total' },
    { label: 'Max Lot Offer',        key: 'maxLotOffer',       format: usd,                 style: 'highlight' },
    { label: 'Projected Margin',     key: 'projectedMargin',   format: pct,                 style: 'margin' },
  ];

  return (
    <div className="sc-table-wrapper">
      <table className="sc-table">
        <thead>
          <tr>
            <th className="sc-table-label-col">Line Item</th>
            {plans.map((p) => (
              <th key={p.id} className={p.recommended ? 'sc-table-col--recommended' : ''}>
                {p.name}
                {p.recommended && <span className="sc-table-rec-dot"> ★</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.style ? `sc-table-row--${row.style}` : ''}>
              <td className="sc-table-label">{row.label}</td>
              {financials.map((fin, i) => (
                <td key={plans[i].id} className={plans[i].recommended ? 'sc-table-col--recommended' : ''}>
                  {row.format(fin[row.key])}
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
function SensitivityPanel({ basePlan }: { basePlan: Plan }) {
  const base = calcPlanFinancials(basePlan);

  const scenarios = [
    {
      label: 'ESP − 5%',
      description: 'Sale price drops 5%',
      fin: calcFinancials(basePlan.buildCost, basePlan.estSalePrice * 0.95),
    },
    {
      label: 'ESP − 10%',
      description: 'Sale price drops 10%',
      fin: calcFinancials(basePlan.buildCost, basePlan.estSalePrice * 0.90),
    },
    {
      label: 'Build Cost + 3%',
      description: 'Construction cost increases 3%',
      fin: calcFinancials(basePlan.buildCost * 1.03, basePlan.estSalePrice),
    },
    {
      label: 'Build Cost + 5%',
      description: 'Construction cost increases 5%',
      fin: calcFinancials(basePlan.buildCost * 1.05, basePlan.estSalePrice),
    },
  ];

  return (
    <div className="sc-sensitivity">
      <div className="sc-sensitivity-header">
        <div>
          <h3 className="sc-section-title">Sensitivity Analysis</h3>
          <p className="sc-section-sub">Based on {basePlan.name} (Recommended Plan) · Baseline max lot offer: <strong>{usd(base.maxLotOffer)}</strong></p>
        </div>
      </div>
      <div className="sc-sensitivity-grid">
        {scenarios.map((s) => {
          const delta = s.fin.maxLotOffer - base.maxLotOffer;
          const isNegative = delta < 0;
          return (
            <div key={s.label} className="sc-sensitivity-card">
              <div className="sc-sens-label">{s.label}</div>
              <div className="sc-sens-desc">{s.description}</div>
              <div className="sc-sens-offer">{usd(s.fin.maxLotOffer)}</div>
              <div className={`sc-sens-delta ${isNegative ? 'delta-negative' : 'delta-positive'}`}>
                {isNegative ? '▼' : '▲'} {usd(Math.abs(delta))} vs. base
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function ScenarioEngine() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const opp = id ? mockOpportunities.find((o) => o.id === id) : null;

  if (!opp) {
    return (
      <div className="sc-page">
        <p className="sc-not-found">Opportunity not found. <button onClick={() => navigate('/')}>← Back to Queue</button></p>
      </div>
    );
  }

  const plans = DFW_PLANS;
  const financials = plans.map(calcPlanFinancials);
  const recommendedPlan = plans.find((p) => p.recommended)!;

  return (
    <div className="sc-page">
      {/* Breadcrumb */}
      <div className="sc-breadcrumb">
        <button className="sc-breadcrumb-link" onClick={() => navigate('/')}>Opportunity Queue</button>
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
            {opp.address}, {opp.city} {opp.state} &nbsp;·&nbsp; {opp.market} &nbsp;·&nbsp; {opp.lotSqFt.toLocaleString()} sqft lot
          </p>
        </div>
      </div>

      {/* Plan cards */}
      <section className="sc-section">
        <h2 className="sc-section-title">Eligible Plans — DFW Market</h2>
        <div className="sc-plan-grid">
          {plans.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              fin={financials[i]}
              onConfirm={() => navigate(`/underwrite/${opp.id}/scenario/confirmed`)}
            />
          ))}
        </div>
      </section>

      {/* Pro forma table */}
      <section className="sc-section">
        <h2 className="sc-section-title">Pro Forma Comparison</h2>
        <ProFormaTable plans={plans} financials={financials} />
      </section>

      {/* Sensitivity */}
      <section className="sc-section">
        <SensitivityPanel basePlan={recommendedPlan} />
      </section>
    </div>
  );
}

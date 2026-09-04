import { useParams, useNavigate } from 'react-router-dom';
import {
  CONTRACT_DEALS,
  daysRemaining,
  type ContractDeal,
  type ItemState,
  type TimelineStep,
  type WorkflowCard,
} from '../data/contracts';
import './UnderContractPage.css';

// ── Helpers ────────────────────────────────────────────────────
function usd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n);
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

const ITEM_GLYPH: Record<ItemState, string> = {
  done: '✓',
  due: '⚠',
  waiting: '○',
};

/** Amber under 7 days, red under 3. */
function countdownTone(days: number): 'ok' | 'warn' | 'urgent' {
  if (days < 3) return 'urgent';
  if (days < 7) return 'warn';
  return 'ok';
}

// ── Workflow card ──────────────────────────────────────────────
function WorkflowCardView({ card }: { card: WorkflowCard }) {
  return (
    <div className={`uc-card uc-card--${card.tone}`}>
      <div className="uc-card-head">
        <h3 className="uc-card-title">{card.title}</h3>
        <span className={`uc-card-status uc-card-status--${card.tone}`}>{card.status}</span>
      </div>
      <ul className="uc-item-list">
        {card.items.map((item) => (
          <li key={item.label} className={`uc-item uc-item--${item.state}`}>
            <span className={`uc-item-glyph uc-item-glyph--${item.state}`} aria-hidden="true">
              {ITEM_GLYPH[item.state]}
            </span>
            <span className="uc-item-label">{item.label}</span>
            <span className="uc-item-note">{item.note}</span>
          </li>
        ))}
      </ul>
      {card.id === 'ctc' && (
        <button className="uc-ctc-btn" disabled>
          Clear to Close
        </button>
      )}
    </div>
  );
}

// ── Timeline ───────────────────────────────────────────────────
function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="uc-timeline-panel">
      <h3 className="uc-section-title">Timeline</h3>
      <ol className="uc-timeline">
        {steps.map((step) => (
          <li key={step.label} className={`uc-tl-step uc-tl-step--${step.state}`}>
            <span className="uc-tl-marker" aria-hidden="true">
              {step.state === 'done' ? '✓' : ''}
            </span>
            <span className="uc-tl-label">{step.label}</span>
            <span className="uc-tl-date">{step.date}</span>
            {step.state === 'pending' && <span className="uc-tl-tag">pending</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Deal header ────────────────────────────────────────────────
function DealHeader({ deal }: { deal: ContractDeal }) {
  const days = daysRemaining(deal.inspectionExpires);
  const tone = countdownTone(days);

  return (
    <div className="uc-deal-header">
      <div className="uc-deal-head-top">
        <div>
          <h1 className="uc-deal-address">{deal.address}</h1>
          <p className="uc-deal-sub">
            {deal.cityStateZip}
            <span className="uc-sep">·</span>
            {deal.planLine}
          </p>
        </div>
        <span className={`uc-countdown uc-countdown--${tone}`}>
          {days} {days === 1 ? 'day' : 'days'} remaining
        </span>
      </div>

      <div className="uc-metrics">
        <div className="uc-metric">
          <span className="uc-metric-label">Offer</span>
          <span className="uc-metric-value uc-metric-value--accent">{usd(deal.offer)}</span>
        </div>
        <div className="uc-metric">
          <span className="uc-metric-label">ESP</span>
          <span className="uc-metric-value">{usd(deal.esp)}</span>
        </div>
        <div className="uc-metric">
          <span className="uc-metric-label">Margin</span>
          <span className="uc-metric-value">{deal.marginPct.toFixed(1)}%</span>
        </div>
        <div className="uc-metric">
          <span className="uc-metric-label">Contract Date</span>
          <span className="uc-metric-value">{longDate(deal.contractDate)}</span>
        </div>
        <div className="uc-metric">
          <span className="uc-metric-label">Inspection Expires</span>
          <span className="uc-metric-value">{longDate(deal.inspectionExpires)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function UnderContractPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const deal = id ? CONTRACT_DEALS[id] : undefined;

  if (!deal) {
    return (
      <div className="uc-page">
        <div className="uc-empty-state">
          <h2>{id ? `No contract found for ${id}.` : 'No deal under contract selected.'}</h2>
          <p>Deals appear here once an offer is accepted and the lot goes under contract.</p>
          <button className="uc-back-btn" onClick={() => navigate('/')}>← Back to Queue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="uc-page">
      {/* Breadcrumb — reuse sc- classes from ScenarioEngine.css */}
      <div className="sc-breadcrumb">
        <button className="sc-breadcrumb-link" onClick={() => navigate('/')}>
          Opportunity Queue
        </button>
        <span className="sc-breadcrumb-sep">›</span>
        <button className="sc-breadcrumb-link" onClick={() => navigate(`/underwrite/${deal.oppId}`)}>
          {deal.oppId}
        </button>
        <span className="sc-breadcrumb-sep">›</span>
        <span className="sc-breadcrumb-current">Under Contract</span>
      </div>

      <DealHeader deal={deal} />

      <div className="uc-cards-grid">
        {deal.cards.map((card) => (
          <WorkflowCardView key={card.id} card={card} />
        ))}
      </div>

      <Timeline steps={deal.timeline} />
    </div>
  );
}

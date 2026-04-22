import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './CompSelectionPage.css';

// ── Constants ──────────────────────────────────────────────────
const SPEC_LEVELS = ['Entry', 'Deluxe', 'Premium', 'Premium Plus'] as const;
type SpecLevel = (typeof SPEC_LEVELS)[number];

const ML_ESP = 571_000;
const MAX_LOT_OFFER = 152_760;

// ── Types ──────────────────────────────────────────────────────
interface CompDef {
  rank: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  salePrice: number;
  sqft: number;
  beds: number;
  baths: number;
  spec: SpecLevel;
  distance: string;
  daysAgo: number;
  sqftAdjML: number;
  sqftAdjMarket: number;
  lotAdjML: number | null;
  lotAdjMarket: number | null;
  bathAdjML: number | null;
  bathAdjMarket: number | null;
  flagLotDiv: boolean;
  startingWeight: number;
  aiReason: string;
}

// ── Comp data ──────────────────────────────────────────────────
const COMPS: CompDef[] = [
  {
    rank: 1,
    address: '4903 Maple Creek Dr',
    city: 'Dallas', state: 'TX', zip: '75227',
    salePrice: 559_000,
    sqft: 2080, beds: 4, baths: 3, spec: 'Premium',
    distance: '0.1 mi', daysAgo: 42,
    sqftAdjML: 4_200, sqftAdjMarket: 4_100,
    lotAdjML: 7_200, lotAdjMarket: 3_800,
    bathAdjML: null, bathAdjMarket: null,
    flagLotDiv: true,
    startingWeight: 35,
    aiReason: 'Closest new construction sale · best spec match · highest confidence comp',
  },
  {
    rank: 2,
    address: '5102 Ridgecrest Ln',
    city: 'Dallas', state: 'TX', zip: '75228',
    salePrice: 572_000,
    sqft: 2150, beds: 4, baths: 3, spec: 'Premium',
    distance: '0.3 mi', daysAgo: 68,
    sqftAdjML: -2_600, sqftAdjMarket: -2_500,
    lotAdjML: -7_600, lotAdjMarket: -7_200,
    bathAdjML: null, bathAdjMarket: null,
    flagLotDiv: false,
    startingWeight: 30,
    aiReason: 'Strong spec match · slightly older but same submarket · good sqft proximity',
  },
  {
    rank: 3,
    address: '4710 Sunbrook Ct',
    city: 'Dallas', state: 'TX', zip: '75227',
    salePrice: 544_000,
    sqft: 1980, beds: 4, baths: 2.5, spec: 'Premium',
    distance: '0.5 mi', daysAgo: 31,
    sqftAdjML: 6_300, sqftAdjMarket: 6_100,
    lotAdjML: null, lotAdjMarket: null,
    bathAdjML: 6_800, bathAdjMarket: 6_500,
    flagLotDiv: false,
    startingWeight: 20,
    aiReason: 'Most recent sale · slightly smaller · bath count difference adjusted',
  },
];

// ── Helpers ────────────────────────────────────────────────────
function usd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n);
}

function fmtAdj(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US');
  return n >= 0 ? `+$${abs}` : `−$${abs}`;
}

function computeAdjValue(comp: CompDef): number {
  return comp.salePrice
    + comp.sqftAdjML
    + (comp.lotAdjML ?? 0)
    + (comp.bathAdjML ?? 0);
}

// ── Offer Published Screen ─────────────────────────────────────
function OfferPublishedScreen({ esp, onReturn }: { esp: number; onReturn: () => void }) {
  return (
    <div className="cs-published-wrapper">
      <div className="cs-published-card">
        <div className="cs-published-check">✓</div>
        <h1 className="cs-published-title">Offer Published</h1>
        <div className="cs-published-rows">
          <div className="cs-pub-row">
            <span className="cs-pub-label">Address</span>
            <span className="cs-pub-value">4821 Maple Creek Dr, Dallas TX 75227</span>
          </div>
          <div className="cs-pub-row">
            <span className="cs-pub-label">Plan</span>
            <span className="cs-pub-value">The Birch · Premium · Elevation 1</span>
          </div>
          <div className="cs-pub-row">
            <span className="cs-pub-label">Max Lot Offer</span>
            <span className="cs-pub-value cs-pub-value--highlight">{usd(MAX_LOT_OFFER)}</span>
          </div>
          <div className="cs-pub-row">
            <span className="cs-pub-label">Weighted ESP</span>
            <span className="cs-pub-value">{usd(esp)}</span>
          </div>
        </div>
        <div className="cs-pub-systems">
          <span className="cs-sys-badge cs-sys-badge--sf">✓ Published to Salesforce</span>
          <span className="cs-sys-badge cs-sys-badge--slack">✓ Slack notification sent</span>
        </div>
        <button className="cs-return-btn" onClick={onReturn}>
          ← Return to Queue
        </button>
      </div>
    </div>
  );
}

// ── Comp Card ──────────────────────────────────────────────────
interface CompCardProps {
  comp: CompDef;
  adjustedValue: number;
  weight: number;
  specLevel: string;
  onWeightChange: (w: number) => void;
  onSpecChange: (s: string) => void;
}

function CompCard({
  comp, adjustedValue, weight, specLevel, onWeightChange, onSpecChange,
}: CompCardProps) {
  return (
    <div className="cs-comp-card">
      {/* ── Top row ── */}
      <div className="cs-comp-top">
        <div className="cs-comp-rank">{comp.rank}</div>
        <div className="cs-comp-addr-block">
          <div className="cs-comp-address">
            {comp.address}, {comp.city} {comp.state} {comp.zip}
          </div>
          <div className="cs-comp-tags">
            <span className="cs-tag cs-tag--new">New Construction</span>
            <span className="cs-tag cs-tag--dist">{comp.distance}</span>
          </div>
        </div>
        <div className="cs-comp-sold">Sold {comp.daysAgo} days ago</div>
        <div className="cs-comp-adjval">
          <div className="cs-comp-adjval-label">Adjusted Value</div>
          <div className="cs-comp-adjval-num">{usd(adjustedValue)}</div>
        </div>
      </div>

      {/* ── Property row ── */}
      <div className="cs-comp-prop">
        <span>{comp.sqft.toLocaleString()} sqft</span>
        <span className="cs-sep">·</span>
        <span>{comp.beds}bd / {comp.baths}ba</span>
        <span className="cs-sep">·</span>
        <span>{comp.spec} spec</span>
        <span className="cs-sep">·</span>
        <span className="cs-ai-note">AI selected — {comp.aiReason}</span>
      </div>

      {/* ── Adjustment columns ── */}
      <div className="cs-adj-grid">
        {/* Sale Price */}
        <div className="cs-adj-cell">
          <div className="cs-adj-cell-label">Sale Price</div>
          <div className="cs-adj-cell-main cs-adj-sale">{usd(comp.salePrice)}</div>
          <div className="cs-adj-cell-sub">&nbsp;</div>
        </div>

        {/* Sqft Adjustment */}
        <div className="cs-adj-cell">
          <div className="cs-adj-cell-label">Sqft Adjustment</div>
          <div className="cs-adj-cell-main">{fmtAdj(comp.sqftAdjML)}</div>
          <div className="cs-adj-cell-sub">ML suggested</div>
          <div className="cs-adj-cell-mkt">{fmtAdj(comp.sqftAdjMarket)} market</div>
        </div>

        {/* Lot Size Adjustment (Comps 1 & 2) */}
        {comp.lotAdjML !== null && (
          <div className={`cs-adj-cell${comp.flagLotDiv ? ' cs-adj-cell--amber' : ''}`}>
            <div className="cs-adj-cell-label">Lot Size Adjustment</div>
            <div className="cs-adj-cell-main">{fmtAdj(comp.lotAdjML)}</div>
            <div className="cs-adj-cell-sub">ML suggested</div>
            {comp.lotAdjMarket !== null && (
              <div className="cs-adj-cell-mkt">{fmtAdj(comp.lotAdjMarket)} market</div>
            )}
            {comp.flagLotDiv && (
              <div className="cs-lot-flag">
                ⚠ ML 90% above market-implied — verify lot premium
              </div>
            )}
          </div>
        )}

        {/* Bath Adjustment (Comp 3) */}
        {comp.bathAdjML !== null && (
          <div className="cs-adj-cell">
            <div className="cs-adj-cell-label">Bath Adjustment</div>
            <div className="cs-adj-cell-main">{fmtAdj(comp.bathAdjML)}</div>
            <div className="cs-adj-cell-sub">ML suggested</div>
            {comp.bathAdjMarket !== null && (
              <div className="cs-adj-cell-mkt">{fmtAdj(comp.bathAdjMarket)} market</div>
            )}
          </div>
        )}

        {/* Spec Level */}
        <div className="cs-adj-cell">
          <div className="cs-adj-cell-label">Spec Level</div>
          <select
            className="cs-spec-select"
            value={specLevel}
            onChange={e => onSpecChange(e.target.value)}
          >
            {SPEC_LEVELS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Weight row ── */}
      <div className="cs-weight-row">
        <span className="cs-weight-row-label">Weight</span>
        <input
          type="range"
          min={0}
          max={50}
          step={1}
          value={weight}
          onChange={e => onWeightChange(Number(e.target.value))}
          className="cs-slider"
        />
        <span className="cs-weight-pct">{weight}%</span>
        <span className="cs-weight-contrib">
          = {usd(adjustedValue * weight / 100)} contribution
        </span>
      </div>

      {/* ── Reason row ── */}
      <div className="cs-reason-row">
        {comp.aiReason}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function CompSelectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [weights, setWeights] = useState<number[]>(COMPS.map(c => c.startingWeight));
  const [specLevels, setSpecLevels] = useState<string[]>(COMPS.map(c => c.spec));
  const [published, setPublished] = useState(false);

  const adjustedValues = COMPS.map(computeAdjValue);
  const weightTotal = weights.reduce((a, b) => a + b, 0);

  const displayESP = weightTotal > 0
    ? COMPS.reduce((sum, _, i) => sum + adjustedValues[i] * weights[i], 0) / weightTotal
    : 0;

  const divergencePct = displayESP > 0
    ? Math.abs((displayESP - ML_ESP) / ML_ESP) * 100
    : 0;

  const weightsValid = weightTotal === 100;

  if (published) {
    return <OfferPublishedScreen esp={displayESP} onReturn={() => navigate('/')} />;
  }

  const weightDelta = 100 - weightTotal;

  return (
    <div className="cs-page">
      {/* Breadcrumb — reuse sc- classes from ScenarioEngine.css */}
      <div className="sc-breadcrumb">
        <button className="sc-breadcrumb-link" onClick={() => navigate('/')}>
          Opportunity Queue
        </button>
        <span className="sc-breadcrumb-sep">›</span>
        <button className="sc-breadcrumb-link" onClick={() => navigate(`/underwrite/${id}`)}>
          BOOL-001
        </button>
        <span className="sc-breadcrumb-sep">›</span>
        <button className="sc-breadcrumb-link" onClick={() => navigate(`/underwrite/${id}/scenario`)}>
          Plan Selection
        </button>
        <span className="sc-breadcrumb-sep">›</span>
        <span className="sc-breadcrumb-current">Comp Selection</span>
      </div>

      {/* Page header */}
      <div className="cs-page-header">
        <div className="cs-header-left">
          <h1 className="cs-page-title">Comp Selection &amp; Adjustment</h1>
          <p className="cs-page-subtitle">
            4821 Maple Creek Dr &nbsp;·&nbsp; The Birch &nbsp;·&nbsp;
            2,100 sqft &nbsp;·&nbsp; Premium &nbsp;·&nbsp; DFW
          </p>
        </div>
        <div className="cs-esp-panel">
          <div className="cs-esp-panel-label">Weighted ESP</div>
          <div className="cs-esp-panel-value">{usd(displayESP)}</div>
          <div className="cs-esp-ml-ref">ML ESP v2: {usd(ML_ESP)}</div>
          {divergencePct > 5 && (
            <div className="cs-diverge-warn">
              ⚠ Review — &gt;5% divergence from ML estimate
            </div>
          )}
        </div>
      </div>

      {/* Comp cards */}
      <div className="cs-comp-list">
        {COMPS.map((comp, i) => (
          <CompCard
            key={comp.rank}
            comp={comp}
            adjustedValue={adjustedValues[i]}
            weight={weights[i]}
            specLevel={specLevels[i]}
            onWeightChange={w => {
              const next = [...weights];
              next[i] = w;
              setWeights(next);
            }}
            onSpecChange={s => {
              const next = [...specLevels];
              next[i] = s;
              setSpecLevels(next);
            }}
          />
        ))}
      </div>

      {/* Summary bar */}
      <div className="cs-summary-bar">
        <div className="cs-sum-item">
          <span className="cs-sum-label">Weighted ESP</span>
          <span className="cs-sum-value">{usd(displayESP)}</span>
        </div>
        <div className="cs-sum-divider" />
        <div className="cs-sum-item">
          <span className="cs-sum-label">Weight Total</span>
          <span className={`cs-sum-value ${weightsValid ? 'cs-sum-value--ok' : 'cs-sum-value--err'}`}>
            {weightTotal}%
            {!weightsValid && (
              <span className="cs-sum-delta">
                &nbsp;({weightDelta > 0 ? `+${weightDelta}%` : `${weightDelta}%`} needed)
              </span>
            )}
          </span>
        </div>
        <div className="cs-sum-divider" />
        <div className="cs-sum-item">
          <span className="cs-sum-label">Comps</span>
          <span className="cs-sum-value">3 selected</span>
        </div>
        <div className="cs-sum-actions">
          <button className="cs-add-comp-btn">+ Add Comp</button>
          <button
            className="cs-publish-btn"
            disabled={!weightsValid}
            onClick={() => setPublished(true)}
          >
            Confirm &amp; Publish Offer
          </button>
        </div>
      </div>
    </div>
  );
}

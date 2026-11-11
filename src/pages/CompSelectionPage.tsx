import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import ProvenanceValue from '../components/ProvenanceValue';
import { getAIDraft } from '../data/aiDrafts';
import type { AIDraft } from '../data/aiDrafts';
import { ASSETS } from '../data/assets';
import { CONTRACT_DEALS, DEMO_DEAL_ID, underwriteInfo } from '../data/contracts';
import { daysSince } from '../data/dates';
import { calcFinancials, defaultSpecIdx } from '../data/plans';
import type { Plan, SpecLevelName } from '../data/plans';
import { compOverridesFor, lotPlans, withOverrides } from '../data/scenarioPricing';
import { AI, MLS, SFDC, computed, human } from '../data/provenance';
import { useCanAct } from '../data/role';
import type { ProvenanceInfo } from '../types';
import './CompSelectionPage.css';

// ── Constants ──────────────────────────────────────────────────
const SPEC_LEVELS: SpecLevelName[] = ['Essential', 'Deluxe', 'Premium', 'Premium+'];
type SpecLevel = SpecLevelName;

// ── Provenance ─────────────────────────────────────────────────
// Comp facts come from MLS; ML adjustments, adjusted values and starting
// weights are AI drafts. Once the analyst moves a weight, the weight reads as
// a scenario input and anything weighted by it as a scenario output.
const MARKET_ADJ = computed('Market-implied adjustment');
const SCENARIO_INPUT = human('Scenario input');
const SCENARIO_OUTPUT = computed('Scenario output');

// ── Types ──────────────────────────────────────────────────────
interface CompDef {
  rank: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  salePrice: number;
  sqft: number;
  beds?: number;            // not on every MLS comp feed
  baths?: number;
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
// BOOL-001's hand-picked comp set with ML adjustments. Other lots use the
// MLS comps from their AI draft (compsFromDraft).
const BOOL_001_COMPS: CompDef[] = [
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

/** The draft's three nearest comps, with a small ML size adjustment toward the plan. */
function compsFromDraft(draft: AIDraft, planSqft: number, spec: SpecLevel): CompDef[] {
  const asset = draft.asset;
  const weights = [40, 35, 25];
  return [...draft.comps]
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, 3)
    .map((c, i) => {
      const ppsf = c.salePrice / c.sqft;
      const sqftAdjML = Math.round(((planSqft - c.sqft) * ppsf * 0.02) / 100) * 100;
      const days = daysSince(`${c.soldOn}T00:00:00Z`);
      return {
        rank: i + 1,
        address: c.address,
        city: asset.city, state: asset.state, zip: asset.zip,
        salePrice: c.salePrice,
        sqft: c.sqft, spec,
        distance: `${c.distanceMi.toFixed(1)} mi`, daysAgo: days,
        sqftAdjML, sqftAdjMarket: Math.round((sqftAdjML * 0.95) / 100) * 100,
        lotAdjML: null, lotAdjMarket: null,
        bathAdjML: null, bathAdjMarket: null,
        flagLotDiv: false,
        startingWeight: weights[i],
        aiReason: `${i === 0 ? 'Nearest' : i === 1 ? 'Second-nearest' : 'Third-nearest'} new-construction sale · $${Math.round(ppsf)}/sqft · sold ${days} days ago`,
      };
    });
}

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
interface PublishedValue { value: number; info: ProvenanceInfo; label: string }

function OfferPublishedScreen(
  { address, planLine, offer, esp, compCheck, onReturn, onViewContract }: {
    address: string;
    planLine: string;
    offer: PublishedValue;
    esp: PublishedValue;
    compCheck: { value: number; info: ProvenanceInfo };
    onReturn: () => void;
    onViewContract: () => void;
  },
) {
  const gapPct = ((compCheck.value - esp.value) / esp.value) * 100;
  return (
    <div className="cs-published-wrapper">
      <div className="cs-published-card">
        <div className="cs-published-check">✓</div>
        <h1 className="cs-published-title">Offer Published</h1>
        <div className="cs-published-rows">
          <div className="cs-pub-row">
            <span className="cs-pub-label">Address</span>
            <span className="cs-pub-value">{address}</span>
          </div>
          <div className="cs-pub-row">
            <span className="cs-pub-label">Plan</span>
            <span className="cs-pub-value">{planLine}</span>
          </div>
          <div className="cs-pub-row">
            <span className="cs-pub-label">{offer.label}</span>
            <span className="cs-pub-value cs-pub-value--highlight">
              <ProvenanceValue info={offer.info}>{usd(offer.value)}</ProvenanceValue>
            </span>
          </div>
          <div className="cs-pub-row">
            <span className="cs-pub-label">{esp.label}</span>
            <span className="cs-pub-value"><ProvenanceValue info={esp.info}>{usd(esp.value)}</ProvenanceValue></span>
          </div>
          <div className="cs-pub-row">
            <span className="cs-pub-label">Comp check</span>
            <span className="cs-pub-value">
              Weighted comps <ProvenanceValue info={compCheck.info}>{usd(compCheck.value)}</ProvenanceValue>{' '}
              (<ProvenanceValue info={compCheck.info}>{gapPct >= 0 ? '+' : '−'}{Math.abs(gapPct).toFixed(1)}%</ProvenanceValue>)
            </span>
          </div>
        </div>
        <div className="cs-pub-systems">
          <span className="cs-sys-badge cs-sys-badge--sf">✓ Published to Salesforce</span>
          <span className="cs-sys-badge cs-sys-badge--slack">✓ Slack notification sent</span>
        </div>
        <div className="cs-pub-actions">
          <button className="cs-contract-btn" onClick={onViewContract}>
            Confirm &amp; Publish Offer →
          </button>
          <button className="cs-return-btn" onClick={onReturn}>
            ← Back to Pipeline
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Comp Card ──────────────────────────────────────────────────
interface CompCardProps {
  comp: CompDef;
  adjustedValue: number;
  pricePerSqft: number;    // adjusted value ÷ comp sqft
  weight: number;
  specLevel: string;
  onWeightChange: (w: number) => void;
  onSpecChange: (s: string) => void;
}

function CompCard({
  comp, adjustedValue, pricePerSqft, weight, specLevel, onWeightChange, onSpecChange,
}: CompCardProps) {
  const weightIsDefault = weight === comp.startingWeight;
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
            <span className="cs-tag cs-tag--dist"><ProvenanceValue info={MLS}>{comp.distance}</ProvenanceValue></span>
          </div>
        </div>
        <div className="cs-comp-sold">
          Sold <ProvenanceValue info={MLS}>{comp.daysAgo} days</ProvenanceValue> ago
        </div>
        <div className="cs-comp-adjval">
          <div className="cs-comp-adjval-label">Adjusted Value</div>
          <div className="cs-comp-adjval-num"><ProvenanceValue info={AI}>{usd(adjustedValue)}</ProvenanceValue></div>
        </div>
      </div>

      {/* ── Property row ── */}
      <div className="cs-comp-prop">
        <span><ProvenanceValue info={MLS}>{comp.sqft.toLocaleString()} sqft</ProvenanceValue></span>
        <span className="cs-sep">·</span>
        {comp.beds !== undefined && comp.baths !== undefined && (
          <span><ProvenanceValue info={MLS}>{comp.beds}bd / {comp.baths}ba</ProvenanceValue></span>
        )}
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
          <div className="cs-adj-cell-main cs-adj-sale"><ProvenanceValue info={MLS}>{usd(comp.salePrice)}</ProvenanceValue></div>
          <div className="cs-adj-cell-sub">&nbsp;</div>
        </div>

        {/* Sqft Adjustment */}
        <div className="cs-adj-cell">
          <div className="cs-adj-cell-label">Sqft Adjustment</div>
          <div className="cs-adj-cell-main"><ProvenanceValue info={AI}>{fmtAdj(comp.sqftAdjML)}</ProvenanceValue></div>
          <div className="cs-adj-cell-sub">ML suggested</div>
          <div className="cs-adj-cell-mkt"><ProvenanceValue info={MARKET_ADJ}>{fmtAdj(comp.sqftAdjMarket)}</ProvenanceValue> market</div>
        </div>

        {/* Lot Size Adjustment (Comps 1 & 2) */}
        {comp.lotAdjML !== null && (
          <div className={`cs-adj-cell${comp.flagLotDiv ? ' cs-adj-cell--amber' : ''}`}>
            <div className="cs-adj-cell-label">Lot Size Adjustment</div>
            <div className="cs-adj-cell-main"><ProvenanceValue info={AI}>{fmtAdj(comp.lotAdjML)}</ProvenanceValue></div>
            <div className="cs-adj-cell-sub">ML suggested</div>
            {comp.lotAdjMarket !== null && (
              <div className="cs-adj-cell-mkt"><ProvenanceValue info={MARKET_ADJ}>{fmtAdj(comp.lotAdjMarket)}</ProvenanceValue> market</div>
            )}
            {comp.flagLotDiv && (
              <div className="cs-lot-flag">
                ⚠ ML <ProvenanceValue info={computed('ML vs market-implied lot adjustment')}>90%</ProvenanceValue> above
                market-implied — verify lot premium
              </div>
            )}
          </div>
        )}

        {/* Bath Adjustment (Comp 3) */}
        {comp.bathAdjML !== null && (
          <div className="cs-adj-cell">
            <div className="cs-adj-cell-label">Bath Adjustment</div>
            <div className="cs-adj-cell-main"><ProvenanceValue info={AI}>{fmtAdj(comp.bathAdjML)}</ProvenanceValue></div>
            <div className="cs-adj-cell-sub">ML suggested</div>
            {comp.bathAdjMarket !== null && (
              <div className="cs-adj-cell-mkt"><ProvenanceValue info={MARKET_ADJ}>{fmtAdj(comp.bathAdjMarket)}</ProvenanceValue> market</div>
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
        <span className="cs-weight-pct">
          <ProvenanceValue info={weightIsDefault ? AI : SCENARIO_INPUT}>{weight}%</ProvenanceValue>
        </span>
        <span className="cs-weight-contrib">
          ={' '}
          <ProvenanceValue info={weightIsDefault ? AI : SCENARIO_OUTPUT}>{usd(pricePerSqft * weight / 100)}/sqft</ProvenanceValue>
          {' '}contribution
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
  const canAct = useCanAct();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const asset = ASSETS.find((a) => a.id === id);
  const draft = id ? getAIDraft(id) : undefined;

  // Plans priced for this lot, exactly as the scenario engine prices them.
  const plans: Plan[] = asset ? lotPlans(asset.id, asset.market) : [];
  const anchorName = draft?.recommendation.plan.plan.name ?? asset?.underwrite?.planName;
  const confirmedPlan = plans.find((p) => p.id === searchParams.get('plan'));
  const basePlan = confirmedPlan ?? plans.find((p) => p.name === anchorName) ?? plans[0];
  const plan = basePlan && withOverrides(basePlan, compOverridesFor(id));
  const specIdx = plan ? defaultSpecIdx(plan) : 0;
  const specName = plan?.specLevels[specIdx].level ?? 'Deluxe';
  const model = plan && calcFinancials({ plan, elevationIdx: 0, specLevelIdx: specIdx, selectedOptionIds: [] });
  const mlEsp = model?.estSalePrice ?? 0;

  const comps: CompDef[] = id === DEMO_DEAL_ID ? BOOL_001_COMPS : draft && model ? compsFromDraft(draft, model.sqft, specName) : [];

  const [weights, setWeights] = useState<number[]>(comps.map(c => c.startingWeight));
  const [specLevels, setSpecLevels] = useState<string[]>(comps.map(c => c.spec));
  const [published, setPublished] = useState(false);

  const adjustedValues = comps.map(computeAdjValue);
  const pricesPerSqft = comps.map((c, i) => adjustedValues[i] / c.sqft);
  const weightTotal = weights.reduce((a, b) => a + b, 0);

  // Weighted adjusted $/sqft × the plan's sqft, the same method as the AI draft's ESP.
  const displayESP = weightTotal > 0
    ? (comps.reduce((sum, _, i) => sum + pricesPerSqft[i] * weights[i], 0) / weightTotal) * (model?.sqft ?? 0)
    : 0;

  const divergencePct = displayESP > 0
    ? Math.abs((displayESP - mlEsp) / mlEsp) * 100
    : 0;

  const weightsValid = weightTotal === 100;
  const weightsAreDefault = comps.every((c, i) => weights[i] === c.startingWeight);
  const espInfo = weightsAreDefault ? AI : SCENARIO_OUTPUT;

  if (!asset || !plan || !model || comps.length === 0) {
    return (
      <div className="cs-page">
        <div className="uc-empty-state">
          <h2>No comp set for {id}.</h2>
          <p>Comp selection needs an AI draft or an underwritten deal with comps.</p>
          <Link to={id ? `/underwrite/${id}/scenario` : '/queue'} className="link-button">← Back to plan selection</Link>
        </div>
      </div>
    );
  }

  const planName = plan.name;
  const location = `${asset.address}, ${asset.city} ${asset.state} ${asset.zip}`;

  if (published) {
    // What goes to contract: the reviewed underwrite once there is one, else the
    // AI draft's ESP and its max land price at target margin.
    const uw = asset.underwrite;
    const offer: PublishedValue = uw
      ? {
          label: 'Offer',
          value: uw.landPrice,
          // Same rule as the contract page: Salesforce unless the analyst overrode land.
          info: uw.review?.overrides.some((o) => o.field === 'landPrice') ? underwriteInfo(asset.id, 'landPrice') : SFDC,
        }
      : { label: 'Offer (max land at target margin)', value: draft!.recommendation.maxLandPrice, info: AI };
    const esp: PublishedValue = uw
      ? { label: 'ESP', value: uw.esp, info: underwriteInfo(asset.id, 'esp') }
      : { label: 'ESP', value: draft!.recommendation.esp, info: AI };
    return (
      <OfferPublishedScreen
        address={location}
        planLine={`${uw?.planName ?? planName} · ${specName} · Elevation 1`}
        offer={offer}
        esp={esp}
        compCheck={{ value: displayESP, info: espInfo }}
        onReturn={() => navigate('/queue')}
        onViewContract={() => navigate(CONTRACT_DEALS[asset.id] ? `/contract/${asset.id}` : '/contract')}
      />
    );
  }

  const weightDelta = 100 - weightTotal;

  return (
    <div className="cs-page">
      {/* Breadcrumb — reuse sc- classes from ScenarioEngine.css */}
      <div className="sc-breadcrumb">
        <button className="sc-breadcrumb-link" onClick={() => navigate('/queue')}>
          Pipeline
        </button>
        <span className="sc-breadcrumb-sep">›</span>
        <button className="sc-breadcrumb-link" onClick={() => navigate(`/underwrite/${id}`)}>
          {asset.id}
        </button>
        <span className="sc-breadcrumb-sep">›</span>
        <button className="sc-breadcrumb-link" onClick={() => navigate(`/underwrite/${id}/scenario`)}>
          {confirmedPlan?.name ?? 'Plan Selection'}
        </button>
        <span className="sc-breadcrumb-sep">›</span>
        <span className="sc-breadcrumb-current">Comp Selection</span>
      </div>

      {/* Page header */}
      <div className="cs-page-header">
        <div className="cs-header-left">
          <h1 className="cs-page-title">Comp Selection &amp; Adjustment</h1>
          <p className="cs-page-subtitle">
            {asset.address} &nbsp;·&nbsp; {planName} &nbsp;·&nbsp;
            <ProvenanceValue info={AI}>{model.sqft.toLocaleString()} sqft</ProvenanceValue> &nbsp;·&nbsp; {specName} &nbsp;·&nbsp; {asset.market}
          </p>
        </div>
        <div className="cs-esp-panel">
          <div className="cs-esp-panel-label">Weighted ESP</div>
          <div className="cs-esp-panel-value"><ProvenanceValue info={espInfo}>{usd(displayESP)}</ProvenanceValue></div>
          <div className="cs-esp-ml-ref">ML ESP v2: <ProvenanceValue info={AI}>{usd(mlEsp)}</ProvenanceValue></div>
          {divergencePct > 5 && (
            <div className="cs-diverge-warn">
              ⚠ Review — &gt;5% divergence from ML estimate
            </div>
          )}
        </div>
      </div>

      {/* Comp cards */}
      <div className="cs-comp-list">
        {comps.map((comp, i) => (
          <CompCard
            key={comp.rank}
            comp={comp}
            adjustedValue={adjustedValues[i]}
            pricePerSqft={pricesPerSqft[i]}
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
          <span className="cs-sum-value"><ProvenanceValue info={espInfo}>{usd(displayESP)}</ProvenanceValue></span>
        </div>
        <div className="cs-sum-divider" />
        <div className="cs-sum-item">
          <span className="cs-sum-label">Weight Total</span>
          <span className={`cs-sum-value ${weightsValid ? 'cs-sum-value--ok' : 'cs-sum-value--err'}`}>
            <ProvenanceValue info={weightsAreDefault ? AI : SCENARIO_INPUT}>{weightTotal}%</ProvenanceValue>
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
          <span className="cs-sum-value">{comps.length} selected</span>
        </div>
        <div className="cs-sum-actions">
          {canAct && <button className="cs-add-comp-btn">+ Add Comp</button>}
          {canAct && <button
            className="cs-publish-btn"
            disabled={!weightsValid}
            onClick={() => setPublished(true)}
          >
            Confirm &amp; Publish Offer
          </button>}
        </div>
      </div>
    </div>
  );
}

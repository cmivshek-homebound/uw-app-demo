import { useState } from 'react';
import { Link } from 'react-router-dom';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { ASSETS } from '../data/assets';
import { useListingActions, withListingActions } from '../data/listingActions';
import { DIAGNOSIS_LABELS, DIAGNOSIS_URGENCY, evaluateOffer, listingHealth } from '../data/listingHealth';
import type { ListingHealth } from '../data/listingHealth';
import { useMarkReviews, withMarkReviews } from '../data/markReview';
import { SELLING_COST_PCT } from '../data/underwriting';
import type { Asset, ListingOffer, ListingWeek, MonthlyMark, ProvenanceInfo } from '../types';
// Reuses the queue page shell and the Portfolio buttons/inputs (pf-btn, pf-approval-input).
import './OpportunityQueue.css';
import './PortfolioPage.css';
import './ForSalePage.css';

const AI: ProvenanceInfo = { provenance: 'ai' };
const MLS: ProvenanceInfo = { provenance: 'system', source: 'MLS' };
const NORM: ProvenanceInfo = { provenance: 'system', note: 'Market norm' };

function usd(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function signedUsd(n: number) {
  if (Math.round(n) === 0) return '$0';
  return `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function usdCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1_000)}K`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function markProvenance(m: MonthlyMark | undefined): ProvenanceInfo {
  if (!m?.approvedBy) return AI;
  if (m.approvedBy === 'Auto-approved') return { provenance: 'system', note: 'Auto-approved' };
  return { provenance: 'human', note: `Approved by ${m.approvedBy}` };
}

// ── Small charts ───────────────────────────────────────────────
function DomBar({ days, norm }: { days: number; norm: number }) {
  const max = Math.max(days, norm * 1.5) * 1.05;
  const ratio = days / norm;
  const tone = ratio > 1.5 ? 'late' : ratio > 1 ? 'warn' : 'ok';
  return (
    <div className="fs-dom">
      <div className="fs-dom-bar" role="img" aria-label={`${days} days on market against a ${norm}-day norm`}>
        <span className={`fs-dom-fill fs-dom-fill--${tone}`} style={{ width: `${(days / max) * 100}%` }} />
        <span className="fs-dom-norm" style={{ left: `${(norm / max) * 100}%` }} />
      </div>
      <span className="fs-dom-text">
        <ProvenanceValue info={MLS}>{days}d</ProvenanceValue>
        <span className="fs-muted"> / <ProvenanceValue info={NORM}>{norm}d</ProvenanceValue> norm</span>
      </span>
    </div>
  );
}

/** Showings per full week since listing, with the market norm as a reference line. */
function Sparkline({ weeks, norm }: { weeks: ListingWeek[]; norm: number }) {
  const full = weeks.filter((w) => w.days === 7);
  const W = 120;
  const H = 34;
  const pad = 4;
  if (full.length < 2) {
    return <span className="fs-muted fs-small">Too new to chart</span>;
  }
  const max = Math.max(norm, ...full.map((w) => w.showings), 1);
  const x = (i: number) => pad + (i / (full.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = full.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.showings).toFixed(1)}`).join(' ');
  const last = full.length - 1;
  return (
    <svg className="fs-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly showings: ${full.map((w) => w.showings).join(', ')}; norm ${norm} per week`}>
      <title>{full.map((w) => `${shortDate(w.weekStart)}: ${w.showings}`).join('\n')}</title>
      <line x1={pad} x2={W - pad} y1={y(norm)} y2={y(norm)} className="fs-spark-norm" />
      <path d={path} className="fs-spark-line" />
      <circle cx={x(last)} cy={y(full[last].showings)} r={3} className="fs-spark-end" />
    </svg>
  );
}

// ── Offer evaluation ───────────────────────────────────────────
function OfferEvaluation({ asset, offer }: { asset: Asset; offer: ListingOffer }) {
  const e = evaluateOffer(asset, offer);
  const tone = (n: number) => (n < 0 ? 'fs-bad' : 'fs-good');
  return (
    <div className="fs-eval">
      <div className="fs-eval-col">
        <h4 className="fs-eval-title">Offer vs. benchmarks</h4>
        <dl className="fs-lines">
          <dt>Offer ({offer.financing}, {shortDate(offer.date)})</dt>
          <dd><ProvenanceValue info={MLS}>{usd(offer.amount)}</ProvenanceValue></dd>
          <dt>vs. list price</dt>
          <dd className={tone(e.vsList)}><ProvenanceValue info={AI}>{signedUsd(e.vsList)}</ProvenanceValue></dd>
          <dt>vs. current mark</dt>
          <dd className={tone(e.vsMark)}><ProvenanceValue info={AI}>{signedUsd(e.vsMark)}</ProvenanceValue></dd>
          <dt>vs. underwritten ESP</dt>
          <dd className={tone(e.vsEsp)}><ProvenanceValue info={AI}>{signedUsd(e.vsEsp)}</ProvenanceValue></dd>
        </dl>
      </div>
      <div className="fs-eval-col">
        <h4 className="fs-eval-title">If accepted</h4>
        <dl className="fs-lines">
          <dt>Selling costs ({SELLING_COST_PCT}%)</dt>
          <dd><ProvenanceValue info={AI}>−{usd(e.sellingCosts)}</ProvenanceValue></dd>
          <dt>Concessions{offer.concessionNote ? ` (${offer.concessionNote.toLowerCase()})` : ''}</dt>
          <dd><ProvenanceValue info={MLS}>{offer.concessions ? `−${usd(offer.concessions)}` : '$0'}</ProvenanceValue></dd>
          <dt className="fs-lines-total">Net proceeds</dt>
          <dd className="fs-lines-total"><ProvenanceValue info={AI}>{usd(e.netProceeds)}</ProvenanceValue></dd>
          <dt>Margin</dt>
          <dd><ProvenanceValue info={AI}>{usd(e.margin)} · {e.marginPct.toFixed(1)}%</ProvenanceValue></dd>
          <dt>vs. underwritten {e.uwMarginPct.toFixed(1)}%</dt>
          <dd className={tone(e.marginPts)}>
            <ProvenanceValue info={AI}>{e.marginPts > 0 ? '+' : e.marginPts < 0 ? '−' : ''}{Math.abs(e.marginPts).toFixed(1)} pts</ProvenanceValue>
          </dd>
        </dl>
      </div>
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────
function ListingRow({ asset, health }: { asset: Asset; health: ListingHealth }) {
  const { actions, acceptDrop, dismiss } = useListingActions();
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const l = asset.listing!;
  const action = actions[asset.id];
  const sessionDrop = action?.drops.at(-1);
  const rec = health.recommendation;
  const mark = asset.marks?.at(-1);
  const offers = l.offers ?? [];
  const drops = l.priceDropHistory ?? [];

  return (
    <li className={`fs-row fs-row--${health.diagnosis}`}>
      <div className="fs-row-main">
        <div className="fs-cell fs-cell--asset">
          <Link to={`/asset/${asset.id}`} className="fs-address">{asset.address}</Link>
          <span className="fs-sub">{asset.id} · {asset.city}, {asset.market}</span>
        </div>
        <div className="fs-cell">
          <span className="fs-label">List price</span>
          <ProvenanceValue info={sessionDrop ? { provenance: 'human', note: `Dropped by ${sessionDrop.loggedBy}` } : MLS}>
            {usd(l.listPrice)}
          </ProvenanceValue>
        </div>
        <div className="fs-cell">
          <span className="fs-label">Current mark</span>
          <ProvenanceValue info={markProvenance(mark)}>{mark ? usd(mark.value) : '—'}</ProvenanceValue>
        </div>
        <div className="fs-cell fs-cell--dom">
          <span className="fs-label">Days on market</span>
          <DomBar days={l.daysOnMarket} norm={health.norm.typicalDaysOnMarket} />
        </div>
        <div className="fs-cell fs-cell--spark">
          <span className="fs-label">
            Showings/wk <ProvenanceValue info={MLS}>{health.showingsPerWeek.toFixed(1)}</ProvenanceValue>
            <span className="fs-muted"> · norm <ProvenanceValue info={NORM}>{health.norm.showingsPerWeek}</ProvenanceValue></span>
          </span>
          {l.weeklyHistory && <Sparkline weeks={l.weeklyHistory} norm={health.norm.showingsPerWeek} />}
        </div>
        <div className="fs-cell">
          <span className="fs-label">Offers</span>
          {offers.length === 0 ? (
            <span className="fs-muted">None</span>
          ) : (
            offers.map((o) => (
              <span key={o.date} className={`fs-offer fs-offer--${o.status}`}>
                <ProvenanceValue info={MLS}>{usdCompact(o.amount)}</ProvenanceValue> {o.status}
              </span>
            ))
          )}
        </div>
        <div className="fs-cell">
          <span className="fs-label">Price drops</span>
          {drops.length === 0 ? (
            <span className="fs-muted">None</span>
          ) : (
            drops.map((d) => (
              <span key={d.date} className="fs-drop">
                {shortDate(d.date)}{' '}
                <ProvenanceValue info={d.loggedBy ? { provenance: 'human', note: `Logged by ${d.loggedBy}` } : MLS}>
                  −{usdCompact(d.from - d.to)}
                </ProvenanceValue>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="fs-row-foot">
        <span className={`fs-diag fs-diag--${health.diagnosis}`}>
          <ProvenanceValue info={AI}>{DIAGNOSIS_LABELS[health.diagnosis]}</ProvenanceValue>
        </span>
        <span className="fs-reason"><ProvenanceValue info={AI}>{health.reason}</ProvenanceValue></span>

        <div className="fs-action">
          {sessionDrop ? (
            <span className="fs-done">
              Dropped {usdCompact(sessionDrop.from - sessionDrop.to)} to {usd(sessionDrop.to)} · logged by {sessionDrop.loggedBy}
            </span>
          ) : action?.dismissal ? (
            <span className="fs-done fs-done--dismissed">Dismissed: {action.dismissal.reason}</span>
          ) : (
            <>
              <span className="fs-rec">
                <ProvenanceValue info={AI}>{rec.text}</ProvenanceValue>
                {rec.kind === 'drop' && rec.markdown !== undefined && (
                  <span className="fs-markdown">
                    Requires mark-down <ProvenanceValue info={AI}>{usd(rec.markdown)}</ProvenanceValue>
                  </span>
                )}
              </span>
              {rec.kind === 'drop' && !dismissing && (
                <>
                  <button className="pf-btn pf-btn--small pf-btn--primary" onClick={() => acceptDrop(asset, rec.newPrice)}>Accept</button>
                  <button className="pf-btn pf-btn--small" onClick={() => setDismissing(true)}>Dismiss</button>
                </>
              )}
              {health.activeOffer && (
                <button className="pf-btn pf-btn--small" aria-expanded={evaluating} onClick={() => setEvaluating((v) => !v)}>
                  {evaluating ? 'Hide evaluation' : 'Evaluate offer'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {dismissing && !action?.dismissal && (
        <form
          className="fs-dismiss"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) {
              dismiss(asset, reason.trim());
              setDismissing(false);
            }
          }}
        >
          <input
            className="pf-approval-input"
            value={reason}
            maxLength={140}
            placeholder="Why not? (required)"
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
          <button type="button" className="pf-btn pf-btn--small" onClick={() => setDismissing(false)}>Cancel</button>
          <button type="submit" className="pf-btn pf-btn--small pf-btn--primary" disabled={!reason.trim()}>Dismiss</button>
        </form>
      )}

      {evaluating && health.activeOffer && <OfferEvaluation asset={asset} offer={health.activeOffer} />}
    </li>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function ForSalePage() {
  const { reviews, published } = useMarkReviews();
  const { actions } = useListingActions();
  const listings = withListingActions(withMarkReviews(ASSETS, reviews, published), actions)
    .filter((a) => a.stage === 'for_sale' && a.listing)
    .map((asset) => ({ asset, health: listingHealth(asset) }));

  const acted = (id: string) => (actions[id]?.drops.length ?? 0) > 0 || actions[id]?.dismissal !== undefined;
  const sorted = [...listings].sort(
    (a, b) =>
      Number(acted(a.asset.id)) - Number(acted(b.asset.id)) ||
      DIAGNOSIS_URGENCY.indexOf(a.health.diagnosis) - DIAGNOSIS_URGENCY.indexOf(b.health.diagnosis) ||
      b.health.domRatio - a.health.domRatio,
  );

  const totalList = listings.reduce((s, { asset }) => s + asset.listing!.listPrice, 0);
  const avgDom = listings.reduce((s, { asset }) => s + asset.listing!.daysOnMarket, 0) / listings.length;
  const avgNorm = listings.reduce((s, { health }) => s + health.norm.typicalDaysOnMarket, 0) / listings.length;
  const needAction = listings.filter(({ asset, health }) => health.diagnosis !== 'healthy' && !acted(asset.id)).length;

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">For Sale</h1>
          <p className="oq-subtitle">Listing health against each market’s norms, most urgent first.</p>
        </div>
      </div>

      <div className="fs-summary">
        <div className="fs-stat">
          <span className="fs-stat-label">Listings</span>
          <span className="fs-stat-value">{listings.length}</span>
        </div>
        <div className="fs-stat">
          <span className="fs-stat-label">Total list value</span>
          <span className="fs-stat-value"><ProvenanceValue info={MLS}>{usdCompact(totalList)}</ProvenanceValue></span>
        </div>
        <div className="fs-stat">
          <span className="fs-stat-label">Avg days on market</span>
          <span className="fs-stat-value">
            <ProvenanceValue info={MLS}>{Math.round(avgDom)}</ProvenanceValue>
            <span className="fs-stat-sub"> vs <ProvenanceValue info={NORM}>{Math.round(avgNorm)}</ProvenanceValue> norm</span>
          </span>
        </div>
        <div className="fs-stat">
          <span className="fs-stat-label">Need action</span>
          <span className={`fs-stat-value ${needAction > 0 ? 'fs-stat-value--attention' : ''}`}>
            <ProvenanceValue info={AI}>{needAction}</ProvenanceValue>
          </span>
        </div>
      </div>

      <ProvenanceLegend />

      <ul className="fs-rows">
        {sorted.map(({ asset, health }) => (
          <ListingRow key={asset.id} asset={asset} health={health} />
        ))}
      </ul>
    </div>
  );
}

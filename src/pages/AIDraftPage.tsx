import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { ADU_RULE, TARGET_MARGIN_PCT, getAIDraft } from '../data/aiDrafts';
import type { AIDraft, Confidence, DraftSectionKey } from '../data/aiDrafts';
import { PIPELINE_STAGES } from '../data/selectors';
import { CARRY_COST_PCT, CLOSING_COST_PCT, SELLING_COST_PCT } from '../data/underwriting';
import type { ProvenanceInfo } from '../types';
import './UnderwritePage.css';
import './AIDraftPage.css';

const AI: ProvenanceInfo = { provenance: 'ai' };
const SFDC: ProvenanceInfo = { provenance: 'system', source: 'Salesforce' };
const MLS: ProvenanceInfo = { provenance: 'system', source: 'MLS' };

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function usd(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function sqft(n: number) {
  return `${Math.round(n).toLocaleString()} sqft`;
}

function ft(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ft`;
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function signedUsd(n: number) {
  return `${n < 0 ? '−' : '+'}${usd(Math.abs(n))}`;
}

function ConfidenceChip({ level }: { level: Confidence }) {
  return <span className={`ad-chip ad-chip--${level}`}>{CONFIDENCE_LABELS[level]} confidence</span>;
}

function Section({
  draft,
  section,
  title,
  children,
}: {
  draft: AIDraft;
  section: DraftSectionKey;
  title: string;
  children: ReactNode;
}) {
  const note = draft.notes[section];
  return (
    <section className="uw-card ad-section">
      <div className="ad-section-header">
        <h2 className="ad-section-title">{title}</h2>
        <ConfidenceChip level={draft.confidence[section]} />
      </div>
      {note && <p className={`ad-note ad-note--${draft.confidence[section]}`}>{note}</p>}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ad-field">
      <span className="ad-field-label">{label}</span>
      <span className="ad-field-value">{children}</span>
    </div>
  );
}

export default function AIDraftPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const draft = id ? getAIDraft(id) : undefined;

  if (!draft || !PIPELINE_STAGES.includes(draft.asset.stage)) {
    return (
      <div className="uw-page">
        <div className="uw-not-found">
          <p>No AI draft for <strong>{id}</strong>. Drafts exist only for opportunity- and underwriting-stage assets.</p>
          <button className="uw-back-btn" onClick={() => navigate('/underwrite')}>← Back to Underwrite</button>
        </div>
      </div>
    );
  }

  const { asset, lot, plans, adu, comps, recommendation: rec } = draft;
  const overall = draft.overallConfidence;
  const derivation = rec.espDerivation;
  const askingGap = rec.costs.land - rec.maxLandPrice;

  return (
    <div className="uw-page ad-page">
      <div className="uw-breadcrumb">
        <button className="uw-breadcrumb-link" onClick={() => navigate('/underwrite')}>Underwrite</button>
        <span className="uw-breadcrumb-sep">›</span>
        <button className="uw-breadcrumb-link" onClick={() => navigate(`/underwrite/${asset.id}`)}>{asset.id}</button>
        <span className="uw-breadcrumb-sep">›</span>
        <span className="uw-breadcrumb-current">AI Draft</span>
      </div>

      {/* Header */}
      <div className="uw-header">
        <div>
          <h1 className="uw-title">{asset.address}</h1>
          <p className="uw-subtitle ad-meta">
            {asset.city}, {asset.state} {asset.zip}
            <span className="ad-meta-sep">·</span>
            {asset.market}
            <span className="ad-meta-sep">·</span>
            <ProvenanceValue info={SFDC}>{sqft(asset.lotSqFt)} lot</ProvenanceValue>
          </p>
          <p className="ad-drafted">Drafted by AI in {draft.draftedInSec}s</p>
        </div>
        <div className={`ad-score ad-score--${overall}`}>
          <span className="ad-score-label">Overall confidence</span>
          <span className="ad-score-value">
            <ProvenanceValue info={AI}>{draft.confidenceScore}</ProvenanceValue>
            <span className="ad-score-max">/100</span>
          </span>
        </div>
      </div>

      {/* AI summary */}
      <div className="ad-summary">
        <p className="ad-summary-line">
          <strong>Offer:</strong> {rec.plan.plan.name}, max land price{' '}
          <ProvenanceValue info={AI}>{usd(rec.maxLandPrice)}</ProvenanceValue> at {TARGET_MARGIN_PCT}% margin
          {askingGap > 0 ? (
            <>
              {' '}— asking is <ProvenanceValue info={AI}>{usd(askingGap)}</ProvenanceValue> over.
            </>
          ) : (
            <>
              {' '}— asking <ProvenanceValue info={SFDC}>{usd(rec.costs.land)}</ProvenanceValue> clears it.
            </>
          )}
        </p>
        <p className="ad-summary-line">
          <strong>Verify first:</strong> {draft.topRisk}
        </p>
      </div>

      <ProvenanceLegend />

      <div className="ad-sections">
        {/* Lot & zoning */}
        <Section draft={draft} section="lot" title="Lot & Zoning">
          <div className="ad-fields">
            <Field label="Lot dimensions">
              <ProvenanceValue info={SFDC}>{ft(lot.widthFt)} × {ft(lot.depthFt)}</ProvenanceValue>
            </Field>
            <Field label="Zoning">
              <ProvenanceValue info={SFDC}>{lot.zoning}</ProvenanceValue>
            </Field>
            <Field label="Setbacks (front / side / rear)">
              <ProvenanceValue info={SFDC}>
                {lot.setbacks.front} / {lot.setbacks.side} / {lot.setbacks.rear} ft
              </ProvenanceValue>
            </Field>
            <Field label="Max lot coverage">
              <ProvenanceValue info={SFDC}>{lot.maxCoveragePct}%</ProvenanceValue>
            </Field>
            <Field label="Buildable envelope">
              <ProvenanceValue info={AI}>
                {ft(lot.envelopeWidthFt)} × {ft(lot.envelopeDepthFt)} ({sqft(lot.envelopeSqFt)})
              </ProvenanceValue>
            </Field>
            <Field label="Buildable area (envelope or coverage cap)">
              <ProvenanceValue info={AI}>{sqft(lot.buildableSqFt)}</ProvenanceValue>
            </Field>
            <Field label={`Primary footprint (${rec.plan.plan.name})`}>
              <ProvenanceValue info={AI}>{sqft(lot.footprintSqFt)}</ProvenanceValue>
              <span className="ad-sub">
                {' '}· <ProvenanceValue info={AI}>{lot.coveragePct}%</ProvenanceValue> coverage
              </span>
            </Field>
            <Field label="Remaining buildable area">
              <ProvenanceValue info={AI}>{sqft(lot.remainingSqFt)}</ProvenanceValue>
            </Field>
          </div>
        </Section>

        {/* Feasible plans */}
        <Section draft={draft} section="plans" title="Feasible Plans">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th className="ad-num">Sqft</th>
                <th className="ad-num">Footprint</th>
                <th className="ad-num">ESP</th>
                <th className="ad-num">Build</th>
                <th className="ad-num">Total cost</th>
                <th className="ad-num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p, i) => (
                <tr key={p.plan.id}>
                  <td>
                    <span className="ad-plan-name">{p.plan.name}</span>
                    {i === 0 && <span className="ad-rec-tag">Recommended</span>}
                    <span className="ad-plan-meta">{p.plan.beds} bd · {p.plan.baths} ba</span>
                  </td>
                  <td className="ad-num"><ProvenanceValue info={AI}>{p.sqft.toLocaleString()}</ProvenanceValue></td>
                  <td className="ad-num">
                    <ProvenanceValue info={AI}>{p.widthFt.toFixed(1)} × {p.depthFt.toFixed(1)} ft</ProvenanceValue>
                  </td>
                  <td className="ad-num"><ProvenanceValue info={AI}>{usd(p.esp)}</ProvenanceValue></td>
                  <td className="ad-num"><ProvenanceValue info={AI}>{usd(p.build)}</ProvenanceValue></td>
                  <td className="ad-num"><ProvenanceValue info={AI}>{usd(p.costs.total)}</ProvenanceValue></td>
                  <td className={`ad-num ${p.marginPct < TARGET_MARGIN_PCT ? 'ad-below-target' : 'ad-margin'}`}>
                    <ProvenanceValue info={AI}>{p.marginPct.toFixed(1)}%</ProvenanceValue>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* ADU fit */}
        <Section draft={draft} section="adu" title="ADU Fit">
          {adu.fits ? (
            <div className="ad-adu ad-adu--fits">
              <span className="ad-adu-flag">ADU fits</span>
              <p className="ad-adu-text">
                Suggested: <strong>{adu.type}</strong>,{' '}
                <ProvenanceValue info={AI}>{sqft(adu.sqft!)}</ProvenanceValue>, {adu.layout}
              </p>
            </div>
          ) : (
            <div className="ad-adu">
              <span className="ad-adu-flag ad-adu-flag--none">No ADU</span>
              <p className="ad-adu-text">Remaining area or rear yard is too small for an ADU.</p>
            </div>
          )}
          <div className="ad-fields">
            <Field label="Remaining buildable area">
              <ProvenanceValue info={AI}>{sqft(lot.remainingSqFt)}</ProvenanceValue>
            </Field>
            <Field label="Rear yard (back of primary to rear lot line)">
              <ProvenanceValue info={AI}>{ft(lot.rearYardFt)}</ProvenanceValue>
            </Field>
          </div>
          <p className="ad-footnote">{ADU_RULE}</p>
        </Section>

        {/* Comp set */}
        <Section draft={draft} section="comps" title="Comp Set">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Address</th>
                <th className="ad-num">Sold</th>
                <th className="ad-num">Sqft</th>
                <th className="ad-num">Sale price</th>
                <th className="ad-num">$/sqft</th>
                <th className="ad-num">Distance</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.address}>
                  <td>{c.address}</td>
                  <td className="ad-num"><ProvenanceValue info={MLS}>{shortDate(c.soldOn)}</ProvenanceValue></td>
                  <td className="ad-num"><ProvenanceValue info={MLS}>{c.sqft.toLocaleString()}</ProvenanceValue></td>
                  <td className="ad-num"><ProvenanceValue info={MLS}>{usd(c.salePrice)}</ProvenanceValue></td>
                  <td className="ad-num"><ProvenanceValue info={MLS}>{usd(c.pricePerSqft)}</ProvenanceValue></td>
                  <td className="ad-num"><ProvenanceValue info={MLS}>{c.distanceMi.toFixed(1)} mi</ProvenanceValue></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Median $/sqft</td>
                <td className="ad-num"><ProvenanceValue info={AI}>{usd(draft.medianPricePerSqft)}</ProvenanceValue></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Section>

        {/* Recommendation */}
        <Section draft={draft} section="recommendation" title="Recommendation">
          <p className="ad-rec-plan">
            Build <strong>{rec.plan.plan.name}</strong> against a land price of{' '}
            <ProvenanceValue info={SFDC}>{usd(rec.costs.land)}</ProvenanceValue>
          </p>
          <div className="ad-rec-columns">
            <div>
              <h3 className="ad-rec-heading">ESP derivation</h3>
              <dl className="ad-calc">
                <dt>
                  Median comp $/sqft × plan sqft
                  <span className="ad-calc-sub">
                    <ProvenanceValue info={AI}>{usd(derivation.medianPricePerSqft)}</ProvenanceValue> ×{' '}
                    <ProvenanceValue info={AI}>{derivation.sqft.toLocaleString()}</ProvenanceValue> sqft
                  </span>
                </dt>
                <dd><ProvenanceValue info={AI}>{usd(derivation.base)}</ProvenanceValue></dd>
                <dt>
                  Adjustment ({derivation.adjustmentPct > 0 ? '+' : ''}{derivation.adjustmentPct}%, rounded to $5K)
                  <span className="ad-calc-sub">{derivation.reason}</span>
                </dt>
                <dd><ProvenanceValue info={AI}>{signedUsd(derivation.adjustment)}</ProvenanceValue></dd>
                <dt className="ad-calc-total">ESP</dt>
                <dd className="ad-calc-total"><ProvenanceValue info={AI}>{usd(rec.esp)}</ProvenanceValue></dd>
              </dl>
            </div>
            <div>
              <h3 className="ad-rec-heading">Cost stack</h3>
              <dl className="ad-calc">
                <dt>Land</dt>
                <dd><ProvenanceValue info={SFDC}>{usd(rec.costs.land)}</ProvenanceValue></dd>
                <dt>Closing costs ({CLOSING_COST_PCT}% of land)</dt>
                <dd><ProvenanceValue info={AI}>{usd(rec.costs.closing)}</ProvenanceValue></dd>
                <dt>Build</dt>
                <dd><ProvenanceValue info={AI}>{usd(rec.costs.build)}</ProvenanceValue></dd>
                <dt>Carry / financing ({CARRY_COST_PCT}% of build)</dt>
                <dd><ProvenanceValue info={AI}>{usd(rec.costs.carry)}</ProvenanceValue></dd>
                <dt>Selling costs ({SELLING_COST_PCT}% of ESP)</dt>
                <dd><ProvenanceValue info={AI}>{usd(rec.costs.selling)}</ProvenanceValue></dd>
                <dt className="ad-calc-total">Total cost</dt>
                <dd className="ad-calc-total"><ProvenanceValue info={AI}>{usd(rec.costs.total)}</ProvenanceValue></dd>
              </dl>
            </div>
          </div>
          <div className="ad-rec-grid">
            <div className="ad-rec-stat">
              <span className="ad-rec-label">ESP</span>
              <span className="ad-rec-value"><ProvenanceValue info={AI}>{usd(rec.esp)}</ProvenanceValue></span>
            </div>
            <div className="ad-rec-stat">
              <span className="ad-rec-label">Total cost</span>
              <span className="ad-rec-value"><ProvenanceValue info={AI}>{usd(rec.costs.total)}</ProvenanceValue></span>
            </div>
            <div className="ad-rec-stat">
              <span className="ad-rec-label">Margin</span>
              <span className={`ad-rec-value${rec.marginPct < TARGET_MARGIN_PCT ? ' ad-below-target' : ' ad-margin'}`}>
                <ProvenanceValue info={AI}>{rec.marginPct.toFixed(1)}%</ProvenanceValue>
              </span>
              <span className="ad-rec-sub">(ESP − total cost) ÷ ESP</span>
            </div>
            <div className="ad-rec-stat">
              <span className="ad-rec-label">Max land price</span>
              <span className="ad-rec-value"><ProvenanceValue info={AI}>{usd(rec.maxLandPrice)}</ProvenanceValue></span>
              <span className="ad-rec-sub">at {TARGET_MARGIN_PCT}% target margin</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

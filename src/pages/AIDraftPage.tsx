import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { aduRuleText } from '../data/adu';
import {
  OVERRIDE_FIELDS,
  SECTION_OVERRIDE_FIELDS,
  TARGET_MARGIN_PCT,
  getAIDraft,
  getReviewedDraft,
} from '../data/aiDrafts';
import type { AIDraft, Confidence, DraftSectionKey, OverrideField, OverrideUnit } from '../data/aiDrafts';
import { demoNow } from '../data/dates';
import {
  DRAFT_SECTIONS,
  SECTION_TITLES,
  initialReview,
  overrideValues,
  reviewProgress,
  sectionStatus,
  useDraftReviews,
} from '../data/review';
import type { DraftReview, SectionStatus } from '../data/review';
import { AI, MLS, SFDC, human } from '../data/provenance';
import { useCanAct } from '../data/role';
import { PIPELINE_STAGES } from '../data/selectors';
import { CARRY_COST_PCT, CLOSING_COST_PCT, SELLING_COST_PCT } from '../data/underwriting';
import type { ProvenanceInfo } from '../types';
import './UnderwritePage.css';
import './AIDraftPage.css';

const ASSUMPTION = human('Underwriting assumption');

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const STATUS_LABELS: Record<SectionStatus, string> = {
  pending: 'Needs review',
  confirmed: 'Confirmed',
  overridden: 'Overridden',
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

function signedUsd(n: number) {
  return `${n < 0 ? '−' : '+'}${usd(Math.abs(n))}`;
}

function formatUnit(n: number, unit: OverrideUnit) {
  switch (unit) {
    case 'ft':
      return ft(n);
    case 'pct':
      return `${n}%`;
    case 'usd':
      return usd(n);
    case 'sqft':
      return sqft(n);
  }
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function submittedAt(iso: string, timeKnown: boolean) {
  return timeKnown
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Provenance for a displayed value once review has started: an overridden
 * field reads as a human override with its reason; AI values in a confirmed
 * or overridden section read as human-confirmed. System values stay system.
 */
function makeProvenance(review: DraftReview, analyst: string) {
  return (section: DraftSectionKey, base: ProvenanceInfo, field?: OverrideField): ProvenanceInfo => {
    const override = field && review.overrides[field];
    if (override) {
      const was = formatUnit(override.aiValue, OVERRIDE_FIELDS[field].unit);
      return { provenance: 'human', note: `Overridden by ${analyst}: ${override.reason} (was ${was})` };
    }
    if (base.provenance === 'ai' && sectionStatus(review, section) !== 'pending') {
      return { provenance: 'human', note: `Confirmed by ${analyst}` };
    }
    return base;
  };
}

function ConfidenceChip({ level }: { level: Confidence }) {
  return <span className={`ad-chip ad-chip--${level}`}>{CONFIDENCE_LABELS[level]} confidence</span>;
}

function OverrideForm({
  aiDraft,
  draft,
  section,
  onSave,
  onCancel,
}: {
  aiDraft: AIDraft;
  draft: AIDraft;
  section: DraftSectionKey;
  onSave: (field: OverrideField, value: number, aiValue: number, reason: string) => void;
  onCancel: () => void;
}) {
  const fields = SECTION_OVERRIDE_FIELDS[section];
  const [field, setField] = useState<OverrideField>(fields[0]);
  const [value, setValue] = useState(String(OVERRIDE_FIELDS[fields[0]].value(draft)));
  const [reason, setReason] = useState('');

  const meta = OVERRIDE_FIELDS[field];
  const parsed = Number(value.replace(/[$,\s]/g, ''));
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && reason.trim() !== '';

  function pickField(next: OverrideField) {
    setField(next);
    setValue(String(OVERRIDE_FIELDS[next].value(draft)));
  }

  return (
    <form
      className="ad-override"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(field, parsed, meta.value(aiDraft), reason.trim());
      }}
    >
      <div className="ad-override-row">
        {fields.length > 1 && (
          <label className="ad-override-field">
            <span>Value</span>
            <select value={field} onChange={(e) => pickField(e.target.value as OverrideField)}>
              {fields.map((f) => (
                <option key={f} value={f}>{OVERRIDE_FIELDS[f].label}</option>
              ))}
            </select>
          </label>
        )}
        <label className="ad-override-field ad-override-field--value">
          <span>{fields.length > 1 ? 'New value' : meta.label} ({meta.unit === 'pct' ? '%' : meta.unit === 'usd' ? '$' : meta.unit})</span>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label className="ad-override-field ad-override-field--reason">
          <span>Reason (required)</span>
          <input
            value={reason}
            maxLength={140}
            placeholder="e.g. City confirmed 7.5 ft side setback"
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </label>
      </div>
      <p className="ad-override-hint">
        AI drafted <ProvenanceValue info={AI}>{formatUnit(meta.value(aiDraft), meta.unit)}</ProvenanceValue>.
        Downstream values recompute.
      </p>
      <div className="ad-override-actions">
        <button type="button" className="ad-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="ad-btn ad-btn--primary" disabled={!valid}>Save override</button>
      </div>
    </form>
  );
}

function Section({
  aiDraft,
  draft,
  review,
  section,
  readOnly,
  onConfirm,
  onOverride,
  children,
}: {
  aiDraft: AIDraft;
  draft: AIDraft;
  review: DraftReview;
  section: DraftSectionKey;
  readOnly: boolean;
  onConfirm: () => void;
  onOverride: (field: OverrideField, value: number, aiValue: number, reason: string) => void;
  children: ReactNode;
}) {
  const [overriding, setOverriding] = useState(false);
  const status = sectionStatus(review, section);
  const note = draft.notes[section];

  return (
    <section className={`uw-card ad-section ad-section--${status}`}>
      <div className="ad-section-header">
        <h2 className="ad-section-title">{SECTION_TITLES[section]}</h2>
        <div className="ad-section-tools">
          <ConfidenceChip level={draft.confidence[section]} />
          {status !== 'pending' && <span className={`ad-status ad-status--${status}`}>{STATUS_LABELS[status]}</span>}
          {!readOnly && (
            <>
              {status === 'pending' && (
                <button className="ad-btn" onClick={onConfirm}>Confirm</button>
              )}
              <button className="ad-btn" onClick={() => setOverriding(true)} disabled={overriding}>Override</button>
            </>
          )}
        </div>
      </div>
      {overriding && !readOnly && (
        <OverrideForm
          aiDraft={aiDraft}
          draft={draft}
          section={section}
          onCancel={() => setOverriding(false)}
          onSave={(field, value, aiValue, reason) => {
            onOverride(field, value, aiValue, reason);
            setOverriding(false);
          }}
        />
      )}
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

function ReviewPanel({
  draft,
  review,
  drafting,
  onAnswer,
  onConfirmHigh,
  onSubmit,
}: {
  draft: AIDraft;
  review: DraftReview;
  drafting: boolean;
  onAnswer: (index: number, answer: string) => void;
  onConfirmHigh: (sections: DraftSectionKey[]) => void;
  onSubmit: () => void;
}) {
  const progress = reviewProgress(draft, review);
  const canAct = useCanAct();
  const unsure = DRAFT_SECTIONS.filter((s) => draft.confidence[s] !== 'high');
  const readOnly = drafting || review.submitted !== undefined || !canAct;
  const totalItems = DRAFT_SECTIONS.length + draft.openQuestions.length;
  const resolvedPct = Math.round(((totalItems - progress.itemsNeedingYou) / totalItems) * 100);
  const highPending = DRAFT_SECTIONS.filter((s) => draft.confidence[s] === 'high' && sectionStatus(review, s) === 'pending');

  const blockers = [
    progress.sectionsLeft > 0 && `confirm or override ${progress.sectionsLeft} ${progress.sectionsLeft === 1 ? 'section' : 'sections'}`,
    progress.questionsLeft > 0 && `answer ${progress.questionsLeft} ${progress.questionsLeft === 1 ? 'question' : 'questions'}`,
  ].filter(Boolean);

  return (
    <aside className="ad-panel" aria-label="Needs a human">
      <h2 className="ad-panel-title">Needs a human</h2>
      {drafting ? (
        <p className="ad-panel-progress">AI is still drafting. Review opens when the draft is ready.</p>
      ) : (
        <>
          <p className="ad-panel-progress">
            <span className="ad-progress-line">
              AI drafted <strong>{progress.sectionsDrafted} of {DRAFT_SECTIONS.length}</strong> sections
            </span>
            <span className="ad-progress-line">
              Your review: <strong>{progress.sectionsReviewed} of {DRAFT_SECTIONS.length}</strong> confirmed
              {progress.questionsLeft > 0 && (
                <span className="ad-progress-aside">
                  {' '}· {progress.questionsLeft} {progress.questionsLeft === 1 ? 'question' : 'questions'} open
                </span>
              )}
            </span>
          </p>
          <div className="ad-panel-bar" aria-hidden="true">
            <span style={{ width: `${resolvedPct}%` }} />
          </div>
          {!readOnly && highPending.length > 0 && (
            <button className="ad-btn ad-btn--primary ad-confirm-high" onClick={() => onConfirmHigh(highPending)}>
              Confirm all High-confidence sections ({highPending.length})
            </button>
          )}
        </>
      )}

      <h3 className="ad-panel-heading">What the AI completed</h3>
      <ul className="ad-checklist">
        {DRAFT_SECTIONS.map((s) => {
          const status = sectionStatus(review, s);
          return (
            <li key={s} className={`ad-check ad-check--${status}`}>
              <span className="ad-check-icon" aria-hidden="true">{status === 'pending' ? '○' : '✓'}</span>
              <span className="ad-check-name">{SECTION_TITLES[s]}</span>
              <span className={`ad-check-level ad-check-level--${draft.confidence[s]}`}>
                {CONFIDENCE_LABELS[draft.confidence[s]]}
              </span>
              <span className="ad-check-status">{STATUS_LABELS[status]}</span>
            </li>
          );
        })}
      </ul>

      <h3 className="ad-panel-heading">What it was unsure about</h3>
      {unsure.length === 0 ? (
        <p className="ad-panel-empty">Nothing. Every section was drafted at High confidence.</p>
      ) : (
        <ul className="ad-unsure">
          {unsure.map((s) => (
            <li key={s}>
              <span className={`ad-check-level ad-check-level--${draft.confidence[s]}`}>
                {CONFIDENCE_LABELS[draft.confidence[s]]}
              </span>{' '}
              <strong>{SECTION_TITLES[s]}:</strong> {draft.notes[s]}
            </li>
          ))}
        </ul>
      )}

      <h3 className="ad-panel-heading">Open questions</h3>
      <ol className="ad-questions">
        {draft.openQuestions.map((q, i) => (
          <li key={q.question} className="ad-question">
            <label htmlFor={`q-${i}`} className="ad-question-text">{q.question}</label>
            <textarea
              id={`q-${i}`}
              className="ad-answer"
              rows={2}
              placeholder={readOnly ? '' : 'Your answer'}
              value={review.answers[i] ?? ''}
              readOnly={readOnly}
              onChange={(e) => onAnswer(i, e.target.value)}
            />
          </li>
        ))}
      </ol>

      {review.submitted ? (
        <p className="ad-submitted">
          Submitted to Growth by <strong>{review.submitted.by}</strong> on{' '}
          {submittedAt(review.submitted.at, review.submitted.timeKnown)}
        </p>
      ) : !canAct ? (
        <p className="ad-submit-hint">Executive view: review actions are hidden.</p>
      ) : (
        <>
          <button className="ad-submit" disabled={!progress.canSubmit} onClick={onSubmit}>
            Submit to Growth
          </button>
          {!drafting && blockers.length > 0 && (
            <p className="ad-submit-hint">To submit, {blockers.join(' and ')}.</p>
          )}
        </>
      )}
    </aside>
  );
}

export default function AIDraftPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reviews, updateReview } = useDraftReviews();
  const canAct = useCanAct();
  const aiDraft = id ? getAIDraft(id) : undefined;

  if (!aiDraft || !PIPELINE_STAGES.includes(aiDraft.asset.stage)) {
    return (
      <div className="uw-page">
        <div className="uw-not-found">
          <p>No AI draft for <strong>{id}</strong>. Drafts exist only for opportunity- and underwriting-stage assets.</p>
          <button className="uw-back-btn" onClick={() => navigate('/underwrite')}>← Back to Underwrite</button>
        </div>
      </div>
    );
  }

  const review = reviews[aiDraft.asset.id] ?? initialReview(aiDraft);
  const draft = getReviewedDraft(aiDraft.asset.id, overrideValues(review))!;
  const { asset, lot, plans, adu, comps, recommendation: rec } = draft;
  const analyst = asset.analyst ?? 'Analyst';
  const drafting = asset.underwritingStatus === 'ai_drafting';
  const readOnly = drafting || review.submitted !== undefined || !canAct;
  const pv = makeProvenance(review, analyst);

  const overall = draft.overallConfidence;
  const derivation = rec.espDerivation;
  const askingGap = rec.costs.land - rec.maxLandPrice;

  const sectionProps = (section: DraftSectionKey) => ({
    aiDraft,
    draft,
    review,
    section,
    readOnly,
    onConfirm: () =>
      updateReview(aiDraft, (r) => ({ ...r, confirmed: { ...r.confirmed, [section]: true } })),
    onOverride: (field: OverrideField, value: number, aiValue: number, reason: string) =>
      updateReview(aiDraft, (r) => ({ ...r, overrides: { ...r.overrides, [field]: { value, aiValue, reason } } })),
  });

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
          <p className="ad-drafted">
            Drafted by AI in {draft.draftedInSec}s
            <span className="ad-meta-sep">·</span>
            <Link to={`/asset/${asset.id}`} className="ad-record-link">View asset record</Link>
          </p>
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
          <ProvenanceValue info={pv('recommendation', AI)}>{usd(rec.maxLandPrice)}</ProvenanceValue> at {TARGET_MARGIN_PCT}% margin
          {askingGap > 0 ? (
            <>
              {' '}— asking is <ProvenanceValue info={pv('recommendation', AI)}>{usd(askingGap)}</ProvenanceValue> over.
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

      <div className="ad-layout">
        <div className="ad-sections">
          {/* Lot & zoning */}
          <Section {...sectionProps('lot')}>
            <div className="ad-fields">
              <Field label="Lot dimensions">
                <ProvenanceValue info={SFDC}>{ft(lot.widthFt)} × {ft(lot.depthFt)}</ProvenanceValue>
              </Field>
              <Field label="Zoning">
                <ProvenanceValue info={SFDC}>{lot.zoning}</ProvenanceValue>
              </Field>
              <Field label="Flood zone">
                <ProvenanceValue info={SFDC}>{lot.floodZone ? 'Yes' : 'No'}</ProvenanceValue>
              </Field>
              <Field label="Front setback">
                <ProvenanceValue info={pv('lot', SFDC, 'frontSetback')}>{ft(lot.setbacks.front)}</ProvenanceValue>
              </Field>
              <Field label="Side setback">
                <ProvenanceValue info={pv('lot', SFDC, 'sideSetback')}>{ft(lot.setbacks.side)}</ProvenanceValue>
              </Field>
              <Field label="Rear setback">
                <ProvenanceValue info={pv('lot', SFDC, 'rearSetback')}>{ft(lot.setbacks.rear)}</ProvenanceValue>
              </Field>
              <Field label="Max lot coverage">
                <ProvenanceValue info={pv('lot', SFDC, 'maxCoveragePct')}>{lot.maxCoveragePct}%</ProvenanceValue>
              </Field>
              <Field label="Buildable envelope">
                <ProvenanceValue info={pv('lot', AI)}>
                  {ft(lot.envelopeWidthFt)} × {ft(lot.envelopeDepthFt)} ({sqft(lot.envelopeSqFt)})
                </ProvenanceValue>
              </Field>
              <Field label="Buildable area (envelope or coverage cap)">
                <ProvenanceValue info={pv('lot', AI)}>{sqft(lot.buildableSqFt)}</ProvenanceValue>
              </Field>
              <Field label={`Primary footprint (${rec.plan.plan.name})`}>
                <ProvenanceValue info={pv('lot', AI)}>{sqft(lot.footprintSqFt)}</ProvenanceValue>
                <span className="ad-sub">
                  {' '}· <ProvenanceValue info={pv('lot', AI)}>{lot.coveragePct}%</ProvenanceValue> coverage
                </span>
              </Field>
              <Field label="Remaining buildable area">
                <ProvenanceValue info={pv('lot', AI)}>{sqft(lot.remainingSqFt)}</ProvenanceValue>
              </Field>
            </div>
          </Section>

          {/* Feasible plans */}
          <Section {...sectionProps('plans')}>
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
                      {!p.fits && <span className="ad-nofit-tag">No longer fits</span>}
                      <span className="ad-plan-meta">{p.plan.beds} bd · {p.plan.baths} ba</span>
                    </td>
                    <td className="ad-num"><ProvenanceValue info={pv('plans', AI)}>{p.sqft.toLocaleString()}</ProvenanceValue></td>
                    <td className="ad-num">
                      <ProvenanceValue info={pv('plans', AI)}>{p.widthFt.toFixed(1)} × {p.depthFt.toFixed(1)} ft</ProvenanceValue>
                    </td>
                    <td className="ad-num">
                      <ProvenanceValue info={i === 0 ? pv('recommendation', AI, 'esp') : pv('plans', AI)}>{usd(p.esp)}</ProvenanceValue>
                    </td>
                    <td className="ad-num">
                      <ProvenanceValue info={pv('plans', AI, i === 0 ? 'recBuild' : undefined)}>{usd(p.build)}</ProvenanceValue>
                    </td>
                    <td className="ad-num"><ProvenanceValue info={pv('plans', AI)}>{usd(p.costs.total)}</ProvenanceValue></td>
                    <td className={`ad-num ${p.marginPct < TARGET_MARGIN_PCT ? 'ad-below-target' : 'ad-margin'}`}>
                      <ProvenanceValue info={pv('plans', AI)}>{p.marginPct.toFixed(1)}%</ProvenanceValue>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* ADU fit */}
          <Section {...sectionProps('adu')}>
            {!adu.offered ? (
              <div className="ad-adu">
                <span className="ad-adu-flag ad-adu-flag--none">Not offered</span>
                <p className="ad-adu-text">{adu.notOfferedReason}</p>
              </div>
            ) : adu.fits ? (
              <div className="ad-adu ad-adu--fits">
                <span className="ad-adu-flag">ADU fits</span>
                <p className="ad-adu-text">
                  Suggested: <strong>{adu.type}</strong>,{' '}
                  <ProvenanceValue info={pv('adu', AI, 'aduSqft')}>{sqft(adu.sqft!)}</ProvenanceValue>, {adu.layout}
                </p>
                <span className={`ad-adu-verdict ad-adu-verdict--${adu.verdict}`}>
                  {adu.verdict === 'adds' ? 'Adds ' : 'Fits but thin · '}
                  <ProvenanceValue info={pv('adu', AI)}>{signedUsd(adu.marginDelta!)}</ProvenanceValue> margin
                </span>
              </div>
            ) : (
              <div className="ad-adu">
                <span className="ad-adu-flag ad-adu-flag--none">No ADU</span>
                <ul className="ad-adu-reasons">
                  {adu.failReasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            )}
            {adu.note && <p className="ad-note ad-note--medium">{adu.note}</p>}
            <div className="ad-fields">
              <Field label="Remaining buildable area">
                <ProvenanceValue info={pv('adu', AI)}>{sqft(lot.remainingSqFt)}</ProvenanceValue>
              </Field>
              <Field label="Rear yard (back of primary to rear lot line)">
                <ProvenanceValue info={pv('adu', AI)}>{ft(lot.rearYardFt)}</ProvenanceValue>
              </Field>
            </div>
            <p className="ad-footnote">{aduRuleText(asset.market)}</p>
          </Section>

          {/* Comp set */}
          <Section {...sectionProps('comps')}>
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
                  <td className="ad-num">
                    <ProvenanceValue info={pv('comps', AI, 'medianPricePerSqft')}>{usd(draft.medianPricePerSqft)}</ProvenanceValue>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </Section>

          {/* Recommendation */}
          <Section {...sectionProps('recommendation')}>
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
                      <ProvenanceValue info={pv('comps', AI, 'medianPricePerSqft')}>{usd(derivation.medianPricePerSqft)}</ProvenanceValue> ×{' '}
                      <ProvenanceValue info={pv('recommendation', AI)}>{derivation.sqft.toLocaleString()}</ProvenanceValue> sqft
                    </span>
                  </dt>
                  <dd><ProvenanceValue info={pv('recommendation', AI)}>{usd(derivation.base)}</ProvenanceValue></dd>
                  <dt>
                    {review.overrides.esp
                      ? 'Adjustment (analyst override)'
                      : (
                        <>
                          Adjustment (
                          <ProvenanceValue info={pv('recommendation', AI)}>
                            {derivation.adjustmentPct > 0 ? '+' : ''}{derivation.adjustmentPct}%
                          </ProvenanceValue>
                          , rounded to $5K)
                        </>
                      )}
                    <span className="ad-calc-sub">{review.overrides.esp?.reason ?? derivation.reason}</span>
                  </dt>
                  <dd><ProvenanceValue info={pv('recommendation', AI, 'esp')}>{signedUsd(derivation.adjustment)}</ProvenanceValue></dd>
                  <dt className="ad-calc-total">ESP</dt>
                  <dd className="ad-calc-total"><ProvenanceValue info={pv('recommendation', AI, 'esp')}>{usd(rec.esp)}</ProvenanceValue></dd>
                </dl>
              </div>
              <div>
                <h3 className="ad-rec-heading">Cost stack</h3>
                <dl className="ad-calc">
                  <dt>Land</dt>
                  <dd><ProvenanceValue info={SFDC}>{usd(rec.costs.land)}</ProvenanceValue></dd>
                  <dt>Closing costs (<ProvenanceValue info={ASSUMPTION}>{CLOSING_COST_PCT}%</ProvenanceValue> of land)</dt>
                  <dd><ProvenanceValue info={pv('recommendation', AI)}>{usd(rec.costs.closing)}</ProvenanceValue></dd>
                  <dt>Build</dt>
                  <dd><ProvenanceValue info={pv('plans', AI, 'recBuild')}>{usd(rec.costs.build)}</ProvenanceValue></dd>
                  <dt>Carry / financing (<ProvenanceValue info={ASSUMPTION}>{CARRY_COST_PCT}%</ProvenanceValue> of build)</dt>
                  <dd><ProvenanceValue info={pv('recommendation', AI)}>{usd(rec.costs.carry)}</ProvenanceValue></dd>
                  <dt>Selling costs (<ProvenanceValue info={ASSUMPTION}>{SELLING_COST_PCT}%</ProvenanceValue> of ESP)</dt>
                  <dd><ProvenanceValue info={pv('recommendation', AI)}>{usd(rec.costs.selling)}</ProvenanceValue></dd>
                  <dt className="ad-calc-total">Total cost</dt>
                  <dd className="ad-calc-total"><ProvenanceValue info={pv('recommendation', AI)}>{usd(rec.costs.total)}</ProvenanceValue></dd>
                </dl>
              </div>
            </div>
            <div className="ad-rec-grid">
              <div className="ad-rec-stat">
                <span className="ad-rec-label">ESP</span>
                <span className="ad-rec-value"><ProvenanceValue info={pv('recommendation', AI, 'esp')}>{usd(rec.esp)}</ProvenanceValue></span>
              </div>
              <div className="ad-rec-stat">
                <span className="ad-rec-label">Total cost</span>
                <span className="ad-rec-value"><ProvenanceValue info={pv('recommendation', AI)}>{usd(rec.costs.total)}</ProvenanceValue></span>
              </div>
              <div className="ad-rec-stat">
                <span className="ad-rec-label">Margin</span>
                <span className={`ad-rec-value${rec.marginPct < TARGET_MARGIN_PCT ? ' ad-below-target' : ' ad-margin'}`}>
                  <ProvenanceValue info={pv('recommendation', AI)}>{rec.marginPct.toFixed(1)}%</ProvenanceValue>
                </span>
                <span className="ad-rec-sub">(ESP − total cost) ÷ ESP</span>
              </div>
              <div className="ad-rec-stat">
                <span className="ad-rec-label">Max land price</span>
                <span className="ad-rec-value"><ProvenanceValue info={pv('recommendation', AI)}>{usd(rec.maxLandPrice)}</ProvenanceValue></span>
                <span className="ad-rec-sub">at {TARGET_MARGIN_PCT}% target margin</span>
              </div>
            </div>
          </Section>
        </div>

        <ReviewPanel
          draft={draft}
          review={review}
          drafting={drafting}
          onAnswer={(index, answer) =>
            updateReview(aiDraft, (r) => ({ ...r, answers: { ...r.answers, [index]: answer } }))
          }
          onConfirmHigh={(sections) =>
            updateReview(aiDraft, (r) => ({
              ...r,
              confirmed: { ...r.confirmed, ...Object.fromEntries(sections.map((s) => [s, true])) },
            }))
          }
          onSubmit={() =>
            updateReview(aiDraft, (r) => ({ ...r, submitted: { by: analyst, at: demoNow(), timeKnown: true } }))
          }
        />
      </div>
    </div>
  );
}

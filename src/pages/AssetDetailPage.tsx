import { useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ConstructionDetail, { MarginImpactLine, StatusChip } from '../components/ConstructionDetail';
import { eacInfo, weeksLate } from '../components/constructionFormat';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { getAIDraft } from '../data/aiDrafts';
import { AI, BLUEPRINT, MLS, SFDC, TAPE, computed, human, markProvenance } from '../data/provenance';
import { ASSETS } from '../data/assets';
import { DEMO_TODAY } from '../data/dates';
import { useListingActions, withListingActions } from '../data/listingActions';
import { useFromPage } from '../data/navHistory';
import { useMarkReviews, withMarkReviews } from '../data/markReview';
import { useDraftReviews, withReviewStatus } from '../data/review';
import { APPROVAL_THRESHOLD, PIPELINE_STAGES, constructionStatus, constructionSummary, stageHistory, underwritingGap } from '../data/selectors';
import type { GapLine } from '../data/selectors';
import { CARRY_COST_PCT, SELLING_COST_PCT, closingCostPctFor } from '../data/underwriting';
import type {
  Asset,
  AssetStage,
  DiligenceSignoff,
  DiligenceSignoffKind,
  MonthlyMark,
  ProvenanceInfo,
  UnderwriteOverride,
  UnderwriteOverrideField,
} from '../types';
import './UnderwritePage.css';
import './AssetDetailPage.css';

// ── Labels & formatters ────────────────────────────────────────
const STAGE_LABELS: Record<AssetStage, string> = {
  opportunity: 'Opportunity',
  underwriting: 'Underwriting',
  under_contract: 'Under Contract',
  precon: 'Pre-Con',
  construction: 'Construction',
  for_sale: 'For Sale',
  sold: 'Sold',
};

const SIGNOFF_LABELS: Record<DiligenceSignoffKind, string> = {
  design_plan_fit: 'Design / plan fit',
  site_visit: 'Site visit',
  sales_lot_feedback: 'Sales lot feedback',
  procurement_budget: 'Procurement budget',
};

const OVERRIDE_LABELS: Record<UnderwriteOverrideField, string> = {
  esp: 'ESP',
  buildCost: 'Build cost',
  landPrice: 'Land price',
  compPricePerSqft: 'Comp $/sqft',
  sideSetback: 'Side setback',
  maxCoveragePct: 'Max lot coverage',
};

const GAP = computed('Realized minus underwritten');
const ASSUMPTION = human('Underwriting assumption');

function usd(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function signedUsd(n: number) {
  return `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function usdCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n / 1_000)}K`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function monthLabel(month: string, withYear = true) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    ...(withYear && { year: '2-digit' }),
    timeZone: 'UTC',
  });
}

function overrideValue(field: UnderwriteOverrideField, n: number) {
  if (field === 'sideSetback') return `${n} ft`;
  if (field === 'maxCoveragePct') return `${n}%`;
  return usd(n);
}

// ── Layout pieces ──────────────────────────────────────────────
function Card({ title, aside, id, children }: { title: string; aside?: ReactNode; id?: string; children: ReactNode }) {
  return (
    <section className="uw-card as-card" id={id}>
      <div className="as-card-header">
        <h2 className="as-card-title">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="as-stat">
      <span className="as-stat-label">{label}</span>
      <span className="as-stat-value">{children}</span>
      {sub && <span className="as-stat-sub">{sub}</span>}
    </div>
  );
}

function StageTimeline({ asset }: { asset: Asset }) {
  const history = stageHistory(asset);
  return (
    <ol className="as-timeline" aria-label="Stage timeline">
      {history.map(({ stage, date, reached }) => {
        const current = stage === asset.stage;
        return (
          <li key={stage} className={`as-step ${reached ? 'as-step--done' : ''} ${current ? 'as-step--current' : ''}`}>
            <span className="as-step-dot" aria-hidden="true" />
            <span className="as-step-label">{STAGE_LABELS[stage]}</span>
            <span className="as-step-date">{date ? shortDate(date) : reached ? '—' : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ── 1. Original underwrite ─────────────────────────────────────
function UnderwriteSection({ asset }: { asset: Asset }) {
  const uw = asset.underwrite!;
  const review = uw.review;
  const draft = getAIDraft(asset.id);
  const closingPct = closingCostPctFor(uw.underwrittenOn);
  const overrides = new Map<UnderwriteOverrideField, UnderwriteOverride>(review?.overrides.map((o) => [o.field, o]) ?? []);

  // Reviewed values read as analyst-confirmed, or as overrides with their reason.
  const pv = (field?: UnderwriteOverrideField): ProvenanceInfo => {
    const o = field && overrides.get(field);
    if (o) return { provenance: 'human', note: `${review!.analyst} overrode AI ${overrideValue(o.field, o.aiValue)}: ${o.reason}` };
    if (review) return { provenance: 'human', note: `Reviewed by ${review.analyst}` };
    return AI;
  };

  const adu = draft?.adu;

  return (
    <Card
      title="Original underwrite"
      aside={<span className="as-card-caption">{uw.planName} · underwritten {shortDate(uw.underwrittenOn)}</span>}
    >
      <div className="as-split">
        <dl className="as-lines">
          <dt>Land</dt>
          <dd><ProvenanceValue info={overrides.has('landPrice') ? pv('landPrice') : SFDC}>{usd(uw.landPrice)}</ProvenanceValue></dd>
          <dt>Closing costs (<ProvenanceValue info={ASSUMPTION}>{closingPct}%</ProvenanceValue> of land)</dt>
          <dd><ProvenanceValue info={pv()}>{usd(uw.closingCosts)}</ProvenanceValue></dd>
          <dt>Build</dt>
          <dd><ProvenanceValue info={pv('buildCost')}>{usd(uw.buildCost)}</ProvenanceValue></dd>
          <dt>Carry / financing (<ProvenanceValue info={ASSUMPTION}>{CARRY_COST_PCT}%</ProvenanceValue> of build)</dt>
          <dd><ProvenanceValue info={pv()}>{usd(uw.carryCosts)}</ProvenanceValue></dd>
          <dt>Selling costs (<ProvenanceValue info={ASSUMPTION}>{SELLING_COST_PCT}%</ProvenanceValue> of ESP)</dt>
          <dd><ProvenanceValue info={pv()}>{usd(uw.sellingCosts)}</ProvenanceValue></dd>
          <dt className="as-lines-total">Total cost</dt>
          <dd className="as-lines-total"><ProvenanceValue info={pv()}>{usd(uw.totalCost)}</ProvenanceValue></dd>
        </dl>
        <div className="as-stats">
          <Stat label="ESP">
            <ProvenanceValue info={pv('esp')}>{usd(uw.esp)}</ProvenanceValue>
          </Stat>
          <Stat label="Margin" sub="(ESP − total cost) ÷ ESP">
            <ProvenanceValue info={pv()}>{uw.marginPct.toFixed(1)}%</ProvenanceValue>
          </Stat>
          {adu?.fits && (
            <Stat label="ADU" sub={adu.verdict === 'adds' ? 'adds margin' : 'fits but thin'}>
              <ProvenanceValue info={AI}>
                {adu.type}, {adu.sqft!.toLocaleString()} sqft · {signedUsd(adu.marginDelta!)}
              </ProvenanceValue>
            </Stat>
          )}
        </div>
      </div>

      <h3 className="as-subhead">Review</h3>
      {review ? (
        <>
          <p className="as-review-line">
            Reviewed by <strong>{review.analyst}</strong> on {shortDate(review.reviewedOn)}
            {review.overrides.length === 0 && ' · confirmed the AI draft with no overrides'}
          </p>
          {review.overrides.length > 0 && (
            <ul className="as-overrides">
              {review.overrides.map((o) => (
                <li key={o.field} className="as-override">
                  <span className="as-override-field">{OVERRIDE_LABELS[o.field]}</span>
                  <span className="as-override-values">
                    <ProvenanceValue info={AI}>{overrideValue(o.field, o.aiValue)}</ProvenanceValue>
                    <span className="as-arrow" aria-hidden="true">→</span>
                    <ProvenanceValue info={human(o.reason)}>{overrideValue(o.field, o.finalValue)}</ProvenanceValue>
                  </span>
                  <span className="as-override-reason">{o.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="as-review-line as-muted">
          Not reviewed yet.{' '}
          {draft && <Link to={`/underwrite/${asset.id}/draft`} className="as-link">Open the AI draft →</Link>}
        </p>
      )}
    </Card>
  );
}

// ── 2. Diligence ───────────────────────────────────────────────
function signoffStatus(s: DiligenceSignoff) {
  if (s.status === 'pending') {
    return s.date < DEMO_TODAY
      ? { tone: 'late', label: `Overdue · due ${shortDate(s.date)}` }
      : { tone: 'pending', label: `Due ${shortDate(s.date)}` };
  }
  if (s.status === 'conditional') return { tone: 'conditional', label: 'Signed with open issue' };
  return { tone: 'done', label: 'Signed off' };
}

function DiligenceSection({ asset }: { asset: Asset }) {
  const { signoffs, issues } = asset.contract!.diligence!;
  const signed = signoffs.filter((s) => s.status !== 'pending').length;
  return (
    <Card title="Diligence" aside={<span className="as-card-caption">{signed} of {signoffs.length} signed off</span>}>
      <table className="as-table">
        <thead>
          <tr>
            <th>Sign-off</th>
            <th>Owner</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {signoffs.map((s) => {
            const status = signoffStatus(s);
            return (
              <tr key={s.kind}>
                <td>{SIGNOFF_LABELS[s.kind]}</td>
                <td>{s.owner}</td>
                <td>{s.status === 'pending' ? '—' : shortDate(s.date)}</td>
                <td><span className={`as-pill as-pill--${status.tone}`}>{status.label}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="as-subhead">Issues</h3>
      {issues.length === 0 ? (
        <p className="as-muted as-small">No issues found.</p>
      ) : (
        <ul className="as-issues">
          {issues.map((i) => (
            <li key={i.category} className="as-issue">
              <div className="as-issue-top">
                <span className="as-issue-category">{i.category}</span>
                <span className={`as-pill as-pill--${i.status === 'open' ? 'conditional' : 'done'}`}>
                  {i.status === 'open' ? 'Open' : 'Resolved'}
                </span>
              </div>
              <p className="as-issue-notes">{i.notes}</p>
              <span className="as-issue-meta">Raised in {SIGNOFF_LABELS[i.raisedBy].toLowerCase()}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 3. Construction ────────────────────────────────────────────
function ConstructionSection({ asset }: { asset: Asset }) {
  const owned = asset.owned!;
  const s = constructionSummary(asset)!;
  const status = constructionStatus(asset)!;
  const done = owned.pctComplete >= 1;
  const eac = eacInfo(asset);
  return (
    <Card
      title="Construction"
      aside={
        <span className="as-card-caption">
          {owned.startedOn && <>Started {shortDate(owned.startedOn)} · </>}
          {done ? <>CO {shortDate(owned.schedule.forecastCompletion)}</> : <StatusChip status={status} />}
        </span>
      }
    >
      <div className="as-stats as-stats--row">
        <Stat label="Budget"><ProvenanceValue info={BLUEPRINT}>{usd(owned.budget)}</ProvenanceValue></Stat>
        <Stat
          label={done ? 'Final cost' : 'Est. at completion'}
          sub={s.variance !== 0 ? (
            <><ProvenanceValue info={eac}>{signedUsd(s.variance)} ({s.variancePct > 0 ? '+' : ''}{s.variancePct.toFixed(1)}%)</ProvenanceValue> vs. budget</>
          ) : 'On budget'}
        >
          <ProvenanceValue info={eac}>{usd(s.estimateAtCompletion)}</ProvenanceValue>
        </Stat>
        {!done && (
          <>
            <Stat label="Cost to date"><ProvenanceValue info={BLUEPRINT}>{usd(owned.costToDate)}</ProvenanceValue></Stat>
            <Stat label="Cost to complete"><ProvenanceValue info={AI}>{usd(s.costToComplete)}</ProvenanceValue></Stat>
          </>
        )}
        <Stat label="Complete"><ProvenanceValue info={BLUEPRINT}>{Math.round(owned.pctComplete * 100)}%</ProvenanceValue></Stat>
        <Stat
          label={done ? 'Completed' : 'Forecast CO'}
          sub={s.scheduleSlipDays > 0 ? (
            <>Plan {shortDate(owned.schedule.plannedCompletion)} · <ProvenanceValue info={BLUEPRINT}>{weeksLate(s.scheduleSlipDays)}</ProvenanceValue></>
          ) : 'On plan'}
        >
          <ProvenanceValue info={BLUEPRINT}>{shortDate(owned.schedule.forecastCompletion)}</ProvenanceValue>
        </Stat>
      </div>
      <div className="as-progress" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.round(owned.pctComplete * 100))}%` }} />
      </div>
      <div className="as-construction-impact"><MarginImpactLine asset={asset} /></div>
      <ConstructionDetail asset={asset} />
    </Card>
  );
}

// ── 4. Monthly marks ───────────────────────────────────────────
function niceStep(range: number) {
  const raw = range / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].find((u) => u * pow >= raw)!;
  return unit * pow;
}

const CHART = { w: 720, h: 220, left: 64, right: 20, top: 14, bottom: 28 };

function MarkChart({ marks }: { marks: MonthlyMark[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = marks.map((m) => m.value);
  const step = niceStep(Math.max(...values) - Math.min(...values) || Math.max(...values) * 0.02);
  const yMin = Math.floor(Math.min(...values) / step) * step;
  const yMax = Math.ceil(Math.max(...values) / step) * step;
  const plotW = CHART.w - CHART.left - CHART.right;
  const plotH = CHART.h - CHART.top - CHART.bottom;
  const x = (i: number) => CHART.left + (marks.length === 1 ? plotW / 2 : (i / (marks.length - 1)) * plotW);
  const y = (v: number) => CHART.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);
  const labelEvery = Math.ceil(marks.length / 6);
  const path = marks.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.value).toFixed(1)}`).join(' ');
  const last = marks.length - 1;

  function onMove(e: PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * plotW;
    const i = marks.length === 1 ? 0 : Math.round((px / plotW) * (marks.length - 1));
    setHover(Math.max(0, Math.min(last, i)));
  }

  const h = hover !== null ? marks[hover] : null;

  return (
    <div className="as-chart">
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} role="img" aria-label="Monthly mark value over time">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={CHART.left} x2={CHART.w - CHART.right} y1={y(t)} y2={y(t)} className="as-chart-grid" />
            <text x={CHART.left - 8} y={y(t)} className="as-chart-tick" textAnchor="end" dominantBaseline="middle">
              {usdCompact(t)}
            </text>
          </g>
        ))}
        {marks.map((m, i) =>
          i % labelEvery === 0 || i === last ? (
            <text key={m.month} x={x(i)} y={CHART.h - 8} className="as-chart-tick" textAnchor="middle">
              {monthLabel(m.month)}
            </text>
          ) : null,
        )}
        <path d={path} className="as-chart-line" />
        {marks.map((m, i) =>
          Math.abs(m.changeFromPrior) > APPROVAL_THRESHOLD ? (
            <circle key={m.month} cx={x(i)} cy={y(m.value)} r={4.5} className="as-chart-flag" />
          ) : null,
        )}
        <circle cx={x(last)} cy={y(marks[last].value)} r={4} className="as-chart-end" />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={CHART.top} y2={CHART.top + plotH} className="as-chart-crosshair" />
            <circle cx={x(hover)} cy={y(marks[hover].value)} r={4} className="as-chart-end" />
          </>
        )}
        <rect
          x={CHART.left}
          y={CHART.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {h && hover !== null && (
        <div
          className="as-chart-tooltip"
          style={{ left: `${(x(hover) / CHART.w) * 100}%`, top: `${(y(h.value) / CHART.h) * 100}%` }}
        >
          <span className="as-chart-tooltip-month">{monthLabel(h.month)}</span>
          <span className="as-chart-tooltip-value"><ProvenanceValue info={markProvenance(h)}>{usd(h.value)}</ProvenanceValue></span>
          <span className="as-chart-tooltip-change">
            {h.changeFromPrior === 0 ? 'No change' : <ProvenanceValue info={markProvenance(h)}>{signedUsd(h.changeFromPrior)}</ProvenanceValue>}
          </span>
        </div>
      )}
    </div>
  );
}

function MarksSection({ asset }: { asset: Asset }) {
  const marks = asset.marks!;
  const flagged = marks.filter((m) => Math.abs(m.changeFromPrior) > APPROVAL_THRESHOLD).length;
  return (
    <Card
      title="Monthly marks"
      aside={
        <span className="as-card-caption">
          {flagged > 0 && <span className="as-flag-key" aria-hidden="true" />}
          {flagged > 0 ? `${flagged} ${flagged === 1 ? 'change' : 'changes'} over $${APPROVAL_THRESHOLD / 1000}K` : `${marks.length} months`}
        </span>
      }
    >
      <MarkChart marks={marks} />
      <div className="as-table-scroll">
        <table className="as-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="as-num">Mark</th>
              <th>Method</th>
              <th className="as-num">Change</th>
              <th>Approver</th>
            </tr>
          </thead>
          <tbody>
            {[...marks].reverse().map((m) => {
              const big = Math.abs(m.changeFromPrior) > APPROVAL_THRESHOLD;
              return (
                <tr key={m.month} className={big ? 'as-row--flag' : ''}>
                  <td>{monthLabel(m.month)}</td>
                  <td className="as-num"><ProvenanceValue info={markProvenance(m)}>{usd(m.value)}</ProvenanceValue></td>
                  <td>{m.method}</td>
                  <td className={`as-num ${big ? 'as-flag-text' : ''}`}>
                    {m.changeFromPrior === 0 ? '—' : <ProvenanceValue info={markProvenance(m)}>{signedUsd(m.changeFromPrior)}</ProvenanceValue>}
                  </td>
                  <td>{m.approvedBy ?? <span className="as-pill as-pill--late">Needs approval</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── 5. Listing ─────────────────────────────────────────────────
function ListingSection({ asset }: { asset: Asset }) {
  const l = asset.listing!;
  return (
    <Card title="Listing" aside={<span className="as-card-caption">Listed {shortDate(l.listedOn)}</span>}>
      <div className="as-stats as-stats--row">
        <Stat label={asset.sale ? 'Final list price' : 'List price'}><ProvenanceValue info={MLS}>{usd(l.listPrice)}</ProvenanceValue></Stat>
        <Stat label="Days on market"><ProvenanceValue info={MLS}>{l.daysOnMarket}</ProvenanceValue></Stat>
        <Stat label="Showings"><ProvenanceValue info={MLS}>{l.showings}</ProvenanceValue></Stat>
        <Stat label="Price drops"><ProvenanceValue info={MLS}>{l.priceDrops}</ProvenanceValue></Stat>
      </div>

      {l.priceDropHistory && l.priceDropHistory.length > 0 && (
        <>
          <h3 className="as-subhead">Price drops</h3>
          <table className="as-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="as-num">From</th>
                <th className="as-num">To</th>
                <th className="as-num">Drop</th>
                <th>Logged by</th>
              </tr>
            </thead>
            <tbody>
              {l.priceDropHistory.map((d) => {
                const info = d.loggedBy ? human(`Accepted from the listing board by ${d.loggedBy}`) : MLS;
                return (
                  <tr key={d.date}>
                    <td>{shortDate(d.date)}</td>
                    <td className="as-num"><ProvenanceValue info={MLS}>{usd(d.from)}</ProvenanceValue></td>
                    <td className="as-num"><ProvenanceValue info={info}>{usd(d.to)}</ProvenanceValue></td>
                    <td className="as-num as-bad"><ProvenanceValue info={info}>−{usd(d.from - d.to)}</ProvenanceValue></td>
                    <td>{d.loggedBy ? `${d.loggedBy} · this session` : 'MLS'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {l.offers && l.offers.length > 0 && (
        <>
          <h3 className="as-subhead">Offers</h3>
          <table className="as-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="as-num">Amount</th>
                <th>Financing</th>
                <th className="as-num">Concessions</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {l.offers.map((o) => (
                <tr key={o.date}>
                  <td>{shortDate(o.date)}</td>
                  <td className="as-num"><ProvenanceValue info={MLS}>{usd(o.amount)}</ProvenanceValue></td>
                  <td>{o.financing}</td>
                  <td className="as-num">{o.concessions ? <ProvenanceValue info={MLS}>{usd(o.concessions)}</ProvenanceValue> : '—'}</td>
                  <td>
                    <span className={`as-pill as-pill--${o.status === 'active' || o.status === 'countered' ? 'conditional' : o.status === 'accepted' ? 'done' : 'pending'}`}>
                      {o.status[0].toUpperCase() + o.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

// ── 6. Underwritten vs realized ────────────────────────────────
function driverSentence(asset: Asset, driver: GapLine, marginPts: number): ReactNode {
  const gap = <ProvenanceValue info={GAP}>{usd(Math.abs(driver.realized - driver.uw))}</ProvenanceValue>;
  const move = (
    <>
      <ProvenanceValue info={GAP}>{Math.abs(marginPts).toFixed(1)}-point</ProvenanceValue> margin {marginPts < 0 ? 'drop' : 'gain'}
    </>
  );
  const sale = asset.sale!;
  const uw = asset.underwrite!;
  switch (driver.key) {
    case 'salePrice': {
      const drops = asset.listing!.priceDrops;
      return driver.marginImpact < 0
        ? <>Selling {gap} below ESP after <ProvenanceValue info={MLS}>{drops}</ProvenanceValue> price {drops === 1 ? 'drop' : 'drops'} was the biggest driver of the {move}.</>
        : <>Selling {gap} above ESP was the biggest driver of the {move}.</>;
    }
    case 'build':
      return driver.marginImpact < 0
        ? (
          <>
            Build ran {gap} (<ProvenanceValue info={GAP}>{((Math.abs(driver.realized - driver.uw) / uw.buildCost) * 100).toFixed(1)}%</ProvenanceValue>) over
            budget, the biggest driver of the {move}.
          </>
        )
        : <>Build came in {gap} under budget, the biggest driver of the {move}.</>;
    case 'carry':
      return <>Carry ran {gap} over plan on a <ProvenanceValue info={MLS}>{asset.listing!.daysOnMarket}-day</ProvenanceValue> sale, the biggest driver of the {move}.</>;
    case 'closing':
      return (
        <>
          Closing costs ran <ProvenanceValue info={TAPE}>{((sale.closingCosts / sale.landPrice) * 100).toFixed(2)}%</ProvenanceValue> of land against{' '}
          <ProvenanceValue info={ASSUMPTION}>{closingCostPctFor(uw.underwrittenOn)}%</ProvenanceValue> underwritten, the biggest driver of the {move}.
        </>
      );
    default:
      return <>{driver.label} moved {gap}, the biggest driver of the {move}.</>;
  }
}

function RealizedSection({ asset }: { asset: Asset }) {
  const uw = asset.underwrite!;
  const sale = asset.sale!;
  const { lines, uwMargin, realizedMargin, marginPts, driver } = underwritingGap(asset)!;
  const reviewed = human(`Reviewed by ${uw.review?.analyst ?? 'analyst'}`);

  const diffCell = (l: GapLine) => {
    const diff = l.realized - l.uw;
    if (diff === 0) return <td className="as-num as-muted">—</td>;
    return <td className={`as-num ${l.marginImpact > 0 ? 'as-good' : 'as-bad'}`}><ProvenanceValue info={GAP}>{signedUsd(diff)}</ProvenanceValue></td>;
  };

  return (
    <Card title="Underwritten vs realized" id="realized" aside={<span className="as-card-caption">Sold {shortDate(sale.soldOn)}</span>}>
      <p className="as-driver">{driverSentence(asset, driver, marginPts)}</p>
      <div className="as-table-scroll">
        <table className="as-table">
          <thead>
            <tr>
              <th>Line</th>
              <th className="as-num">Underwritten</th>
              <th className="as-num">Realized</th>
              <th className="as-num">Difference</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label} className={l.key === 'salePrice' ? 'as-row--revenue' : ''}>
                <td>{l.label}</td>
                <td className="as-num"><ProvenanceValue info={reviewed}>{usd(l.uw)}</ProvenanceValue></td>
                <td className="as-num"><ProvenanceValue info={l.key === 'salePrice' ? MLS : TAPE}>{usd(l.realized)}</ProvenanceValue></td>
                {diffCell(l)}
              </tr>
            ))}
            <tr className="as-row--total">
              <td>Total cost</td>
              <td className="as-num"><ProvenanceValue info={reviewed}>{usd(uw.totalCost)}</ProvenanceValue></td>
              <td className="as-num"><ProvenanceValue info={TAPE}>{usd(sale.totalCost)}</ProvenanceValue></td>
              <td className={`as-num ${sale.totalCost > uw.totalCost ? 'as-bad' : 'as-good'}`}><ProvenanceValue info={GAP}>{signedUsd(sale.totalCost - uw.totalCost)}</ProvenanceValue></td>
            </tr>
            <tr className="as-row--total">
              <td>Margin ($)</td>
              <td className="as-num"><ProvenanceValue info={reviewed}>{usd(uwMargin)}</ProvenanceValue></td>
              <td className="as-num"><ProvenanceValue info={TAPE}>{usd(realizedMargin)}</ProvenanceValue></td>
              <td className={`as-num ${realizedMargin < uwMargin ? 'as-bad' : 'as-good'}`}><ProvenanceValue info={GAP}>{signedUsd(realizedMargin - uwMargin)}</ProvenanceValue></td>
            </tr>
            <tr className="as-row--total">
              <td>Margin (%)</td>
              <td className="as-num"><ProvenanceValue info={reviewed}>{uw.marginPct.toFixed(1)}%</ProvenanceValue></td>
              <td className="as-num"><ProvenanceValue info={TAPE}>{sale.marginPct.toFixed(1)}%</ProvenanceValue></td>
              <td className={`as-num ${marginPts < 0 ? 'as-bad' : 'as-good'}`}>
                <ProvenanceValue info={GAP}>{marginPts > 0 ? '+' : marginPts < 0 ? '−' : ''}{Math.abs(marginPts).toFixed(1)} pts</ProvenanceValue>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const from = useFromPage();
  const { reviews, published } = useMarkReviews();
  const { actions } = useListingActions();
  const { reviews: draftReviews } = useDraftReviews();
  const asset = withListingActions(withReviewStatus(withMarkReviews(ASSETS, reviews, published), draftReviews), actions).find((a) => a.id === id);

  if (!asset) {
    return (
      <div className="uw-page">
        <div className="uw-not-found">
          <p>Asset <strong>{id}</strong> not found.</p>
          <button className="uw-back-btn" onClick={() => navigate('/')}>← Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const draft = getAIDraft(asset.id);
  const plan = asset.underwrite?.planName ?? draft?.recommendation.plan.plan.name;
  const reached = (stage: AssetStage) =>
    stageHistory(asset).find((h) => h.stage === stage)!.reached;
  const inPipeline = PIPELINE_STAGES.includes(asset.stage);

  return (
    <div className="uw-page as-page">
      <div className="uw-breadcrumb">
        <button className="uw-breadcrumb-link" onClick={() => navigate(from.path)}>{from.label}</button>
        <span className="uw-breadcrumb-sep">›</span>
        <span className="uw-breadcrumb-current">{asset.id}</span>
      </div>

      {/* Header */}
      <div className="uw-header">
        <div>
          <h1 className="uw-title">{asset.address}</h1>
          <p className="uw-subtitle as-meta">
            {asset.city}, {asset.state} {asset.zip}
            <span className="as-meta-sep">·</span>
            {asset.market}
            {plan && (
              <>
                <span className="as-meta-sep">·</span>
                {plan}
              </>
            )}
            <span className="as-meta-sep">·</span>
            <ProvenanceValue info={SFDC}>{asset.lotSqFt.toLocaleString()} sqft lot</ProvenanceValue>
          </p>
        </div>
        <span className={`as-stage-badge as-stage-badge--${asset.stage}`}>{STAGE_LABELS[asset.stage]}</span>
      </div>

      <StageTimeline asset={asset} />
      <ProvenanceLegend />

      <div className="as-sections">
        {asset.underwrite && <UnderwriteSection asset={asset} />}
        {!asset.underwrite && inPipeline && (
          <Card title="Original underwrite">
            <p className="as-muted as-small">
              Not underwritten yet.{' '}
              {draft && <Link to={`/underwrite/${asset.id}/draft`} className="as-link">Open the AI draft →</Link>}
            </p>
          </Card>
        )}
        {asset.contract?.diligence && <DiligenceSection asset={asset} />}
        {reached('construction') && asset.owned && <ConstructionSection asset={asset} />}
        {asset.marks && asset.marks.length > 0 && <MarksSection asset={asset} />}
        {asset.listing && <ListingSection asset={asset} />}
        {asset.sale && <RealizedSection asset={asset} />}
      </div>
    </div>
  );
}

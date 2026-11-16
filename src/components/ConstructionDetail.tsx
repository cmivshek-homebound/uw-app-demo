import { Fragment } from 'react';
import type { ReactNode } from 'react';
import ProvenanceValue from './ProvenanceValue';
import {
  AI,
  BLUEPRINT,
  CATEGORY_LABELS,
  MILESTONE_LABELS,
  STATUS_LABELS,
  eacInfo,
  shortDate,
  signedPct,
  signedUsd,
  usd,
  usdK,
  weeksLate,
} from './constructionFormat';
import { DEMO_TODAY } from '../data/dates';
import { computed, markProvenance } from '../data/provenance';
import { constructionMarginImpact, constructionStatus, constructionSummary, latestMark } from '../data/selectors';
import type { ConstructionStatus } from '../data/selectors';
import type { Asset } from '../types';
import './ConstructionDetail.css';

// ── Construction detail ────────────────────────────────────────
// Budget lines, milestones, change orders and draws for one owned asset.
// Shared by the Construction page and the asset page.
// Budget, spend and schedule come from Blueprint; estimate at completion
// (and anything derived from it) is AI-drafted until the build is complete.

// ── Small pieces ───────────────────────────────────────────────
export function StatusChip({ status }: { status: ConstructionStatus }) {
  return <span className={`cx-chip cx-chip--${status}`}>{STATUS_LABELS[status]}</span>;
}

/** Variance vs. budget on a ±8% scale, centered on zero. */
export function VarianceBar({ pct }: { pct: number }) {
  const width = Math.min(50, (Math.abs(pct) / 8) * 50);
  const tone = pct > 2 ? 'over' : pct < 0 ? 'under' : 'flat';
  return (
    <span className="cx-vbar" aria-hidden="true">
      <span className="cx-vbar-axis" />
      <span
        className={`cx-vbar-fill cx-vbar-fill--${tone}`}
        style={pct >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
      />
    </span>
  );
}

/** Same convention as the asset page's mark history: unapproved marks read as AI drafts. */
const AT_BUDGET = computed('Underwriting cost stack at the Blueprint budget, valued at the latest mark');

/** One line on what an at-risk build does to cost and margin; nothing for builds on track. */
export function MarginImpactLine({ asset }: { asset: Asset }) {
  const status = constructionStatus(asset);
  const impact = constructionMarginImpact(asset);
  if (!impact || !status || status === 'on_track' || asset.stage !== 'construction') return null;
  const slipDays = constructionSummary(asset)!.scheduleSlipDays;
  const parts: ReactNode[] = [];
  if (impact.overrun > 0) {
    parts.push(
      <>
        A <ProvenanceValue info={AI}>{usdK(impact.overrun)}</ProvenanceValue> overrun (plus{' '}
        <ProvenanceValue info={AI}>{usdK(impact.overrunCarry)}</ProvenanceValue> carry on it)
      </>,
    );
  }
  if (impact.overrun < 0) parts.push(<><ProvenanceValue info={AI}>{usdK(-impact.overrun)}</ProvenanceValue> in build savings</>);
  if (impact.slipCarry > 0) {
    parts.push(
      <>
        <ProvenanceValue info={AI}>{usdK(impact.slipCarry)}</ProvenanceValue> of extra carry from the{' '}
        <ProvenanceValue info={BLUEPRINT}>{Math.round(slipDays / 7)}-week</ProvenanceValue> slip
      </>,
    );
  }
  const tone = impact.marginPts < 0 ? 'cx-bad' : impact.marginPts > 0 ? 'cx-good' : '';
  const pts = `${impact.marginPts > 0 ? '+' : impact.marginPts < 0 ? '−' : ''}${Math.abs(impact.marginPts).toFixed(1)} pts`;
  return (
    <p className="cx-impact">
      <span className="cx-impact-label">Impact on margin</span>{' '}
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' and '}
          {part}
        </Fragment>
      ))}{' '}
      move projected total cost from <ProvenanceValue info={AT_BUDGET}>{usdK(impact.budgetCost)}</ProvenanceValue> to{' '}
      <ProvenanceValue info={AI}>{usdK(impact.projectedCost)}</ProvenanceValue>; implied margin against the{' '}
      <ProvenanceValue info={markProvenance(latestMark(asset))}>{usdK(impact.mark)}</ProvenanceValue> mark goes from{' '}
      <ProvenanceValue info={AT_BUDGET}>{impact.budgetMarginPct.toFixed(1)}%</ProvenanceValue> to{' '}
      <ProvenanceValue info={AI}>{impact.projectedMarginPct.toFixed(1)}%</ProvenanceValue>{' '}
      <span className={tone}>(<ProvenanceValue info={AI}>{pts}</ProvenanceValue>)</span>.
    </p>
  );
}

// ── Sections ───────────────────────────────────────────────────
function BudgetLines({ asset }: { asset: Asset }) {
  const owned = asset.owned!;
  const eac = eacInfo(asset);
  const s = constructionSummary(asset)!;
  return (
    <section className="cx-block">
      <h4 className="cx-block-title">Budget lines</h4>
      <div className="cx-table-wrap">
        <table className="cx-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="cx-num">Budget</th>
              <th className="cx-num">Spent</th>
              <th className="cx-num">Est. at completion</th>
              <th className="cx-num">Variance</th>
            </tr>
          </thead>
          <tbody>
            {owned.budgetLines.map((l) => {
              const variance = l.estimateAtCompletion - l.budget;
              const tone = l.category === 'contingency' || variance === 0 ? '' : variance > 0 ? 'cx-bad' : 'cx-good';
              return (
                <tr key={l.category}>
                  <td>
                    {CATEGORY_LABELS[l.category]}
                    {l.note && <span className="cx-note">{l.note}</span>}
                    {l.category === 'contingency' && variance < 0 && (
                      <span className="cx-note"><ProvenanceValue info={eac}>{usd(-variance)}</ProvenanceValue> drawn to cover other lines</span>
                    )}
                  </td>
                  <td className="cx-num"><ProvenanceValue info={BLUEPRINT}>{usd(l.budget)}</ProvenanceValue></td>
                  <td className="cx-num"><ProvenanceValue info={BLUEPRINT}>{usd(l.spent)}</ProvenanceValue></td>
                  <td className="cx-num"><ProvenanceValue info={eac}>{usd(l.estimateAtCompletion)}</ProvenanceValue></td>
                  <td className={`cx-num ${tone}`}><ProvenanceValue info={eac}>{signedUsd(variance)}</ProvenanceValue></td>
                </tr>
              );
            })}
            <tr className="cx-total">
              <td>Total</td>
              <td className="cx-num"><ProvenanceValue info={BLUEPRINT}>{usd(s.budget)}</ProvenanceValue></td>
              <td className="cx-num"><ProvenanceValue info={BLUEPRINT}>{usd(s.spent)}</ProvenanceValue></td>
              <td className="cx-num"><ProvenanceValue info={eac}>{usd(s.estimateAtCompletion)}</ProvenanceValue></td>
              <td className={`cx-num ${s.variance > 0 ? 'cx-bad' : s.variance < 0 ? 'cx-good' : ''}`}>
                <ProvenanceValue info={eac}>{signedUsd(s.variance)} ({signedPct(s.variancePct)})</ProvenanceValue>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Milestones({ asset }: { asset: Asset }) {
  const { milestones, plannedCompletion, forecastCompletion } = asset.owned!.schedule;
  const slip = constructionSummary(asset)!.scheduleSlipDays;
  const next = milestones.find((m) => !m.actual);
  const notes = milestones.filter((m) => m.note);
  return (
    <section className="cx-block">
      <div className="cx-block-head">
        <h4 className="cx-block-title">Milestones</h4>
        <span className="cx-caption">
          CO planned <ProvenanceValue info={BLUEPRINT}>{shortDate(plannedCompletion, true)}</ProvenanceValue>
          {' · '}
          {next ? 'forecast' : 'actual'}{' '}
          <ProvenanceValue info={BLUEPRINT}>{shortDate(forecastCompletion, true)}</ProvenanceValue>
          {slip > 0 && <span className="cx-bad"> · <ProvenanceValue info={BLUEPRINT}>{weeksLate(slip)}</ProvenanceValue></span>}
        </span>
      </div>
      <ol className="cx-milestones">
        {milestones.map((m) => {
          const daysLate = m.actual
            ? Math.round((new Date(m.actual).getTime() - new Date(m.planned).getTime()) / 86_400_000)
            : 0;
          const overdue = !m.actual && m.planned < DEMO_TODAY;
          const state = m.actual ? 'done' : m === next ? 'next' : 'pending';
          return (
            <li key={m.kind} className={`cx-ms cx-ms--${state} ${daysLate > 7 || overdue ? 'cx-ms--late' : ''}`}>
              <span className="cx-ms-dot" aria-hidden="true" />
              <span className="cx-ms-label">{MILESTONE_LABELS[m.kind]}</span>
              <span className="cx-ms-date">
                <ProvenanceValue info={BLUEPRINT}>
                  {m.actual ? shortDate(m.actual) : `Plan ${shortDate(m.planned)}`}
                </ProvenanceValue>
              </span>
              {m.actual && daysLate > 7 && <span className="cx-ms-sub cx-bad"><ProvenanceValue info={BLUEPRINT}>{daysLate} days</ProvenanceValue> late</span>}
              {m.actual && daysLate <= 7 && <span className="cx-ms-sub">Plan {shortDate(m.planned)}</span>}
              {overdue && <span className="cx-ms-sub cx-bad">Overdue</span>}
            </li>
          );
        })}
      </ol>
      {notes.map((m) => (
        <p key={m.kind} className="cx-ms-note">
          <strong>{MILESTONE_LABELS[m.kind]}:</strong> {m.note}
        </p>
      ))}
    </section>
  );
}

function ChangeOrders({ asset }: { asset: Asset }) {
  const cos = asset.owned!.changeOrders;
  return (
    <section className="cx-block">
      <h4 className="cx-block-title">Change orders</h4>
      {cos.length === 0 ? (
        <p className="cx-empty">No change orders.</p>
      ) : (
        <div className="cx-table-wrap">
          <table className="cx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Reason</th>
                <th className="cx-num">Amount</th>
                <th>Approved by</th>
              </tr>
            </thead>
            <tbody>
              {cos.map((c) => (
                <tr key={`${c.date}-${c.category}`}>
                  <td className="cx-nowrap"><ProvenanceValue info={BLUEPRINT}>{shortDate(c.date, true)}</ProvenanceValue></td>
                  <td className="cx-wide">
                    {c.description}
                    <span className="cx-note">{CATEGORY_LABELS[c.category]}</span>
                  </td>
                  <td className="cx-nowrap">{c.reason}</td>
                  <td className="cx-num"><ProvenanceValue info={BLUEPRINT}>{signedUsd(c.amount)}</ProvenanceValue></td>
                  <td className="cx-nowrap">{c.approvedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Draws({ asset }: { asset: Asset }) {
  const draws = asset.owned!.draws;
  const { drawn } = constructionSummary(asset)!;
  return (
    <section className="cx-block">
      <div className="cx-block-head">
        <h4 className="cx-block-title">Draws</h4>
        <span className="cx-caption">
          <ProvenanceValue info={BLUEPRINT}>{usd(drawn.funded)}</ProvenanceValue> funded
          {drawn.pending > 0 && (
            <>
              {' · '}
              <ProvenanceValue info={BLUEPRINT}>{usd(drawn.pending)}</ProvenanceValue> pending
            </>
          )}
        </span>
      </div>
      {draws.length === 0 ? (
        <p className="cx-empty">No draws yet.</p>
      ) : (
        <ul className="cx-draws">
          {draws.map((d) => (
            <li key={d.date} className={`cx-draw cx-draw--${d.status}`}>
              <span className="cx-draw-date">{shortDate(d.date, true)}</span>
              <span className="cx-draw-amount"><ProvenanceValue info={BLUEPRINT}>{usdK(d.amount)}</ProvenanceValue></span>
              <span className="cx-draw-status">{d.status === 'funded' ? 'Funded' : 'Pending'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ConstructionDetail({ asset }: { asset: Asset }) {
  return (
    <div className="cx-detail">
      <Milestones asset={asset} />
      <BudgetLines asset={asset} />
      <ChangeOrders asset={asset} />
      <Draws asset={asset} />
    </div>
  );
}

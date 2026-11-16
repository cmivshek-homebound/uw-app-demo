import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import ConstructionDetail, { MarginImpactLine, StatusChip, VarianceBar } from '../components/ConstructionDetail';
import { AI, BLUEPRINT, MILESTONE_LABELS, shortDate, signedPct, usdK, weeksLate } from '../components/constructionFormat';
import AssetLink from '../components/AssetLink';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { useSessionAssets } from '../data/useSessionAssets';
import { constructionByRisk, constructionStatus, constructionSummary, nextMilestone } from '../data/selectors';

const COLUMNS = 8;

export default function ConstructionTab() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Same marks as the asset page: once April is published, margin impact reads it.
  const assets = constructionByRisk(useSessionAssets());
  const rows = assets.map((asset) => ({
    asset,
    summary: constructionSummary(asset)!,
    status: constructionStatus(asset)!,
    next: nextMilestone(asset),
  }));

  const totalBudget = rows.reduce((s, r) => s + r.summary.budget, 0);
  const totalEac = rows.reduce((s, r) => s + r.summary.estimateAtCompletion, 0);
  const variance = totalEac - totalBudget;
  const late = rows.filter((r) => r.status === 'behind_schedule' || r.status === 'both').length;
  const over = rows.filter((r) => r.status === 'over_budget' || r.status === 'both').length;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="cx-tab">
      <div className="cx-summary">
        <div className="cx-stat">
          <span className="cx-stat-label">Under construction</span>
          <span className="cx-stat-value">{rows.length}</span>
          <span className="cx-stat-sub">{over} over budget</span>
        </div>
        <div className="cx-stat">
          <span className="cx-stat-label">Total budget</span>
          <span className="cx-stat-value"><ProvenanceValue info={BLUEPRINT}>{usdK(totalBudget)}</ProvenanceValue></span>
          <span className="cx-stat-sub">Vertical build</span>
        </div>
        <div className="cx-stat">
          <span className="cx-stat-label">Estimate at completion</span>
          <span className="cx-stat-value"><ProvenanceValue info={AI}>{usdK(totalEac)}</ProvenanceValue></span>
          <span className="cx-stat-sub">Incl. remaining contingency</span>
        </div>
        <div className="cx-stat">
          <span className="cx-stat-label">Variance</span>
          <span className={`cx-stat-value ${variance > 0 ? 'cx-bad' : variance < 0 ? 'cx-good' : ''}`}>
            <ProvenanceValue info={AI}>{usdK(variance, true)}</ProvenanceValue>
          </span>
          <span className="cx-stat-sub">
            <ProvenanceValue info={AI}>{signedPct((variance / totalBudget) * 100)}</ProvenanceValue> vs. budget
          </span>
        </div>
        <div className="cx-stat">
          <span className="cx-stat-label">Late</span>
          <span className={`cx-stat-value ${late ? 'cx-bad' : ''}`}>{late}</span>
          <span className="cx-stat-sub">of {rows.length} past planned CO</span>
        </div>
      </div>

      <ProvenanceLegend />

      <section className="pf-card">
        <div className="pf-card-header">
          <h3 className="pf-card-title">Builds by risk</h3>
          <span className="pf-card-caption">Over budget: EAC more than 2% over · Behind: forecast CO more than a week late</span>
        </div>
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th aria-label="Expand" />
                <th>Asset</th>
                <th>Complete</th>
                <th className="pf-num">Budget → EAC</th>
                <th className="pf-num">To complete</th>
                <th>Completion</th>
                <th>Next milestone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ asset, summary: s, status, next }) => {
                const owned = asset.owned!;
                const isOpen = open.has(asset.id);
                const atRisk = status !== 'on_track';
                const pct = Math.round(owned.pctComplete * 100);
                return (
                  <Fragment key={asset.id}>
                    <tr className={`${isOpen ? 'pf-row--open' : ''} ${atRisk ? 'cx-row--risk' : ''}`}>
                      <td>
                        <button
                          className="pf-caret"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${asset.id}`}
                          onClick={() => toggle(asset.id)}
                        >
                          {isOpen ? '▾' : '▸'}
                        </button>
                      </td>
                      <td>
                        <Link to={`/asset/${asset.id}`} className="cx-address">{asset.address}</Link>
                        <span className="pf-asset-address"><AssetLink id={asset.id}>{asset.id}</AssetLink> · {asset.market} · {asset.underwrite?.planName}</span>
                      </td>
                      <td>
                        <ProvenanceValue info={BLUEPRINT}>{pct}%</ProvenanceValue>
                        <span className="cx-pct-bar" aria-hidden="true">
                          <span style={{ width: `${pct}%` }} />
                        </span>
                      </td>
                      <td className="pf-num">
                        <ProvenanceValue info={BLUEPRINT}>{usdK(s.budget)}</ProvenanceValue> →{' '}
                        <ProvenanceValue info={AI}>{usdK(s.estimateAtCompletion)}</ProvenanceValue>
                        <span className={`cx-sub ${s.variancePct > 2 ? 'cx-bad' : s.variance < 0 ? 'cx-good' : ''}`}>
                          <ProvenanceValue info={AI}>{usdK(s.variance, true)} ({signedPct(s.variancePct)})</ProvenanceValue>
                        </span>
                        <VarianceBar pct={s.variancePct} />
                      </td>
                      <td className="pf-num"><ProvenanceValue info={AI}>{usdK(s.costToComplete)}</ProvenanceValue></td>
                      <td>
                        <ProvenanceValue info={BLUEPRINT}>{shortDate(owned.schedule.forecastCompletion, true)}</ProvenanceValue>
                        <span className={`cx-sub ${s.scheduleSlipDays > 7 ? 'cx-bad' : ''}`}>
                          {s.scheduleSlipDays > 0 ? (
                            <>
                              <ProvenanceValue info={BLUEPRINT}>{weeksLate(s.scheduleSlipDays)}</ProvenanceValue> · plan {shortDate(owned.schedule.plannedCompletion)}
                            </>
                          ) : 'On plan'}
                        </span>
                      </td>
                      <td>
                        {next ? (
                          <>
                            {MILESTONE_LABELS[next.kind]}
                            <span className="cx-sub">
                              <ProvenanceValue info={BLUEPRINT}>
                                {next.forecast === next.planned
                                  ? shortDate(next.planned)
                                  : `${shortDate(next.forecast)} · plan ${shortDate(next.planned)}`}
                              </ProvenanceValue>
                            </span>
                          </>
                        ) : '—'}
                      </td>
                      <td><StatusChip status={status} /></td>
                    </tr>
                    {atRisk && (
                      <tr className={`cx-impact-row ${isOpen ? 'pf-row--open' : ''}`}>
                        <td />
                        <td colSpan={COLUMNS - 1}><MarginImpactLine asset={asset} /></td>
                      </tr>
                    )}
                    {isOpen && (
                      <tr className="pf-row-detail cx-detail-row">
                        <td colSpan={COLUMNS}><ConstructionDetail asset={asset} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { DEMO_TODAY, daysRemaining, daysSince } from '../data/dates';
import {
  assetsByStage,
  countByStage,
  currentMarkByStage,
  pipelineAssets,
} from '../data/selectors';
import type { AssetStage, PipelineStatus } from '../types';
import './Dashboard.css';

const STATUS_ORDER: PipelineStatus[] = ['pending_review', 'in_review', 'ready_for_offer', 'dqd'];

const STATUS_LABELS: Record<PipelineStatus, string> = {
  pending_review: 'Pending Review',
  in_review: 'In Review',
  ready_for_offer: 'Ready for Offer',
  dqd: "DQ'd",
};

const OWNED_TILES: { stage: AssetStage; label: string }[] = [
  { stage: 'precon', label: 'Pre-Con' },
  { stage: 'construction', label: 'Construction' },
  { stage: 'for_sale', label: 'For Sale' },
];

const INSPECTION_WARN_DAYS = 7;
const LONGEST_PENDING_LIMIT = 3;

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function usdMillions(n: number) {
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export default function Dashboard() {
  const navigate = useNavigate();

  // ── KPIs ──
  const pipeline = pipelineAssets();
  const underContract = assetsByStage().under_contract;
  const activeCount = pipeline.filter((a) => a.pipelineStatus !== 'dqd').length;
  const pendingCount = pipeline.filter((a) => a.pipelineStatus === 'pending_review').length;
  const totalOffer = underContract.reduce((sum, a) => sum + (a.underwrite?.landPrice ?? 0), 0);
  const avgMargin = underContract.length > 0
    ? underContract.reduce((sum, a) => sum + (a.underwrite?.marginPct ?? 0), 0) / underContract.length
    : null;
  const inspections = underContract
    .filter((a) => a.contract)
    .map((a) => ({ asset: a, days: daysRemaining(a.contract!.inspectionExpires) }));
  const soonestInspection = inspections.length > 0
    ? Math.min(...inspections.map((x) => x.days))
    : null;

  // ── Owned portfolio ──
  const stageCounts = countByStage();
  const stageMarks = currentMarkByStage();

  // ── Pipeline by market ──
  const markets = [...new Set(pipeline.map((a) => a.market))];
  const pipelineRows = markets.map((market) => {
    const inMarket = pipeline.filter((a) => a.market === market);
    const counts = Object.fromEntries(
      STATUS_ORDER.map((s) => [s, inMarket.filter((a) => a.pipelineStatus === s).length]),
    ) as Record<PipelineStatus, number>;
    return { market, counts, total: inMarket.length };
  });
  const statusTotals = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, pipeline.filter((a) => a.pipelineStatus === s).length]),
  ) as Record<PipelineStatus, number>;

  // ── Needs attention ──
  const expiringInspections = inspections
    .filter((x) => x.days < INSPECTION_WARN_DAYS)
    .sort((a, b) => a.days - b.days);

  const longestPending = pipeline
    .filter((a) => a.pipelineStatus === 'pending_review' && a.intake)
    .map((a) => ({ asset: a, days: daysSince(a.intake!.dateReceived) }))
    .sort((a, b) => b.days - a.days)
    .slice(0, LONGEST_PENDING_LIMIT);

  const asOf = new Date(DEMO_TODAY).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });

  return (
    <div className="db-page">
      <div className="db-header">
        <div>
          <h1 className="db-title">BOOL Underwriting Dashboard</h1>
          <p className="db-subtitle">
            {pipeline.length} opportunities across {plural(markets.length, 'market')} · as of {asOf}
          </p>
        </div>
        <button className="db-queue-btn" onClick={() => navigate('/queue')}>
          Open Queue →
        </button>
      </div>

      {/* KPI strip */}
      <div className="db-kpis">
        <div className="db-kpi">
          <span className="db-kpi-label">Active Opportunities</span>
          <span className="db-kpi-value">{activeCount}</span>
          <span className="db-kpi-note">excludes DQ'd</span>
        </div>
        <div className="db-kpi">
          <span className="db-kpi-label">Pending Review</span>
          <span className="db-kpi-value">{pendingCount}</span>
          <span className="db-kpi-note">awaiting underwriter</span>
        </div>
        <div className="db-kpi">
          <span className="db-kpi-label">Under Contract</span>
          <span className="db-kpi-value">{underContract.length}</span>
          <span className="db-kpi-note">{usd(totalOffer)} total offer</span>
        </div>
        <div className="db-kpi">
          <span className="db-kpi-label">Avg UW Margin</span>
          <span className="db-kpi-value db-kpi-value--brand">
            {avgMargin === null ? '—' : `${avgMargin.toFixed(1)}%`}
          </span>
          <span className="db-kpi-note">across {plural(underContract.length, 'contract')}</span>
        </div>
        <div className="db-kpi">
          <span className="db-kpi-label">Next Inspection Deadline</span>
          <span
            className={`db-kpi-value ${
              soonestInspection !== null && soonestInspection < INSPECTION_WARN_DAYS ? 'db-kpi-value--urgent' : ''
            }`}
          >
            {soonestInspection === null ? '—' : plural(soonestInspection, 'day')}
          </span>
          <span className="db-kpi-note">soonest expiry</span>
        </div>
      </div>

      {/* Owned portfolio */}
      <div className="db-owned">
        {OWNED_TILES.map(({ stage, label }) => (
          <div key={stage} className="db-kpi">
            <span className="db-kpi-label">{label}</span>
            <span className="db-kpi-value">{stageCounts[stage]}</span>
            <span className="db-kpi-note">{usdMillions(stageMarks[stage])} current mark</span>
          </div>
        ))}
      </div>

      <div className="db-grid">
        {/* Pipeline */}
        <section className="db-card">
          <div className="db-card-header">
            <h2 className="db-card-title">Pipeline by Market</h2>
            <div className="db-legend">
              {STATUS_ORDER.map((s) => (
                <span key={s} className="db-legend-item">
                  <span className={`db-swatch db-fill--${s}`} />
                  {STATUS_LABELS[s]}
                </span>
              ))}
            </div>
          </div>
          <table className="db-table">
            <thead>
              <tr>
                <th>Market</th>
                {STATUS_ORDER.map((s) => <th key={s} className="db-num">{STATUS_LABELS[s]}</th>)}
                <th className="db-num">Total</th>
                <th className="db-bar-col"></th>
              </tr>
            </thead>
            <tbody>
              {pipelineRows.map(({ market, counts, total }) => (
                <tr key={market}>
                  <td className="db-market">{market}</td>
                  {STATUS_ORDER.map((s) => (
                    <td key={s} className={`db-num ${counts[s] === 0 ? 'db-zero' : ''}`}>{counts[s]}</td>
                  ))}
                  <td className="db-num db-total">{total}</td>
                  <td className="db-bar-col">
                    <div className="db-bar" title={`${market}: ${total} of ${pipeline.length} opportunities`}>
                      {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
                        <span
                          key={s}
                          className={`db-bar-seg db-fill--${s}`}
                          style={{ width: `${(counts[s] / pipeline.length) * 100}%` }}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>All markets</td>
                {STATUS_ORDER.map((s) => <td key={s} className="db-num">{statusTotals[s]}</td>)}
                <td className="db-num">{pipeline.length}</td>
                <td className="db-bar-col"></td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Needs attention */}
        <section className="db-card">
          <div className="db-card-header">
            <h2 className="db-card-title">Needs Attention</h2>
          </div>

          <h3 className="db-subhead">Inspections expiring in &lt; {INSPECTION_WARN_DAYS} days</h3>
          {expiringInspections.length === 0 ? (
            <p className="db-empty">No inspection deadlines this week.</p>
          ) : (
            <ul className="db-list">
              {expiringInspections.map(({ asset, days }) => (
                <li key={asset.id}>
                  <button className="db-list-row" onClick={() => navigate(`/contract/${asset.id}`)}>
                    <span className="db-list-main">
                      <span className="db-list-id">{asset.id}</span>
                      <span className="db-list-address">{asset.address} · {asset.market}</span>
                    </span>
                    <span className="db-pill db-pill--urgent">{plural(days, 'day')} left</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3 className="db-subhead">Longest pending review</h3>
          {longestPending.length === 0 ? (
            <p className="db-empty">Nothing pending review.</p>
          ) : (
            <ul className="db-list">
              {longestPending.map(({ asset, days }) => (
                <li key={asset.id}>
                  <button className="db-list-row" onClick={() => navigate(`/underwrite/${asset.id}`)}>
                    <span className="db-list-main">
                      <span className="db-list-id">{asset.id}</span>
                      <span className="db-list-address">{asset.address} · {asset.market}</span>
                    </span>
                    <span className="db-pill">{plural(days, 'day')} waiting</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

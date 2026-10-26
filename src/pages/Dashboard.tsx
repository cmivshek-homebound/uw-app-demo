import { useNavigate } from 'react-router-dom';
import { mockOpportunities } from '../data/opportunities';
import { CONTRACT_DEALS, DEMO_TODAY, daysRemaining } from '../data/contracts';
import type { Opportunity } from '../types';
import './Dashboard.css';

type Status = Opportunity['status'];

const STATUS_ORDER: Status[] = ['pending_review', 'in_review', 'ready_for_offer', 'dqd'];

const STATUS_LABELS: Record<Status, string> = {
  pending_review: 'Pending Review',
  in_review: 'In Review',
  ready_for_offer: 'Ready for Offer',
  dqd: "DQ'd",
};

const INSPECTION_WARN_DAYS = 7;
const LONGEST_PENDING_LIMIT = 3;

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Whole days from `from` back to `since`. */
function daysSince(since: string, from: string = DEMO_TODAY): number {
  return Math.max(0, Math.round((new Date(from).getTime() - new Date(since).getTime()) / 86_400_000));
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export default function Dashboard() {
  const navigate = useNavigate();

  // ── KPIs ──
  const deals = Object.values(CONTRACT_DEALS);
  const activeCount = mockOpportunities.filter((o) => o.status !== 'dqd').length;
  const pendingCount = mockOpportunities.filter((o) => o.status === 'pending_review').length;
  const totalOffer = deals.reduce((sum, d) => sum + d.offer, 0);
  const avgMargin = deals.length > 0
    ? deals.reduce((sum, d) => sum + d.marginPct, 0) / deals.length
    : null;
  const soonestInspection = deals.length > 0
    ? Math.min(...deals.map((d) => daysRemaining(d.inspectionExpires)))
    : null;

  // ── Pipeline by market ──
  const markets = [...new Set(mockOpportunities.map((o) => o.market))];
  const pipeline = markets.map((market) => {
    const opps = mockOpportunities.filter((o) => o.market === market);
    const counts = Object.fromEntries(
      STATUS_ORDER.map((s) => [s, opps.filter((o) => o.status === s).length]),
    ) as Record<Status, number>;
    return { market, counts, total: opps.length };
  });
  const statusTotals = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, mockOpportunities.filter((o) => o.status === s).length]),
  ) as Record<Status, number>;

  // ── Needs attention ──
  const expiringInspections = deals
    .map((d) => ({ deal: d, days: daysRemaining(d.inspectionExpires) }))
    .filter((x) => x.days < INSPECTION_WARN_DAYS)
    .sort((a, b) => a.days - b.days);

  const longestPending = mockOpportunities
    .filter((o) => o.status === 'pending_review')
    .map((o) => ({ opp: o, days: daysSince(o.dateReceived) }))
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
            {mockOpportunities.length} opportunities across {plural(markets.length, 'market')} · as of {asOf}
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
          <span className="db-kpi-value">{deals.length}</span>
          <span className="db-kpi-note">{usd(totalOffer)} total offer</span>
        </div>
        <div className="db-kpi">
          <span className="db-kpi-label">Avg UW Margin</span>
          <span className="db-kpi-value db-kpi-value--brand">
            {avgMargin === null ? '—' : `${avgMargin.toFixed(1)}%`}
          </span>
          <span className="db-kpi-note">across {plural(deals.length, 'contract')}</span>
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
              {pipeline.map(({ market, counts, total }) => (
                <tr key={market}>
                  <td className="db-market">{market}</td>
                  {STATUS_ORDER.map((s) => (
                    <td key={s} className={`db-num ${counts[s] === 0 ? 'db-zero' : ''}`}>{counts[s]}</td>
                  ))}
                  <td className="db-num db-total">{total}</td>
                  <td className="db-bar-col">
                    <div className="db-bar" title={`${market}: ${total} of ${mockOpportunities.length} opportunities`}>
                      {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
                        <span
                          key={s}
                          className={`db-bar-seg db-fill--${s}`}
                          style={{ width: `${(counts[s] / mockOpportunities.length) * 100}%` }}
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
                <td className="db-num">{mockOpportunities.length}</td>
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
              {expiringInspections.map(({ deal, days }) => (
                <li key={deal.oppId}>
                  <button className="db-list-row" onClick={() => navigate(`/contract/${deal.oppId}`)}>
                    <span className="db-list-main">
                      <span className="db-list-id">{deal.oppId}</span>
                      <span className="db-list-address">{deal.address}</span>
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
              {longestPending.map(({ opp, days }) => (
                <li key={opp.id}>
                  <button className="db-list-row" onClick={() => navigate(`/underwrite/${opp.id}`)}>
                    <span className="db-list-main">
                      <span className="db-list-id">{opp.id}</span>
                      <span className="db-list-address">{opp.address} · {opp.market}</span>
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

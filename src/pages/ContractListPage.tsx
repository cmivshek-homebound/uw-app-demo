import { Link } from 'react-router-dom';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { ASSETS } from '../data/assets';
import {
  CONTRACT_DEALS,
  daysRemaining,
  diligenceProgress,
  inspectionTone,
  underwriteInfo,
} from '../data/contracts';
import { SFDC, computed } from '../data/provenance';
import './ContractListPage.css';

// ── Under contract: all deals ──────────────────────────────────
// Every under-contract asset, soonest inspection deadline first, with
// diligence progress and a link into each deal.

function usd(n: number) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function ContractListPage() {
  const rows = Object.values(CONTRACT_DEALS)
    .map((deal) => {
      const asset = ASSETS.find((a) => a.id === deal.oppId)!;
      const days = daysRemaining(deal.inspectionExpires);
      return { deal, asset, days, diligence: diligenceProgress(asset) };
    })
    .sort((a, b) => a.days - b.days);

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Under Contract</h1>
          <p className="oq-subtitle">
            {rows.length} deals in their inspection period · soonest deadline first
          </p>
        </div>
      </div>

      <ProvenanceLegend />

      {rows.length === 0 ? (
        <div className="cl-empty">
          <p>No deals are under contract right now.</p>
          <Link to="/underwrite" className="cl-link">Go to the underwrite board →</Link>
        </div>
      ) : (
        <div className="cl-table-wrap">
          <table className="cl-table">
            <thead>
              <tr>
                <th>Deal</th>
                <th>Inspection</th>
                <th>Diligence</th>
                <th className="cl-num">Offer</th>
                <th className="cl-num">ESP</th>
                <th className="cl-num">Margin</th>
                <th aria-label="Open deal" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ deal, asset, days, diligence }) => {
                const landOverridden = asset.underwrite?.review?.overrides.some((o) => o.field === 'landPrice');
                const pct = diligence.total ? Math.round((diligence.signed / diligence.total) * 100) : 0;
                return (
                  <tr key={deal.oppId}>
                    <td>
                      <Link to={`/contract/${deal.oppId}`} className="cl-address">{deal.address}</Link>
                      <span className="cl-meta">
                        <Link to={`/asset/${deal.oppId}`} className="cl-id">{deal.oppId}</Link> · {asset.market} · {deal.planLine}
                      </span>
                    </td>
                    <td>
                      <span className={`cl-countdown cl-countdown--${inspectionTone(days)}`}>
                        <ProvenanceValue info={computed('Days until inspection expiry')}>
                          {days} {days === 1 ? 'day' : 'days'}
                        </ProvenanceValue>{' '}
                        left
                      </span>
                      <span className="cl-meta">Expires {shortDate(deal.inspectionExpires)}</span>
                    </td>
                    <td>
                      <span className="cl-diligence">
                        {diligence.signed} of {diligence.total} signed off
                      </span>
                      <span className="cl-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                      {diligence.openIssues > 0 && (
                        <span className="cl-meta cl-warn">
                          {diligence.openIssues} open {diligence.openIssues === 1 ? 'issue' : 'issues'}
                        </span>
                      )}
                    </td>
                    <td className="cl-num">
                      <ProvenanceValue info={landOverridden ? underwriteInfo(deal.oppId, 'landPrice') : SFDC}>{usd(deal.offer)}</ProvenanceValue>
                    </td>
                    <td className="cl-num">
                      <ProvenanceValue info={underwriteInfo(deal.oppId, 'esp')}>{usd(deal.esp)}</ProvenanceValue>
                    </td>
                    <td className="cl-num">
                      <ProvenanceValue info={underwriteInfo(deal.oppId, 'marginPct')}>{deal.marginPct.toFixed(1)}%</ProvenanceValue>
                    </td>
                    <td className="cl-num">
                      <Link to={`/contract/${deal.oppId}`} className="cl-link">Open deal →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

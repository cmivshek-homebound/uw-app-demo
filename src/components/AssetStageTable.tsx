import { Link, useNavigate } from 'react-router-dom';
import { latestMark } from '../data/selectors';
import type { Asset, AssetStage } from '../types';
import { markProvenance } from '../data/provenance';
import AssetLink from './AssetLink';
import ProvenanceValue from './ProvenanceValue';
// Reuse the queue's page and table classes (oq-*).
import '../pages/OpportunityQueue.css';

const STAGE_LABELS: Record<AssetStage, string> = {
  opportunity: 'Opportunity',
  underwriting: 'Underwriting',
  under_contract: 'Under Contract',
  precon: 'Pre-Con',
  construction: 'Construction',
  for_sale: 'For Sale',
  sold: 'Sold',
};

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatMonth(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export default function AssetStageTable({ assets }: { assets: Asset[] }) {
  const navigate = useNavigate();
  return (
    <div className="oq-table-wrapper">
      <table className="oq-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Property Address</th>
            <th>Market</th>
            <th>Stage</th>
            <th>Latest Mark</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const mark = latestMark(asset);
            return (
              <tr key={asset.id} className="oq-row" onClick={() => navigate(`/asset/${asset.id}`)}>
                <td className="oq-id"><AssetLink id={asset.id}>{asset.id}</AssetLink></td>
                <td className="oq-address"><AssetLink id={asset.id}>{asset.address}</AssetLink>, {asset.city}, {asset.state} {asset.zip}</td>
                <td>{asset.market}</td>
                <td>{STAGE_LABELS[asset.stage]}</td>
                <td>
                  {mark ? (
                    <>
                      <ProvenanceValue info={markProvenance(mark)}>{usd(mark.value)}</ProvenanceValue> <span className="per-year">{formatMonth(mark.month)}</span>
                    </>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {assets.length === 0 && <div className="oq-empty">
          No assets in this stage. <Link to="/" className="link-button">Back to the dashboard</Link>
        </div>}
    </div>
  );
}

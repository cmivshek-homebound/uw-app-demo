import { latestMark } from '../data/selectors';
import type { Asset, AssetStage } from '../types';
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
              <tr key={asset.id}>
                <td className="oq-id">{asset.id}</td>
                <td className="oq-address">{asset.address}, {asset.city}, {asset.state} {asset.zip}</td>
                <td>{asset.market}</td>
                <td>{STAGE_LABELS[asset.stage]}</td>
                <td>
                  {mark ? (
                    <>
                      {usd(mark.value)} <span className="per-year">{formatMonth(mark.month)}</span>
                    </>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {assets.length === 0 && <div className="oq-empty">No assets in this stage.</div>}
    </div>
  );
}

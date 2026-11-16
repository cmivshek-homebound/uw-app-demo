import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { latestMark } from '../data/selectors';
import type { Asset, AssetStage } from '../types';
import { BLUEPRINT, markProvenance } from '../data/provenance';
import AssetLink from './AssetLink';
import ProvenanceValue from './ProvenanceValue';
// Reuse the queue's page and table classes (oq-*).
import '../pages/OpportunityQueue.css';

const STAGE_LABELS: Record<AssetStage, string> = {
  opportunity: 'Intake',
  underwriting: 'Underwriting',
  under_contract: 'Under Contract',
  precon: 'Pre-Con',
  construction: 'Construction',
  for_sale: 'For Sale',
  sold: 'Sold',
};

const STAGE_ORDER: AssetStage[] = ['opportunity', 'underwriting', 'under_contract', 'precon', 'construction', 'for_sale', 'sold'];

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function signedUsd(n: number) {
  return `${n < 0 ? '−' : '+'}${usd(Math.abs(n))}`;
}

function formatMonth(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

// ── Sorting ────────────────────────────────────────────────────
type SortKey = 'id' | 'address' | 'market' | 'stage' | 'complete' | 'mark' | 'change';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'id', label: 'ID' },
  { key: 'address', label: 'Property Address' },
  { key: 'market', label: 'Market' },
  { key: 'stage', label: 'Stage' },
  { key: 'complete', label: '% Complete', numeric: true },
  { key: 'mark', label: 'Latest Mark', numeric: true },
  { key: 'change', label: 'vs Prior Month', numeric: true },
];

/** The latest mark's change from the month before; undefined when there's no prior mark. */
function markChange(asset: Asset): number | undefined {
  return (asset.marks?.length ?? 0) >= 2 ? latestMark(asset)!.changeFromPrior : undefined;
}

function sortValue(asset: Asset, key: SortKey): string | number | undefined {
  switch (key) {
    case 'id': return asset.id;
    case 'address': return asset.address;
    case 'market': return asset.market;
    case 'stage': return STAGE_ORDER.indexOf(asset.stage);
    case 'complete': return asset.owned?.pctComplete;
    case 'mark': return latestMark(asset)?.value;
    case 'change': return markChange(asset);
  }
}

function compare(a: Asset, b: Asset, key: SortKey, dir: SortDir): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  // Missing values sink to the bottom in either direction.
  if (va === undefined || vb === undefined) return va === vb ? 0 : va === undefined ? 1 : -1;
  const c = typeof va === 'number' && typeof vb === 'number'
    ? va - vb
    : String(va).localeCompare(String(vb), undefined, { numeric: true });
  return (dir === 'asc' ? c : -c) || a.id.localeCompare(b.id, undefined, { numeric: true });
}

export default function AssetStageTable({ assets }: { assets: Asset[] }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const rows = sort ? [...assets].sort((a, b) => compare(a, b, sort.key, sort.dir)) : assets;

  // Numbers sort high-first on the first click; text sorts A–Z.
  const toggle = (key: SortKey, numeric?: boolean) =>
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: numeric ? 'desc' : 'asc' },
    );

  return (
    <div className="oq-table-wrapper">
      <table className="oq-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={c.numeric ? 'oq-num' : undefined}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    className={`oq-sort ${active ? 'oq-sort--active' : ''}`}
                    onClick={() => toggle(c.key, c.numeric)}
                  >
                    {c.label}
                    <span className="oq-sort-arrow" aria-hidden="true">
                      {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((asset) => {
            const mark = latestMark(asset);
            const change = markChange(asset);
            const pct = asset.owned ? Math.round(asset.owned.pctComplete * 100) : undefined;
            return (
              <tr key={asset.id} className="oq-row" onClick={() => navigate(`/asset/${asset.id}`)}>
                <td className="oq-id"><AssetLink id={asset.id}>{asset.id}</AssetLink></td>
                <td className="oq-address"><AssetLink id={asset.id}>{asset.address}</AssetLink>, {asset.city}, {asset.state} {asset.zip}</td>
                <td>{asset.market}</td>
                <td>{STAGE_LABELS[asset.stage]}</td>
                <td className="oq-num">
                  {pct === undefined ? '—' : (
                    <span className="oq-pct">
                      <span className="oq-pct-bar" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, pct)}%` }} />
                      </span>
                      <ProvenanceValue info={BLUEPRINT}>{pct}%</ProvenanceValue>
                    </span>
                  )}
                </td>
                <td className="oq-num">
                  {mark ? (
                    <>
                      <ProvenanceValue info={markProvenance(mark)}>{usd(mark.value)}</ProvenanceValue> <span className="per-year">{formatMonth(mark.month)}</span>
                    </>
                  ) : '—'}
                </td>
                <td className={`oq-num ${change ? (change < 0 ? 'oq-change--down' : 'oq-change--up') : ''}`}>
                  {change === undefined ? '—' : change === 0 ? 'No change' : (
                    <ProvenanceValue info={markProvenance(mark)}>{signedUsd(change)}</ProvenanceValue>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {assets.length === 0 && <div className="oq-empty">No assets.</div>}
    </div>
  );
}

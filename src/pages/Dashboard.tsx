import { useNavigate, useSearchParams } from 'react-router-dom';
import { DEMO_TODAY, daysRemaining, daysSince } from '../data/dates';
import {
  ASSET_STAGES,
  BALANCE_SHEET_STAGES,
  MARKETS,
  SOLD_WINDOW_MONTHS,
  STALE_LISTING_DAYS,
  assetsByStage,
  assetsNeedingApproval,
  balanceSheet,
  filterAssets,
  latestMark,
  lifecycleByStage,
  pipelineAssets,
  staleListings,
} from '../data/selectors';
import type { BalanceSheetRow } from '../data/selectors';
import type { Asset, AssetStage, Market, PipelineStatus } from '../types';
// Reuse the queue's pill filter buttons (.filter-btn).
import './OpportunityQueue.css';
import './Dashboard.css';

const STATUS_ORDER: PipelineStatus[] = ['pending_review', 'in_review', 'ready_for_offer', 'dqd'];

const STATUS_LABELS: Record<PipelineStatus, string> = {
  pending_review: 'Pending Review',
  in_review: 'In Review',
  ready_for_offer: 'Ready for Offer',
  dqd: "DQ'd",
};

type Phase = 'pipeline' | 'contract' | 'owned' | 'sold';

const STAGE_META: Record<AssetStage, { label: string; phase: Phase; to: string | null; valueNote: string }> = {
  opportunity:    { label: 'Opportunity',    phase: 'pipeline', to: '/queue',      valueNote: 'UW ESP' },
  underwriting:   { label: 'Underwriting',   phase: 'pipeline', to: '/underwrite', valueNote: 'UW ESP' },
  under_contract: { label: 'Under Contract', phase: 'contract', to: '/contract',   valueNote: 'UW ESP' },
  precon:         { label: 'Pre-Con',        phase: 'owned',    to: '/portfolio',  valueNote: 'current mark' },
  construction:   { label: 'Construction',   phase: 'owned',    to: '/portfolio',  valueNote: 'current mark' },
  for_sale:       { label: 'For Sale',       phase: 'owned',    to: '/for-sale',   valueNote: 'current mark' },
  sold:           { label: 'Sold',           phase: 'sold',     to: null,          valueNote: `sales · last ${SOLD_WINDOW_MONTHS} mo` },
};

const INSPECTION_WARN_DAYS = 7;
const LONGEST_PENDING_LIMIT = 3;

// ── Needs attention ──
// Reasons in urgency order: hard deadlines first, then sign-offs, then
// slow listings, then intake backlog. Within a reason, `severity` sorts
// most urgent first.
type AttentionReason = 'inspection' | 'mark_approval' | 'stale_listing' | 'pending_review';

const REASON_META: Record<AttentionReason, { rank: number; tag: string; tone: string }> = {
  inspection:     { rank: 0, tag: 'Inspection deadline', tone: 'urgent' },
  mark_approval:  { rank: 1, tag: 'Mark needs approval', tone: 'warn' },
  stale_listing:  { rank: 2, tag: 'Stale listing',       tone: 'neutral' },
  pending_review: { rank: 3, tag: 'Pending review',      tone: 'neutral' },
};

interface AttentionItem {
  asset: Asset;
  reason: AttentionReason;
  detail: string;
  severity: number; // higher = more urgent within its reason
  to: string;
}

/** Page where an asset at its current stage is worked. */
function assetPath(asset: Asset): string {
  switch (asset.stage) {
    case 'opportunity':
    case 'underwriting':   return `/underwrite/${asset.id}`;
    case 'under_contract': return `/contract/${asset.id}`;
    case 'for_sale':       return '/for-sale';
    default:               return '/portfolio';
  }
}

function signedUsd(n: number) {
  const abs = Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return `${n < 0 ? '−' : '+'}${abs}`;
}

function usdCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function pct(n: number | null) {
  return n === null ? '—' : `${n.toFixed(1)}%`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function BalanceCells({ row }: { row: BalanceSheetRow }) {
  return (
    <>
      <td className="db-num">{row.count}</td>
      <td className="db-num">{row.count ? usdCompact(row.costBasis) : '—'}</td>
      <td className="db-num">{row.count ? usdCompact(row.currentMark) : '—'}</td>
      <td className="db-num db-margin">{pct(row.impliedMarginPct)}</td>
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // ── Filters (kept in the URL so they survive navigating away and back) ──
  const marketParam = params.get('market');
  const market = MARKETS.includes(marketParam as Market) ? (marketParam as Market) : undefined;

  const setMarket = (value: Market | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set('market', value);
    else next.delete('market');
    setParams(next, { replace: true });
  };

  const assets = filterAssets(undefined, { market });

  // ── Lifecycle ──
  const lifecycle = lifecycleByStage(assets);

  // ── Balance sheet ──
  const sheet = balanceSheet(assets);

  // ── Pipeline by market ──
  const pipeline = pipelineAssets(assets);
  const markets = MARKETS.filter((m) => pipeline.some((a) => a.market === m));
  const pipelineRows = markets.map((m) => {
    const inMarket = pipeline.filter((a) => a.market === m);
    const counts = Object.fromEntries(
      STATUS_ORDER.map((s) => [s, inMarket.filter((a) => a.pipelineStatus === s).length]),
    ) as Record<PipelineStatus, number>;
    return { market: m, counts, total: inMarket.length };
  });
  const statusTotals = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, pipeline.filter((a) => a.pipelineStatus === s).length]),
  ) as Record<PipelineStatus, number>;

  // ── Needs attention ──
  const attention: AttentionItem[] = [
    ...assetsByStage(assets).under_contract
      .filter((a) => a.contract)
      .map((a) => ({ asset: a, days: daysRemaining(a.contract!.inspectionExpires) }))
      .filter(({ days }) => days < INSPECTION_WARN_DAYS)
      .map(({ asset, days }) => ({
        asset, reason: 'inspection' as const, detail: `${plural(days, 'day')} left`, severity: -days, to: assetPath(asset),
      })),
    ...assetsNeedingApproval(assets).map((asset) => {
      const change = latestMark(asset)!.changeFromPrior;
      return {
        asset, reason: 'mark_approval' as const, detail: `${signedUsd(change)} latest mark`,
        severity: Math.abs(change), to: assetPath(asset),
      };
    }),
    ...staleListings(assets).map((asset) => ({
      asset, reason: 'stale_listing' as const, detail: `${asset.listing!.daysOnMarket} days on market`,
      severity: asset.listing!.daysOnMarket, to: assetPath(asset),
    })),
    ...pipeline
      .filter((a) => a.pipelineStatus === 'pending_review' && a.intake)
      .map((a) => ({ asset: a, days: daysSince(a.intake!.dateReceived) }))
      .sort((a, b) => b.days - a.days)
      .slice(0, LONGEST_PENDING_LIMIT)
      .map(({ asset, days }) => ({
        asset, reason: 'pending_review' as const, detail: `${plural(days, 'day')} waiting`, severity: days, to: assetPath(asset),
      })),
  ].sort((a, b) => REASON_META[a.reason].rank - REASON_META[b.reason].rank || b.severity - a.severity);

  const asOf = new Date(DEMO_TODAY).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  const scope = ['BOOL infill', market ?? 'all markets'].join(' · ');

  return (
    <div className="db-page">
      <div className="db-header">
        <div>
          <h1 className="db-title">Portfolio Overview</h1>
          <p className="db-subtitle">
            {plural(assets.length, 'asset')} · {scope} · as of {asOf}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="db-filters">
        <div className="db-filter-group">
          <span className="db-filter-label">Market</span>
          <div className="oq-filters">
            {[undefined, ...MARKETS].map((m) => (
              <button
                key={m ?? 'all'}
                className={`filter-btn ${market === m ? 'active' : ''}`}
                onClick={() => setMarket(m)}
              >
                {m ?? 'All'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lifecycle strip */}
      <div className="db-lifecycle" role="list">
        {ASSET_STAGES.map((stage, i) => {
          const meta = STAGE_META[stage];
          const { count, value, valuedCount } = lifecycle[stage];
          const valueText = valuedCount > 0 ? usdCompact(value) : '—';
          const note = valuedCount > 0 && valuedCount < count
            ? `${meta.valueNote} · ${valuedCount} of ${count}`
            : count > 0 && valuedCount === 0 ? 'not yet underwritten' : meta.valueNote;
          return (
            <div key={stage} className={`db-stage-wrap db-stage-wrap--${meta.phase}`} role="listitem">
              {i > 0 && <span className="db-stage-arrow" aria-hidden="true">›</span>}
              <button
                className="db-stage"
                disabled={!meta.to}
                onClick={() => meta.to && navigate(meta.to)}
                title={meta.to ? `Open ${meta.label}` : undefined}
              >
                <span className="db-stage-label">{meta.label}</span>
                <span className="db-stage-count">{count}</span>
                <span className="db-stage-value">{valueText}</span>
                <span className="db-stage-note">{note}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Balance sheet */}
      <section className="db-card db-balance">
        <div className="db-card-header">
          <h2 className="db-card-title">Balance Sheet</h2>
          <span className="db-card-caption">Owned assets not yet sold</span>
        </div>
        <table className="db-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th className="db-num">Assets</th>
              <th className="db-num">Cost Basis</th>
              <th className="db-num">Current Mark</th>
              <th className="db-num">Implied Margin</th>
            </tr>
          </thead>
          <tbody>
            {BALANCE_SHEET_STAGES.map((stage) => (
              <tr key={stage}>
                <td className="db-market">{STAGE_META[stage].label}</td>
                <BalanceCells row={sheet.rows[stage]} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <BalanceCells row={sheet.total} />
            </tr>
          </tfoot>
        </table>
        <p className="db-footnote">
          Cost basis = land + vertical spend to date. Implied margin = (current mark − underwritten
          all-in cost) ÷ current mark.
        </p>
      </section>

      {/* Needs attention */}
      <section className="db-card db-attention">
        <div className="db-card-header">
          <h2 className="db-card-title">Needs Attention</h2>
          <span className="db-card-caption">
            Inspections &lt; {INSPECTION_WARN_DAYS} days · marks &gt; $10K awaiting approval · listings &gt; {STALE_LISTING_DAYS} days · longest pending review
          </span>
        </div>
        {attention.length === 0 ? (
          <p className="db-empty db-empty--padded">Nothing needs attention for these filters.</p>
        ) : (
          <ul className="db-list">
            {attention.map(({ asset, reason, detail, to }) => (
              <li key={`${asset.id}-${reason}`}>
                <button className="db-list-row" onClick={() => navigate(to)}>
                  <span className="db-list-main">
                    <span className="db-list-id">{asset.id}</span>
                    <span className="db-list-address">{asset.address} · {asset.market}</span>
                  </span>
                  <span className="db-attention-meta">
                    <span className="db-attention-detail">{detail}</span>
                    <span className={`db-pill db-pill--${REASON_META[reason].tone}`}>{REASON_META[reason].tag}</span>
                    <span className="db-attention-go" aria-hidden="true">→</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

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
        {pipeline.length === 0 ? (
          <p className="db-empty db-empty--padded">No pipeline opportunities match these filters.</p>
        ) : (
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
              {pipelineRows.map(({ market: m, counts, total }) => (
                <tr key={m}>
                  <td className="db-market">{m}</td>
                  {STATUS_ORDER.map((s) => (
                    <td key={s} className={`db-num ${counts[s] === 0 ? 'db-zero' : ''}`}>{counts[s]}</td>
                  ))}
                  <td className="db-num db-total">{total}</td>
                  <td className="db-bar-col">
                    <div className="db-bar" title={`${m}: ${total} of ${pipeline.length} opportunities`}>
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
        )}
      </section>
    </div>
  );
}

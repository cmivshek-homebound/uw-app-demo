import type { ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ProvenanceValue from '../components/ProvenanceValue';
import { ASSETS } from '../data/assets';
import { DEMO_TODAY, daysRemaining, daysSince } from '../data/dates';
import { useMarkReviews, withMarkReviews } from '../data/markReview';
import { useDraftReviews, withReviewStatus } from '../data/review';
import { useIntake, withIntakeDecisions } from '../data/intake';
import { MLS, computed } from '../data/provenance';
import {
  ASSET_STAGES,
  BALANCE_SHEET_STAGES,
  MARKETS,
  SOLD_WINDOW_MONTHS,
  assetsByStage,
  assetsNeedingApproval,
  balanceSheet,
  filterAssets,
  lifecycleByStage,
  pipelineAssets,
  staleListings,
  untriagedLeads,
} from '../data/selectors';
import type { BalanceSheetRow } from '../data/selectors';
import type { Asset, AssetStage, Market, ProvenanceInfo, UnderwritingStatus } from '../types';
// Reuse the queue's pill filter buttons (.filter-btn).
import './OpportunityQueue.css';
import '../components/AssetLink.css';
import RoleBanner from '../components/RoleBanner';
import { useRole } from '../data/role';
import UnderwritingAccuracyTab from './UnderwritingAccuracyTab';
import AssetStageTable from '../components/AssetStageTable';
import './PortfolioPage.css';
import './Dashboard.css';

// Pre-contract columns: intake (untriaged, on hold), then the Underwrite board.
type PipelineColumn = 'untriaged' | 'held' | UnderwritingStatus;

const STATUS_ORDER: PipelineColumn[] = ['untriaged', 'held', 'ai_drafting', 'draft_ready', 'analyst_review', 'submitted_to_growth'];

const STATUS_LABELS: Record<PipelineColumn, string> = {
  untriaged: 'Untriaged',
  held: 'On hold',
  ai_drafting: 'AI drafting',
  draft_ready: 'Draft ready',
  analyst_review: 'Analyst review',
  submitted_to_growth: 'Submitted',
};

function pipelineColumn(a: Asset): PipelineColumn | undefined {
  if (a.disqualified) return undefined;
  if (a.stage === 'opportunity') return a.hold ? 'held' : 'untriaged';
  return a.underwritingStatus;
}

type Phase = 'pipeline' | 'contract' | 'owned' | 'sold';

const STAGE_META: Record<AssetStage, { label: string; phase: Phase; to: string | null; valueNote: string }> = {
  opportunity:    { label: 'Intake',         phase: 'pipeline', to: '/intake',     valueNote: 'UW ESP' },
  underwriting:   { label: 'Underwriting',   phase: 'pipeline', to: '/underwrite', valueNote: 'UW ESP' },
  under_contract: { label: 'Under Contract', phase: 'contract', to: '/contract',   valueNote: 'UW ESP' },
  precon:         { label: 'Pre-Con',        phase: 'owned',    to: '/construction', valueNote: 'current mark' },
  construction:   { label: 'Construction',   phase: 'owned',    to: '/construction', valueNote: 'current mark' },
  for_sale:       { label: 'For Sale',       phase: 'owned',    to: '/for-sale',   valueNote: 'current mark' },
  sold:           { label: 'Sold',           phase: 'sold',     to: null,          valueNote: `sales · last ${SOLD_WINDOW_MONTHS} mo` },
};

// Lifecycle brackets, matching the nav's groups: divided at closing.
const LIFECYCLE_GROUPS: { label: string; stages: AssetStage[] }[] = [
  { label: 'Acquisitions', stages: ['opportunity', 'underwriting', 'under_contract'] },
  { label: 'Portfolio', stages: ['precon', 'construction', 'for_sale', 'sold'] },
];

// What each lifecycle stage's dollar value sums.
const PHASE_VALUE_PROVENANCE: Record<Phase, ProvenanceInfo> = {
  pipeline: computed('Sum of underwrite ESPs'),
  contract: computed('Sum of underwrite ESPs'),
  owned: computed('Sum of latest month-end marks'),
  sold: computed('Sum of sale prices'),
};

const INSPECTION_WARN_DAYS = 7;
const LONGEST_PENDING_LIMIT = 3;

// ── Needs attention ──
// Reasons in urgency order: hard deadlines first, then sign-offs, then
// slow listings, then intake backlog. Within a reason, `severity` sorts
// most urgent first.
type AttentionReason = 'inspection' | 'mark_approval' | 'stale_listing' | 'untriaged';

const REASON_META: Record<AttentionReason, { rank: number; tag: string; tone: string }> = {
  inspection:     { rank: 0, tag: 'Inspection deadline', tone: 'urgent' },
  mark_approval:  { rank: 1, tag: 'Mark needs approval', tone: 'warn' },
  stale_listing:  { rank: 2, tag: 'Stale listing',       tone: 'neutral' },
  untriaged:      { rank: 3, tag: 'Untriaged lead',      tone: 'neutral' },
};

interface AttentionItem {
  asset: Asset;
  reason: AttentionReason;
  detail: ReactNode;
  severity: number; // higher = more urgent within its reason
  to: string;
}

/** Page where an asset at its current stage is worked. */
function assetPath(asset: Asset): string {
  return `/asset/${asset.id}`;
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
      <td className="db-num">
        {row.count ? <ProvenanceValue info={computed('Sum of land + vertical spend to date')}>{usdCompact(row.costBasis)}</ProvenanceValue> : '—'}
      </td>
      <td className="db-num">
        {row.count ? <ProvenanceValue info={computed('Sum of land + full vertical budget')}>{usdCompact(row.projectedTotalCost)}</ProvenanceValue> : '—'}
      </td>
      <td className="db-num">
        {row.count ? <ProvenanceValue info={computed('Sum of latest month-end marks')}>{usdCompact(row.currentMark)}</ProvenanceValue> : '—'}
      </td>
      <td className="db-num db-margin">
        {row.impliedMarginPct === null ? '—' : <ProvenanceValue info={computed('Implied margin on current marks')}>{pct(row.impliedMarginPct)}</ProvenanceValue>}
      </td>
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { role } = useRole();

  // ── Filters (kept in the URL so they survive navigating away and back) ──
  const marketParam = params.get('market');
  const market = MARKETS.includes(marketParam as Market) ? (marketParam as Market) : undefined;

  const setMarket = (value: Market | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set('market', value);
    else next.delete('market');
    setParams(next, { replace: true });
  };

  // Month-end review state applies: approved moves leave Needs attention, and
  // once April is published the balance sheet marks to it.
  const { reviews: markReviews, published } = useMarkReviews();
  // Drafts submitted to Growth this session count as Ready for Offer, as on the board.
  const { reviews: draftReviews } = useDraftReviews();
  // Intake decisions apply too: sent leads join the board, DQ'd leads drop out.
  const { decisions } = useIntake();
  const scoped = filterAssets(
    withReviewStatus(withIntakeDecisions(withMarkReviews(ASSETS, markReviews, published), decisions), draftReviews),
    { market },
  );
  // Disqualified leads live only in the Intake page's log.
  const assets = scoped.filter((a) => !a.disqualified);

  // ── Lifecycle ──
  const lifecycle = lifecycleByStage(assets);

  // ── Balance sheet ──
  const sheet = balanceSheet(assets);

  // ── Intake & underwriting by market ──
  const pipeline = pipelineAssets(assets).filter((a) => pipelineColumn(a));
  const markets = MARKETS.filter((m) => pipeline.some((a) => a.market === m));
  const pipelineRows = markets.map((m) => {
    const inMarket = pipeline.filter((a) => a.market === m);
    const counts = Object.fromEntries(
      STATUS_ORDER.map((s) => [s, inMarket.filter((a) => pipelineColumn(a) === s).length]),
    ) as Record<PipelineColumn, number>;
    return { market: m, counts, total: inMarket.length };
  });
  const statusTotals = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, pipeline.filter((a) => pipelineColumn(a) === s).length]),
  ) as Record<PipelineColumn, number>;

  // ── Needs attention ──
  const attention: AttentionItem[] = [
    ...assetsByStage(assets).under_contract
      .filter((a) => a.contract)
      .map((a) => ({ asset: a, days: daysRemaining(a.contract!.inspectionExpires) }))
      .filter(({ days }) => days < INSPECTION_WARN_DAYS)
      .map(({ asset, days }) => ({
        asset, reason: 'inspection' as const,
        detail: <><ProvenanceValue info={computed('Days until inspection expiry')}>{plural(days, 'day')}</ProvenanceValue> left</>, severity: -days, to: assetPath(asset),
      })),
    ...assetsNeedingApproval(assets).map((asset) => {
      const change = asset.markProposal!.change;
      return {
        asset, reason: 'mark_approval' as const,
        detail: <><ProvenanceValue info={{ provenance: 'ai', note: 'Awaiting approval' }}>{signedUsd(change)}</ProvenanceValue> April proposal</>,
        severity: Math.abs(change), to: assetPath(asset),
      };
    }),
    ...staleListings(assets).map((asset) => ({
      asset, reason: 'stale_listing' as const,
      detail: <><ProvenanceValue info={MLS}>{asset.listing!.daysOnMarket} days</ProvenanceValue> on market</>,
      severity: asset.listing!.daysOnMarket, to: assetPath(asset),
    })),
    ...untriagedLeads(assets)
      .filter((a) => a.intake)
      .map((a) => ({ asset: a, days: daysSince(a.intake!.dateReceived) }))
      .sort((a, b) => b.days - a.days)
      .slice(0, LONGEST_PENDING_LIMIT)
      .map(({ asset, days }) => ({
        asset, reason: 'untriaged' as const,
        detail: <><ProvenanceValue info={computed('Days since intake')}>{plural(days, 'day')}</ProvenanceValue> waiting</>, severity: days, to: '/intake',
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
          <h1 className="db-title">Dashboard</h1>
          <p className="db-subtitle">
            {plural(assets.length, 'asset')} · {scope} · as of {asOf}
          </p>
        </div>
      </div>

      {role === 'executive' && (
        <RoleBanner next={{ to: '#underwriting-accuracy', label: 'Jump to underwriting accuracy' }}>
          Executive view: portfolio health first, then how underwriting held up on sold homes. Action buttons are hidden.
        </RoleBanner>
      )}

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

      {/* Lifecycle strip, bracketed into Acquisitions and Portfolio */}
      <div className="db-lifecycle" role="list">
        {LIFECYCLE_GROUPS.map((group) => (
          <div
            key={group.label}
            className="db-lifecycle-group"
            style={{ flexGrow: group.stages.length }}
            role="group"
            aria-label={group.label}
          >
            <span className="db-lifecycle-bracket">{group.label}</span>
            <div className="db-lifecycle-stages">
              {group.stages.map((stage) => {
                const i = ASSET_STAGES.indexOf(stage);
                const meta = STAGE_META[stage];
                const { count, value, valuedCount } = lifecycle[stage];
                const valueText = valuedCount > 0
                  ? <ProvenanceValue info={PHASE_VALUE_PROVENANCE[meta.phase]}>{usdCompact(value)}</ProvenanceValue>
                  : '—';
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
          </div>
        ))}
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
              <th className="db-num">Cost to Date</th>
              <th className="db-num">Projected Total Cost</th>
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
          Cost to date = land + vertical spend to date. Projected total cost = land + full vertical
          budget. Implied margin = (current mark − projected total cost) ÷ current mark.
        </p>
      </section>

      {/* Needs attention */}
      <section className="db-card db-attention">
        <div className="db-card-header">
          <h2 className="db-card-title">Needs Attention</h2>
          <span className="db-card-caption">
            Inspections &lt; {INSPECTION_WARN_DAYS} days · marks &gt; $10K awaiting approval · listings over 1.5× market days on market · oldest untriaged leads
          </span>
        </div>
        {attention.length === 0 ? (
          <p className="db-empty db-empty--padded">
            Nothing needs attention{market ? ` in ${market}` : ''}.
            {market && <button className="link-button" onClick={() => setMarket(undefined)}>Show all markets</button>}
          </p>
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
          <h2 className="db-card-title">Intake &amp; Underwriting by Market</h2>
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
          <p className="db-empty db-empty--padded">
            No leads in intake or underwriting{market ? ` in ${market}` : ''}.
            {market
              ? <button className="link-button" onClick={() => setMarket(undefined)}>Show all markets</button>
              : <Link to="/intake" className="link-button">Open intake</Link>}
          </p>
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
                    <div className="db-bar" title={`${m}: ${total} of ${pipeline.length} pre-contract lots`}>
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

      {role === 'executive' && (
        <section id="underwriting-accuracy" className="db-accuracy">
          <h2 className="db-accuracy-title">Underwriting accuracy</h2>
          <UnderwritingAccuracyTab />
        </section>
      )}

      {/* All assets */}
      <details className="db-card db-all-assets">
        <summary className="db-all-summary">
          <span className="db-card-title">All assets</span>
          <span className="db-all-count">{assets.length}</span>
          <span className="db-all-hint">{market ? `${market} · ` : ''}every stage, sortable</span>
        </summary>
        <AssetStageTable assets={assets} />
      </details>
    </div>
  );
}

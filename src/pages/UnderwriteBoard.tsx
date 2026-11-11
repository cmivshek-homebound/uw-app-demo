import { Link, useSearchParams } from 'react-router-dom';
import ProvenanceValue from '../components/ProvenanceValue';
import { getAIDraft } from '../data/aiDrafts';
import { AI, SFDC, computed } from '../data/provenance';
import { useDraftReviews, withReviewStatus } from '../data/review';
import {
  BOARD_LATE_DAYS,
  BOARD_WARN_DAYS,
  MARKETS,
  UNDERWRITING_STATUSES,
  boardAnalysts,
  daysInColumn,
  disqualifiedPipeline,
  filterAssets,
  underwritingBoard,
} from '../data/selectors';
import type { Asset, Market, UnderwritingStatus } from '../types';
// Reuse the queue's pill filter buttons (.filter-btn) and page shell (.oq-page).
import './OpportunityQueue.css';
import './UnderwriteBoard.css';

const DAYS_IN_COLUMN = computed('Days in current board column');

const COLUMN_LABELS: Record<UnderwritingStatus, string> = {
  ai_drafting: 'AI drafting',
  draft_ready: 'Draft ready for review',
  analyst_review: 'In analyst review',
  submitted_to_growth: 'Submitted to Growth',
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function ageTone(days: number) {
  if (days > BOARD_LATE_DAYS) return 'late';
  if (days > BOARD_WARN_DAYS) return 'warn';
  return 'ok';
}

function BoardCard({ asset }: { asset: Asset }) {
  const draft = getAIDraft(asset.id);
  const drafting = asset.underwritingStatus === 'ai_drafting';
  const days = daysInColumn(asset);

  return (
    <Link to={`/underwrite/${asset.id}/draft`} className="ub-card">
      <div className="ub-card-top">
        <span className="ub-address">{asset.address}</span>
        {asset.analyst && (
          <span className="ub-analyst" title={`Assigned to ${asset.analyst}`}>
            {initials(asset.analyst)}
          </span>
        )}
      </div>
      <div className="ub-meta">
        {asset.market}
        <span className="ub-meta-sep">·</span>
        <ProvenanceValue info={SFDC}>{asset.lotSqFt.toLocaleString()} sqft</ProvenanceValue>
      </div>

      {drafting ? (
        <div className="ub-drafting">
          <div className="ub-progress" role="progressbar" aria-label="AI draft in progress">
            <span className="ub-progress-bar" />
          </div>
          <span className="ub-drafting-label">Pulling lot data, plans and comps…</span>
        </div>
      ) : (
        draft && (
          <>
            <div className="ub-chips">
              <span className={`ub-score ub-score--${draft.overallConfidence}`}>
                <ProvenanceValue info={AI}>{draft.confidenceScore}</ProvenanceValue>
                <span className="ub-score-label">confidence</span>
              </span>
              {draft.adu.fits && <span className="ub-adu">ADU fits</span>}
            </div>
            <p className="ub-risk">{draft.topRisk}</p>
          </>
        )
      )}

      <div className="ub-card-footer">
        <span className={`ub-age ub-age--${ageTone(days)}`}>
          <ProvenanceValue info={DAYS_IN_COLUMN}>{days} {days === 1 ? 'day' : 'days'}</ProvenanceValue> in column
        </span>
      </div>
    </Link>
  );
}

export default function UnderwriteBoard() {
  const [params, setParams] = useSearchParams();

  // ── Filters (kept in the URL so they survive navigating to a draft and back) ──
  const marketParam = params.get('market');
  const market = MARKETS.includes(marketParam as Market) ? (marketParam as Market) : undefined;
  const analysts = boardAnalysts();
  const analystParam = params.get('analyst');
  const analyst = analystParam && analysts.includes(analystParam) ? analystParam : undefined;

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const { reviews } = useDraftReviews();
  const marketAssets = filterAssets(withReviewStatus(filterAssets(), reviews), { market });
  const scoped = marketAssets.filter((a) => !analyst || a.analyst === analyst);
  const board = underwritingBoard(scoped);
  const onBoard = UNDERWRITING_STATUSES.reduce((sum, s) => sum + board[s].length, 0);
  const dqCount = disqualifiedPipeline(marketAssets).length;

  return (
    <div className="oq-page ub-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Underwrite</h1>
          <p className="oq-subtitle">
            {onBoard} pipeline {onBoard === 1 ? 'asset' : 'assets'} · {board.draft_ready.length} AI{' '}
            {board.draft_ready.length === 1 ? 'draft' : 'drafts'} ready for review
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="ub-filters">
        <div className="ub-filter-group">
          <span className="ub-filter-label">Market</span>
          <div className="oq-filters">
            {[undefined, ...MARKETS].map((m) => (
              <button
                key={m ?? 'all'}
                className={`filter-btn ${market === m ? 'active' : ''}`}
                onClick={() => setParam('market', m)}
              >
                {m ?? 'All'}
              </button>
            ))}
          </div>
        </div>
        <div className="ub-filter-group">
          <span className="ub-filter-label">Assigned to</span>
          <div className="oq-filters">
            {[undefined, ...analysts].map((a) => (
              <button
                key={a ?? 'all'}
                className={`filter-btn ${analyst === a ? 'active' : ''}`}
                onClick={() => setParam('analyst', a)}
              >
                {a ?? 'Everyone'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="ub-board">
        {UNDERWRITING_STATUSES.map((status) => (
          <section key={status} className={`ub-column ub-column--${status}`}>
            <header className="ub-column-header">
              <h2 className="ub-column-title">{COLUMN_LABELS[status]}</h2>
              <span className="ub-column-count">{board[status].length}</span>
            </header>
            <div className="ub-column-body">
              {board[status].map((asset) => (
                <BoardCard key={asset.id} asset={asset} />
              ))}
              {board[status].length === 0 && <p className="ub-empty">Nothing here</p>}
            </div>
          </section>
        ))}
      </div>

      {dqCount > 0 && (
        <p className="ub-dq">
          <Link to="/queue?status=dqd" className="ub-dq-link">
            {dqCount} disqualified {dqCount === 1 ? 'opportunity' : 'opportunities'} →
          </Link>
        </p>
      )}
    </div>
  );
}

import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import AssetLink from '../components/AssetLink';
import { CATEGORY_LABELS } from '../components/constructionFormat';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import {
  BUDGET_STATUS_LABELS,
  COST_BOOK,
  LAST_SYNC,
  STALE_COST_BOOK_DAYS,
  STALE_PROMOTION_DAYS,
  SYNC_ERRORS,
  budgetSync,
  costBookAge,
  promotionImpact,
  seededPromotionLog,
  useBlueprint,
} from '../data/blueprint';
import type { BudgetSync, BudgetSyncStatus } from '../data/blueprint';
import { relativeTime } from '../data/dates';
import { decider } from '../data/intake';
import { BLUEPRINT, computed, human } from '../data/provenance';
import { useCanAct, useRole } from '../data/role';
import { useSessionAssets } from '../data/useSessionAssets';
import type { SpecLevelName } from '../data/plans';
import type { AssetStage } from '../types';
import './OpportunityQueue.css';
import './PortfolioPage.css';
import './BlueprintSyncPage.css';

const SPEC_LEVELS: SpecLevelName[] = ['Essential', 'Deluxe', 'Premium', 'Premium+'];
const STATUS_ORDER: BudgetSyncStatus[] = ['changed', 'never', 'stale', 'in_sync'];
const STAGE_LABELS: Partial<Record<AssetStage, string>> = { precon: 'Pre-Con', construction: 'Construction', for_sale: 'For Sale' };
const LOG_PREVIEW = 8;

function usd(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

function signedUsd(n: number) {
  if (n === 0) return '$0';
  return `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

function shortDate(iso: string, withYear = false) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear && { year: 'numeric' }), timeZone: 'UTC' });
}

// ── Promote preview ────────────────────────────────────────────
function PromotePreview({ sync, onCancel, onPromote }: { sync: BudgetSync; onCancel: () => void; onPromote: () => void }) {
  const impact = promotionImpact(sync);
  const changed = sync.lines.filter((l) => l.change !== 0);
  const marginPts = impact.marginAfter - impact.marginBefore;
  return (
    <div className="bp-preview">
      <div className="bp-preview-head">
        <strong>Promote Blueprint {sync.bpVersion}</strong> over underwriting {sync.uwVersion}
        {sync.note && <span className="bp-muted"> · {sync.note}</span>}
      </div>
      <div className="bp-preview-grid">
        <table className="pf-table bp-diff">
          <thead>
            <tr>
              <th>Category</th>
              <th className="pf-num">UW amount</th>
              <th className="pf-num">Blueprint</th>
              <th className="pf-num">Change</th>
            </tr>
          </thead>
          <tbody>
            {sync.lines.map((l) => (
              <tr key={l.category} className={l.change ? 'bp-diff-row--changed' : ''}>
                <td>{CATEGORY_LABELS[l.category]}</td>
                <td className="pf-num"><ProvenanceValue info={human('Promoted underwriting budget')}>{usd(l.uw)}</ProvenanceValue></td>
                <td className="pf-num"><ProvenanceValue info={BLUEPRINT}>{usd(l.blueprint)}</ProvenanceValue></td>
                <td className={`pf-num ${l.change > 0 ? 'bp-bad' : l.change < 0 ? 'bp-good' : 'bp-muted'}`}>{l.change ? signedUsd(l.change) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="pf-num">{usd(sync.uwAmount)}</td>
              <td className="pf-num">{usd(sync.bpAmount)}</td>
              <td className={`pf-num ${sync.diff > 0 ? 'bp-bad' : sync.diff < 0 ? 'bp-good' : ''}`}>{signedUsd(sync.diff)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="bp-impact">
          <h4 className="bp-impact-title">Impact</h4>
          <dl className="bp-impact-lines">
            <dt>Projected total cost</dt>
            <dd>
              <ProvenanceValue info={computed('Land + full build budget')}>{usd(impact.costBefore)}</ProvenanceValue> →{' '}
              <ProvenanceValue info={computed('Land + Blueprint build budget')}>{usd(impact.costAfter)}</ProvenanceValue>
            </dd>
            <dt>Current mark</dt>
            <dd><ProvenanceValue info={computed('Latest month-end mark')}>{usd(impact.mark)}</ProvenanceValue></dd>
            <dt>Implied margin</dt>
            <dd>
              {impact.marginBefore.toFixed(1)}% → <strong>{impact.marginAfter.toFixed(1)}%</strong>
              <span className={`bp-pts ${marginPts < 0 ? 'bp-bad' : marginPts > 0 ? 'bp-good' : ''}`}>
                {' '}({marginPts > 0 ? '+' : marginPts < 0 ? '−' : ''}{Math.abs(marginPts).toFixed(1)} pts)
              </span>
            </dd>
          </dl>
          {changed.length === 0 && <p className="bp-muted bp-small">No line changes: promoting re-confirms the current budget.</p>}
          <div className="bp-preview-actions">
            <button className="pf-btn pf-btn--small" onClick={onCancel}>Cancel</button>
            <button className="pf-btn pf-btn--small pf-btn--primary" onClick={onPromote}>Promote {sync.bpVersion}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function BlueprintSyncPage() {
  const assets = useSessionAssets();
  const { promotions, promote } = useBlueprint();
  const { role, analyst } = useRole();
  const canAct = useCanAct();
  const [open, setOpen] = useState<string | null>(null);
  const [showAllLog, setShowAllLog] = useState(false);

  const owned = assets.filter((a) => a.owned && a.stage !== 'sold');
  const rows = owned
    .map((a) => budgetSync(a, promotions))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.asset.id.localeCompare(b.asset.id, undefined, { numeric: true }));
  const count = (s: BudgetSyncStatus) => rows.filter((r) => r.status === s).length;
  const inSyncPct = Math.round((count('in_sync') / rows.length) * 100);

  const records = COST_BOOK.length + owned.reduce((s, a) => s + a.owned!.budgetLines.length, 0) + owned.length;
  const staleBook = COST_BOOK.filter((r) => costBookAge(r) > STALE_COST_BOOK_DAYS).length;

  const log = [...Object.values(promotions), ...seededPromotionLog().filter((p) => !promotions[p.assetId] || p.at < promotions[p.assetId].at)]
    .sort((a, b) => b.at.localeCompare(a.at));
  const address = (id: string) => assets.find((a) => a.id === id)?.address ?? id;

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Blueprint sync</h1>
          <p className="oq-subtitle">Plan costs and build budgets from Blueprint, and which budgets underwriting has promoted.</p>
        </div>
      </div>

      <div className="bp-status">
        <div className="bp-stat">
          <span className="bp-stat-label">Connection</span>
          <span className="bp-stat-value bp-connected"><span className="bp-dot" aria-hidden="true" />Connected</span>
        </div>
        <div className="bp-stat">
          <span className="bp-stat-label">Last sync</span>
          <span className="bp-stat-value">{relativeTime(LAST_SYNC)}</span>
        </div>
        <div className="bp-stat">
          <span className="bp-stat-label">Records synced</span>
          <span className="bp-stat-value"><ProvenanceValue info={BLUEPRINT}>{records.toLocaleString('en-US')}</ProvenanceValue></span>
          <span className="bp-stat-sub">{COST_BOOK.length} cost book rows · {owned.length} projects</span>
        </div>
        <div className="bp-stat">
          <span className="bp-stat-label">Errors</span>
          <span className={`bp-stat-value ${SYNC_ERRORS.length ? 'bp-bad' : ''}`}>{SYNC_ERRORS.length}</span>
        </div>
      </div>

      {SYNC_ERRORS.map((e) => (
        <p key={e.project} className="bp-error">
          <strong>{e.project}</strong> · {e.detail}: {e.reason}
        </p>
      ))}

      <ProvenanceLegend />

      {/* Plan cost book */}
      <section className="pf-card">
        <div className="pf-card-header">
          <h3 className="pf-card-title">Plan cost book</h3>
          <span className="pf-card-caption">
            Build $/sqft by spec level · {staleBook} {staleBook === 1 ? 'row' : 'rows'} older than {STALE_COST_BOOK_DAYS} days
          </span>
        </div>
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Plan</th>
                {SPEC_LEVELS.map((s) => <th key={s} className="pf-num">{s}</th>)}
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {COST_BOOK.map((r) => {
                const age = costBookAge(r);
                const stale = age > STALE_COST_BOOK_DAYS;
                return (
                  <tr key={`${r.market}-${r.plan}`} className={stale ? 'bp-row--stale' : ''}>
                    <td>{r.market}</td>
                    <td>{r.plan} <span className="bp-muted">{r.code}</span></td>
                    {SPEC_LEVELS.map((s) => (
                      <td key={s} className="pf-num"><ProvenanceValue info={BLUEPRINT}>${r.perSqft[s]}</ProvenanceValue></td>
                    ))}
                    <td>
                      <ProvenanceValue info={BLUEPRINT}>{shortDate(r.updatedOn, true)}</ProvenanceValue>
                      {stale && <span className="bp-chip bp-chip--stale">{age} days old</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Project budgets */}
      <section className="pf-card">
        <div className="pf-card-header">
          <h3 className="pf-card-title">Project budgets</h3>
          <span className="pf-card-caption">
            {count('in_sync')} of {rows.length} in sync ({inSyncPct}%) · {count('changed')} changed · {count('stale')} stale · {count('never')} never promoted ·
            stale means an active build last promoted over {STALE_PROMOTION_DAYS} days ago
          </span>
        </div>
        <div className="pf-table-wrap">
          <table className="pf-table bp-budgets">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="pf-num">UW budget</th>
                <th className="pf-num">Blueprint</th>
                <th className="pf-num">Difference</th>
                <th>Last promoted</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.asset.id;
                return (
                  <Fragment key={r.asset.id}>
                    <tr className={isOpen ? 'pf-row--open' : ''}>
                      <td>
                        <Link to={`/asset/${r.asset.id}`} className="bp-address">{r.asset.address}</Link>
                        <span className="pf-asset-address">
                          <AssetLink id={r.asset.id}>{r.asset.id}</AssetLink> · {r.asset.market} · {STAGE_LABELS[r.asset.stage]}
                        </span>
                      </td>
                      <td className="pf-num">
                        <span className="bp-version">{r.uwVersion}</span>{' '}
                        <ProvenanceValue info={human(r.lastPromoted ? `Promoted by ${r.lastPromoted.by}` : 'Underwrite budget')}>{usd(r.uwAmount)}</ProvenanceValue>
                      </td>
                      <td className="pf-num">
                        <span className="bp-version">{r.bpVersion}</span>{' '}
                        <ProvenanceValue info={BLUEPRINT}>{usd(r.bpAmount)}</ProvenanceValue>
                      </td>
                      <td className={`pf-num ${r.diff > 0 ? 'bp-bad' : r.diff < 0 ? 'bp-good' : 'bp-muted'}`}>
                        {r.diff ? <ProvenanceValue info={computed('Blueprint minus underwriting budget')}>{signedUsd(r.diff)}</ProvenanceValue> : '—'}
                      </td>
                      <td>
                        {r.lastPromoted ? (
                          <>
                            {shortDate(r.lastPromoted.at)}
                            <span className="pf-asset-address">{r.lastPromoted.by}</span>
                          </>
                        ) : <span className="bp-muted">Never</span>}
                      </td>
                      <td><span className={`bp-chip bp-chip--${r.status}`}>{BUDGET_STATUS_LABELS[r.status]}</span></td>
                      <td className="pf-num">
                        {canAct && r.status !== 'in_sync' && (
                          <button className="pf-btn pf-btn--small" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.asset.id)}>
                            {isOpen ? 'Close' : 'Review & promote'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="pf-row-detail">
                        <td colSpan={7}>
                          <PromotePreview
                            sync={r}
                            onCancel={() => setOpen(null)}
                            onPromote={() => {
                              promote(r, decider(role, analyst));
                              setOpen(null);
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Promotion log */}
      <section className="pf-card">
        <div className="pf-card-header">
          <h3 className="pf-card-title">Promotion log</h3>
          <span className="pf-card-caption">Newest first</span>
        </div>
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Asset</th>
                <th>Version</th>
                <th className="pf-num">Change</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {(showAllLog ? log : log.slice(0, LOG_PREVIEW)).map((p) => {
                const live = promotions[p.assetId] === p;
                return (
                  <tr key={`${p.assetId}-${p.at}`} className={live ? 'bp-row--live' : ''}>
                    <td>{shortDate(p.at, true)}{live && <span className="bp-chip bp-chip--in_sync">This session</span>}</td>
                    <td>
                      <AssetLink id={p.assetId}>{address(p.assetId)}</AssetLink>{' '}
                      <span className="bp-muted">{p.assetId}</span>
                    </td>
                    <td><span className="bp-version">{p.fromVersion}</span> → <span className="bp-version">{p.toVersion}</span></td>
                    <td className={`pf-num ${p.change > 0 ? 'bp-bad' : p.change < 0 ? 'bp-good' : ''}`}>{signedUsd(p.change)}</td>
                    <td>{p.by}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {log.length > LOG_PREVIEW && (
          <button className="link-button bp-more" onClick={() => setShowAllLog((v) => !v)}>
            {showAllLog ? 'Show fewer' : `Show all ${log.length}`}
          </button>
        )}
      </section>
    </div>
  );
}

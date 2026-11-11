import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { ASSETS } from '../data/assets';
import { AI, MLS, markProvenance } from '../data/provenance';
import { APPROVAL_THRESHOLD } from '../data/markProposals';
import {
  MARKS_MANAGER,
  isResolved,
  marketProgress,
  statusAfterReview,
  useMarkReviews,
  withMarkReviews,
} from '../data/markReview';
import type { ReviewedMarkProposal } from '../data/markReview';
import type { Asset, AssetStage, MarkDriverKind, MarkProposalStatus, ProvenanceInfo } from '../types';

const STAGE_LABELS: Partial<Record<AssetStage, string>> = {
  precon: 'Pre-Con',
  construction: 'Construction',
  for_sale: 'For Sale',
};

const STATUS_LABELS: Record<MarkProposalStatus, string> = {
  ai_proposed: 'AI proposed',
  analyst_reviewed: 'Reviewed',
  needs_approval: 'Needs approval',
  approved: 'Approved',
};

const DRIVER_LABELS: Record<MarkDriverKind, string> = {
  newComps: 'Comps',
  homeboundSales: 'HB sales',
  seasonality: 'Season',
  listingDemand: 'Listing',
};

const DRIVER_TITLES: Record<MarkDriverKind, string> = {
  newComps: 'New comps',
  homeboundSales: 'Homebound sales',
  seasonality: 'Seasonality',
  listingDemand: 'Listing demand',
};

const DRIVER_ORDER: MarkDriverKind[] = ['newComps', 'homeboundSales', 'seasonality', 'listingDemand'];

function usd(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function signedUsd(n: number) {
  if (n === 0) return '$0';
  return `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function compactSigned(n: number) {
  if (n === 0) return '0';
  const k = Math.abs(n) / 1000;
  return `${n < 0 ? '−' : '+'}${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}K`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function monthName(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function proposalProvenance(p: ReviewedMarkProposal): ProvenanceInfo {
  if (p.status === 'approved') {
    const note = p.approvalNote ? `: ${p.approvalNote}` : '';
    return { provenance: 'human', note: `Approved by ${p.approvedBy ?? MARKS_MANAGER}${note}` };
  }
  if (p.override) {
    return { provenance: 'human', note: `Overridden by ${p.override.by}: ${p.override.reason} (AI ${usd(p.override.aiValue)})` };
  }
  if (p.status === 'analyst_reviewed') return { provenance: 'human', note: `Reviewed by ${p.reviewedBy ?? p.analyst}` };
  return AI;
}

function StatusPill({ p }: { p: ReviewedMarkProposal }) {
  return (
    <span className={`pf-status pf-status--${p.status}`}>
      {STATUS_LABELS[p.status]}
      {p.override && p.status !== 'approved' && ' · overridden'}
    </span>
  );
}

function OverrideForm({
  p,
  onSave,
  onCancel,
}: {
  p: ReviewedMarkProposal;
  onSave: (value: number, reason: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(String(p.proposedValue));
  const [reason, setReason] = useState('');
  const parsed = Number(value.replace(/[$,\s]/g, ''));
  const valid = Number.isFinite(parsed) && parsed > 0 && reason.trim() !== '';
  const change = valid ? parsed - p.priorValue : 0;
  const nextStatus = statusAfterReview(change);

  return (
    <form
      className="pf-override"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(parsed, reason.trim());
      }}
    >
      <label className="pf-field">
        <span>April mark ($)</span>
        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <label className="pf-field pf-field--grow">
        <span>Reason (required)</span>
        <input
          value={reason}
          maxLength={140}
          placeholder="e.g. Excluded a distressed sale from the comps"
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
      </label>
      <div className="pf-override-foot">
        <span className="pf-hint">
          {valid
            ? `${signedUsd(change)} vs. March${nextStatus === 'needs_approval' ? ', over $10K, so it goes to approval' : ''}`
            : <>AI proposed <ProvenanceValue info={AI}>{usd(p.aiValue)}</ProvenanceValue></>}
        </span>
        <button type="button" className="pf-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="pf-btn pf-btn--primary" disabled={!valid}>Save override</button>
      </div>
    </form>
  );
}

function DriverDetail({ asset, p }: { asset: Asset; p: ReviewedMarkProposal }) {
  return (
    <div className="pf-detail">
      <ul className="pf-drivers">
        {p.drivers.map((d) => (
          <li key={d.kind} className="pf-driver">
            <span className="pf-driver-name">{DRIVER_TITLES[d.kind]}</span>
            <span className="pf-driver-amount">
              <ProvenanceValue info={AI}>{signedUsd(d.amount)}</ProvenanceValue>
            </span>
            <div className="pf-driver-body">
              <p className="pf-driver-text">{d.explanation}</p>
              {d.comps && (
                <ul className="pf-comps">
                  {d.comps.map((c) => (
                    <li key={c.address}>
                      {c.address} · <ProvenanceValue info={MLS}>{usd(c.salePrice)}</ProvenanceValue> ·{' '}
                      <ProvenanceValue info={MLS}>${Math.round(c.salePrice / c.sqft)}/sqft</ProvenanceValue> · sold{' '}
                      {shortDate(c.soldOn)} · <ProvenanceValue info={MLS}>{c.distanceMi.toFixed(1)} mi</ProvenanceValue>
                    </li>
                  ))}
                </ul>
              )}
              {d.assetIds && (
                <p className="pf-hb-links">
                  {d.assetIds.map((id) => (
                    <Link key={id} to={`/asset/${id}`} className="pf-link">View {id} →</Link>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {p.override && (
        <p className="pf-detail-note">
          {p.override.by} overrode the AI’s <ProvenanceValue info={AI}>{usd(p.override.aiValue)}</ProvenanceValue>: {p.override.reason}
        </p>
      )}
      {p.status === 'approved' && (p.approvalNote || p.approvedBy) && (
        <p className="pf-detail-note">
          Approved by {p.approvedBy ?? MARKS_MANAGER}{p.approvalNote ? `: ${p.approvalNote}` : ''}
        </p>
      )}
      <p className="pf-detail-note">
        <Link to={`/asset/${asset.id}`} className="pf-link">Open {asset.id}’s mark history →</Link>
      </p>
    </div>
  );
}

function ApprovalItem({ asset, p, onApprove, disabled }: {
  asset: Asset;
  p: ReviewedMarkProposal;
  onApprove: (note: string) => void;
  disabled: boolean;
}) {
  const [note, setNote] = useState('');
  return (
    <li className="pf-approval">
      <div className="pf-approval-main">
        <Link to={`/asset/${asset.id}`} className="pf-asset-id">{asset.id}</Link>
        <span className="pf-approval-address">{asset.address} · {asset.market}</span>
        <span className={`pf-change ${p.change < 0 ? 'pf-change--down' : 'pf-change--up'}`}>
          <ProvenanceValue info={proposalProvenance(p)}>{signedUsd(p.change)}</ProvenanceValue>
        </span>
        <span className="pf-approval-meta">
          {p.override ? `${p.override.by} overrode: ${p.override.reason}` : p.reviewedBy ? `Reviewed by ${p.reviewedBy}` : `AI proposed · ${p.analyst} assigned`}
        </span>
      </div>
      <form
        className="pf-approval-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) onApprove(note.trim());
        }}
      >
        <input
          className="pf-approval-input"
          value={note}
          maxLength={140}
          placeholder="Approval note (required)"
          onChange={(e) => setNote(e.target.value)}
          disabled={disabled}
        />
        <button type="submit" className="pf-btn pf-btn--primary" disabled={disabled || !note.trim()}>
          Approve
        </button>
      </form>
    </li>
  );
}

export default function MonthEndMarksTab() {
  const { reviews, published, accept, override, approve, publish } = useMarkReviews();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [overriding, setOverriding] = useState<string | null>(null);

  const assets = withMarkReviews(ASSETS, reviews, published).filter((a) => a.markProposal);
  const proposal = (a: Asset) => a.markProposal as ReviewedMarkProposal;
  const month = proposal(assets[0]).month;

  const reviewed = assets.filter((a) => isResolved(proposal(a))).length;
  const progress = marketProgress(assets.map((a) => ({ market: a.market, proposal: proposal(a) })));
  const bulkable = assets.filter((a) => proposal(a).status === 'ai_proposed' && Math.abs(proposal(a).change) <= APPROVAL_THRESHOLD);
  const awaiting = assets.filter((a) => proposal(a).status === 'needs_approval');
  const canPublish = !published && reviewed === assets.length;
  const locked = published !== undefined;

  return (
    <div className="pf-marks">
      {/* Header */}
      <div className="pf-marks-header">
        <div>
          <h2 className="pf-heading">{monthName(month)} month-end</h2>
          <p className="pf-sub">
            {reviewed} of {assets.length} reviewed
            {published && ` · published by ${published.by} on ${new Date(published.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
          </p>
          <div className="pf-progress" aria-hidden="true">
            <span style={{ width: `${(reviewed / assets.length) * 100}%` }} />
          </div>
        </div>
        <div className="pf-header-actions">
          <button
            className="pf-btn"
            disabled={locked || bulkable.length === 0}
            onClick={() => accept(bulkable)}
            title="Accept every AI-proposed change of $10K or less"
          >
            Accept all under $10K ({bulkable.length})
          </button>
          <button className="pf-btn pf-btn--publish" disabled={!canPublish} onClick={publish}>
            {published ? 'Published' : 'Publish April marks'}
          </button>
        </div>
      </div>

      <ul className="pf-markets">
        {progress.map((m) => (
          <li key={m.market} className={`pf-market ${m.reviewed === m.total ? 'pf-market--done' : ''}`}>
            <span className="pf-market-name">{m.market}</span>
            <span className="pf-market-count">{m.reviewed}/{m.total}</span>
            <span className="pf-market-analyst">{m.analyst}</span>
          </li>
        ))}
      </ul>

      {/* Needs your approval */}
      {awaiting.length > 0 && (
        <section className="pf-card pf-card--approval">
          <div className="pf-card-header">
            <h3 className="pf-card-title">Needs your approval</h3>
            <span className="pf-card-caption">Changes over ${APPROVAL_THRESHOLD / 1000}K · approver {MARKS_MANAGER}</span>
          </div>
          <ul className="pf-approvals">
            {awaiting.map((a) => (
              <ApprovalItem key={a.id} asset={a} p={proposal(a)} disabled={locked} onApprove={(note) => approve(a, note)} />
            ))}
          </ul>
        </section>
      )}

      <ProvenanceLegend />

      {/* Proposals */}
      <div className="pf-table-wrap">
        <table className="pf-table">
          <thead>
            <tr>
              <th aria-label="Expand" />
              <th>Asset</th>
              <th>Stage</th>
              <th className="pf-num">March mark</th>
              <th className="pf-num">Proposed April</th>
              <th className="pf-num">Change</th>
              <th>Drivers</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const p = proposal(a);
              const open = expanded === a.id;
              const prior = a.marks?.find((m) => m.month === p.priorMonth);
              const big = Math.abs(p.change) > APPROVAL_THRESHOLD;
              return (
                <Fragment key={a.id}>
                  <tr className={`pf-row ${open ? 'pf-row--open' : ''} ${big ? 'pf-row--big' : ''}`}>
                    <td>
                      <button
                        className="pf-caret"
                        aria-expanded={open}
                        aria-label={`${open ? 'Hide' : 'Show'} drivers for ${a.id}`}
                        onClick={() => setExpanded(open ? null : a.id)}
                      >
                        {open ? '▾' : '▸'}
                      </button>
                    </td>
                    <td>
                      <Link to={`/asset/${a.id}`} className="pf-asset-id">{a.id}</Link>
                      <span className="pf-asset-address">{a.address} · {a.market}</span>
                    </td>
                    <td>{STAGE_LABELS[a.stage]}</td>
                    <td className="pf-num"><ProvenanceValue info={markProvenance(prior)}>{usd(p.priorValue)}</ProvenanceValue></td>
                    <td className="pf-num"><ProvenanceValue info={proposalProvenance(p)}>{usd(p.proposedValue)}</ProvenanceValue></td>
                    <td className={`pf-num pf-change ${p.change < 0 ? 'pf-change--down' : 'pf-change--up'}`}>
                      <ProvenanceValue info={proposalProvenance(p)}>{signedUsd(p.change)}</ProvenanceValue>
                    </td>
                    <td>
                      <span className="pf-driver-mini">
                        {DRIVER_ORDER.map((kind) => {
                          const d = p.drivers.find((x) => x.kind === kind);
                          return (
                            <span key={kind} className={`pf-mini ${d ? '' : 'pf-mini--none'}`} title={DRIVER_TITLES[kind]}>
                              <span className="pf-mini-label">{DRIVER_LABELS[kind]}</span>
                              {d ? <ProvenanceValue info={AI}>{compactSigned(d.amount)}</ProvenanceValue> : '—'}
                            </span>
                          );
                        })}
                      </span>
                    </td>
                    <td><StatusPill p={p} /></td>
                    <td className="pf-actions">
                      {!locked && p.status === 'ai_proposed' && (
                        <button className="pf-btn pf-btn--small pf-btn--primary" onClick={() => accept([a])}>Accept</button>
                      )}
                      {!locked && p.status !== 'approved' && (
                        <button
                          className="pf-btn pf-btn--small"
                          onClick={() => {
                            setOverriding(a.id);
                            setExpanded(a.id);
                          }}
                        >
                          Override
                        </button>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="pf-row-detail">
                      <td />
                      <td colSpan={8}>
                        {overriding === a.id && !locked && (
                          <OverrideForm
                            p={p}
                            onCancel={() => setOverriding(null)}
                            onSave={(value, reason) => {
                              override(a, value, reason);
                              setOverriding(null);
                            }}
                          />
                        )}
                        <DriverDetail asset={a} p={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {!published && !canPublish && (
        <p className="pf-foot">
          Publishing unlocks once all {assets.length} proposals are reviewed or approved
          {awaiting.length > 0 && ` (${awaiting.length} waiting on approval)`}.
        </p>
      )}
    </div>
  );
}

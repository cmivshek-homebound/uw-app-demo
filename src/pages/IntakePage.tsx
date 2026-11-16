import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AssetLink from '../components/AssetLink';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { ASSETS } from '../data/assets';
import { daysSince, demoNow } from '../data/dates';
import { decider, useIntake, withIntakeDecisions } from '../data/intake';
import type { IntakeDecision } from '../data/intake';
import { ANALYST_BY_MARKET } from '../data/markProposals';
import { AI, SFDC, computed, human } from '../data/provenance';
import { useCanAct, useRole } from '../data/role';
import { disqualifiedLeads } from '../data/selectors';
import { DQ_REASONS } from '../types';
import type { Asset, DqReason, IntakeRecommendation, PreScreenResult } from '../types';
// Reuses the queue page shell and the Portfolio buttons/inputs (pf-btn, pf-approval-input).
import './OpportunityQueue.css';
import './PortfolioPage.css';
import './IntakePage.css';

/** The Disqualified log counts reasons over this trailing window. */
const DQ_WINDOW_DAYS = 90;

const RESULT_LABELS: Record<PreScreenResult, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' };

const RECOMMENDATION_LABELS: Record<IntakeRecommendation, string> = {
  send: 'Send to underwriting',
  disqualify: 'Disqualify',
  hold: 'Hold',
};

const RECEIVED = computed('Days since the SDR logged the lead');

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Green and red leads the AI can decide in bulk; yellow always needs a person. */
function acceptable(asset: Asset): boolean {
  const r = asset.intake?.preScreen?.result;
  return r === 'green' || r === 'red';
}

/** The decision that accepting the AI's recommendation records. */
function aiDecision(asset: Asset, by: string, at: string): IntakeDecision | undefined {
  const p = asset.intake?.preScreen;
  if (!p) return undefined;
  if (p.recommendation === 'send') return { kind: 'sent', at, by };
  if (p.recommendation === 'disqualify') {
    return { kind: 'disqualified', at, by, reason: p.dqReason ?? 'Other', note: p.reason };
  }
  return undefined;
}

// ── Inline forms ───────────────────────────────────────────────
function DisqualifyForm({
  initialReason,
  onCancel,
  onSave,
}: {
  initialReason?: DqReason;
  onCancel: () => void;
  onSave: (reason: DqReason, note?: string) => void;
}) {
  const [reason, setReason] = useState<DqReason | ''>(initialReason ?? '');
  const [note, setNote] = useState('');
  const noteRequired = reason === 'Other';
  const valid = reason !== '' && (!noteRequired || note.trim() !== '');
  return (
    <form
      className="in-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(reason as DqReason, note.trim() || undefined);
      }}
    >
      <select
        className="pf-approval-input in-select"
        value={reason}
        aria-label="Disqualify reason"
        onChange={(e) => setReason(e.target.value as DqReason)}
        autoFocus
      >
        <option value="" disabled>Reason (required)</option>
        {DQ_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <input
        className="pf-approval-input"
        value={note}
        maxLength={140}
        placeholder={noteRequired ? 'What’s the reason? (required)' : 'Note (optional)'}
        aria-label="Disqualify note"
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="button" className="pf-btn pf-btn--small" onClick={onCancel}>Cancel</button>
      <button type="submit" className="pf-btn pf-btn--small pf-btn--primary" disabled={!valid}>Disqualify</button>
    </form>
  );
}

function HoldForm({ onCancel, onSave }: { onCancel: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <form
      className="in-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim()) onSave(note.trim());
      }}
    >
      <input
        className="pf-approval-input"
        value={note}
        maxLength={140}
        placeholder="What are we waiting on? e.g. Need survey from SDR (required)"
        aria-label="Hold note"
        onChange={(e) => setNote(e.target.value)}
        autoFocus
      />
      <button type="button" className="pf-btn pf-btn--small" onClick={onCancel}>Cancel</button>
      <button type="submit" className="pf-btn pf-btn--small pf-btn--primary" disabled={!note.trim()}>Hold</button>
    </form>
  );
}

// ── Lead row ───────────────────────────────────────────────────
function LeadRow({ asset, decision }: { asset: Asset; decision?: IntakeDecision }) {
  const { decide } = useIntake();
  const { role, analyst } = useRole();
  const canAct = useCanAct();
  const [form, setForm] = useState<'dq' | 'hold' | null>(null);
  const intake = asset.intake!;
  const p = intake.preScreen;
  const days = daysSince(intake.dateReceived);
  const by = decider(role, analyst);

  const record = (d: IntakeDecision) => {
    decide({ [asset.id]: d });
    setForm(null);
  };
  const final = decision?.kind === 'sent' || decision?.kind === 'disqualified';
  // Green and red: the AI's call is the primary button. Yellow: none, a person decides.
  const primary = p && p.result !== 'yellow' ? p.recommendation : undefined;

  return (
    <li className={`in-row ${final ? 'in-row--done' : ''}`}>
      <div className="in-row-main">
        <div className="in-cell in-cell--lead">
          <AssetLink id={asset.id} className="in-address">{asset.address}</AssetLink>
          <span className="in-sub">
            {asset.id} · {asset.city}{asset.city !== asset.market && ` · ${asset.market}`}
          </span>
        </div>
        <div className="in-cell">
          <span className="in-label">Lot</span>
          <ProvenanceValue info={SFDC}>{asset.lotSqFt.toLocaleString()} sqft</ProvenanceValue>
        </div>
        <div className="in-cell">
          <span className="in-label">Source</span>
          <ProvenanceValue info={SFDC}>{intake.source}</ProvenanceValue>
        </div>
        <div className="in-cell">
          <span className="in-label">SDR</span>
          <ProvenanceValue info={SFDC}>{intake.sdrOwner}</ProvenanceValue>
        </div>
        <div className="in-cell">
          <span className="in-label">Received</span>
          <span>
            <ProvenanceValue info={SFDC}>{shortDate(intake.dateReceived)}</ProvenanceValue>
            <span className="in-muted"> · <ProvenanceValue info={RECEIVED}>{days === 0 ? 'today' : `${days}d ago`}</ProvenanceValue></span>
          </span>
        </div>
        <div className="in-cell in-cell--screen">
          <span className="in-label">AI pre-screen</span>
          {p ? (
            <span className="in-screen">
              <span className={`in-chip in-chip--${p.result}`}>
                <ProvenanceValue info={AI}>{RESULT_LABELS[p.result]}</ProvenanceValue>
              </span>
              <span className="in-reason"><ProvenanceValue info={AI}>{p.reason}</ProvenanceValue></span>
            </span>
          ) : <span className="in-muted">Not screened</span>}
        </div>
      </div>

      <div className="in-row-foot">
        <span className="in-rec">
          <span className="in-label">AI recommends</span>
          {p ? (
            <ProvenanceValue info={AI}>
              {RECOMMENDATION_LABELS[p.recommendation]}{p.dqReason ? ` · ${p.dqReason}` : ''}
            </ProvenanceValue>
          ) : '—'}
          {p?.result === 'yellow' && <span className="in-needs-person">Yellow: needs a person</span>}
        </span>

        <div className="in-action">
          {decision?.kind === 'sent' ? (
            <span className="in-done">
              Sent to underwriting by {decision.by} · AI drafting, assigned to {ANALYST_BY_MARKET[asset.market]}{' '}
              <Link to="/underwrite" className="in-link">Underwrite board →</Link>
            </span>
          ) : decision?.kind === 'disqualified' ? (
            <span className="in-done in-done--dq">
              Disqualified by {decision.by}: {decision.reason}{decision.note ? ` · ${decision.note}` : ''}
            </span>
          ) : (
            <>
              {asset.hold && (
                <span className="in-held">
                  On hold: <ProvenanceValue info={human(`Held by ${asset.hold.by}`)}>{asset.hold.note}</ProvenanceValue>
                </span>
              )}
              {canAct && !form && (
                <>
                  <button
                    className={`pf-btn pf-btn--small ${primary === 'send' ? 'pf-btn--primary' : ''}`}
                    onClick={() => record({ kind: 'sent', at: demoNow(), by })}
                  >
                    Send to underwriting
                  </button>
                  <button
                    className={`pf-btn pf-btn--small ${primary === 'disqualify' ? 'pf-btn--primary' : ''}`}
                    onClick={() => setForm('dq')}
                  >
                    Disqualify
                  </button>
                  {!asset.hold && (
                    <button className="pf-btn pf-btn--small" onClick={() => setForm('hold')}>Hold</button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {form === 'dq' && (
        <DisqualifyForm
          initialReason={p?.dqReason}
          onCancel={() => setForm(null)}
          onSave={(reason, note) => record({ kind: 'disqualified', at: demoNow(), by, reason, note })}
        />
      )}
      {form === 'hold' && (
        <HoldForm onCancel={() => setForm(null)} onSave={(note) => record({ kind: 'held', at: demoNow(), by, note })} />
      )}
    </li>
  );
}

// ── Disqualified log ───────────────────────────────────────────
function DisqualifiedLog({ assets, initiallyOpen }: { assets: Asset[]; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const dqs = disqualifiedLeads(assets);
  const recent = dqs.filter((a) => daysSince(a.disqualified!.on) <= DQ_WINDOW_DAYS);
  const counts = DQ_REASONS
    .map((reason) => ({ reason, count: recent.filter((a) => a.disqualified!.reason === reason).length }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <details
      id="disqualified"
      className="in-log"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="in-log-summary">
        <span className="in-log-title">Disqualified</span>
        <span className="in-log-count">{dqs.length}</span>
        <span className="in-log-hint">{open ? 'Hide' : 'Show'} log</span>
      </summary>

      <div className="in-log-body">
        <div className="in-reasons">
          <span className="in-label">Last {DQ_WINDOW_DAYS} days by reason</span>
          <div className="in-reason-chips">
            {counts.length === 0 ? <span className="in-muted">None</span> : counts.map(({ reason, count }) => (
              <span key={reason} className="in-reason-chip">
                {reason} <ProvenanceValue info={computed(`Disqualifications in the last ${DQ_WINDOW_DAYS} days`)}>{count}</ProvenanceValue>
              </span>
            ))}
          </div>
        </div>

        <div className="oq-table-wrapper">
          <table className="oq-table in-log-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Lead</th>
                <th>Market</th>
                <th>Reason</th>
                <th>Decided by</th>
              </tr>
            </thead>
            <tbody>
              {dqs.map((a) => {
                const dq = a.disqualified!;
                const decided = human(`Disqualified by ${dq.by}`);
                return (
                  <tr key={a.id} className="in-log-row">
                    <td><ProvenanceValue info={decided}>{shortDate(dq.on)}</ProvenanceValue></td>
                    <td className="oq-address">
                      <AssetLink id={a.id}>{a.address}</AssetLink> <span className="in-muted">{a.id}</span>
                    </td>
                    <td>{a.market}</td>
                    <td className="in-log-reason">
                      <strong>{dq.reason}</strong>
                      {dq.note && <span className="in-muted"> · {dq.note}</span>}
                    </td>
                    <td>{dq.by}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {dqs.length === 0 && <div className="oq-empty">No disqualified leads.</div>}
        </div>
      </div>
    </details>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function IntakePage() {
  const { decisions, decide } = useIntake();
  const { role, analyst } = useRole();
  const canAct = useCanAct();
  const { hash } = useLocation();
  const assets = withIntakeDecisions(ASSETS, decisions);

  // Rows: every lead that arrived untouched, in its session state. Decided
  // leads stay in place (dimmed) so the list doesn't jump while you work.
  const leadIds = new Set(ASSETS.filter((a) => a.stage === 'opportunity' && !a.disqualified).map((a) => a.id));
  const rank = (a: Asset) => {
    const d = decisions[a.id];
    if (d?.kind === 'sent' || d?.kind === 'disqualified') return 2;
    return a.hold ? 1 : 0;
  };
  const leads = assets
    .filter((a) => leadIds.has(a.id))
    .sort((a, b) => rank(a) - rank(b) || a.intake!.dateReceived.localeCompare(b.intake!.dateReceived));

  const untriaged = leads.filter((a) => rank(a) === 0);
  const held = leads.filter((a) => rank(a) === 1).length;
  const bulk = leads.filter((a) => rank(a) < 2 && acceptable(a));
  const bulkSends = bulk.filter((a) => a.intake!.preScreen!.recommendation === 'send').length;
  const bulkDqs = bulk.length - bulkSends;

  const acceptAll = () => {
    const by = decider(role, analyst);
    const at = demoNow();
    decide(Object.fromEntries(bulk.flatMap((a) => {
      const d = aiDecision(a, by, at);
      return d ? [[a.id, d]] : [];
    })));
  };

  // Links like the Underwrite board's "disqualified" land on the log.
  useEffect(() => {
    if (hash === '#disqualified') document.getElementById('disqualified')?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Intake</h1>
          <p className="oq-subtitle">
            {plural(untriaged.length, 'untriaged lead')}{held > 0 && ` · ${held} on hold`} · the AI pre-screens every lead; yellow always needs a person.
          </p>
        </div>
        {canAct && (
          <div className="in-bulk">
            <button className="pf-btn pf-btn--primary" disabled={bulk.length === 0} onClick={acceptAll}>
              Accept AI recommendations{bulk.length > 0 && ` (${bulk.length})`}
            </button>
            <span className="in-bulk-hint">
              {bulk.length === 0
                ? 'No green or red leads left to accept'
                : `Sends ${plural(bulkSends, 'green lead')}, disqualifies ${plural(bulkDqs, 'red lead')}`}
            </span>
          </div>
        )}
      </div>

      <ProvenanceLegend />

      {leads.length === 0 ? (
        <p className="oq-empty">No intake leads.</p>
      ) : (
        <ul className="in-rows">
          {leads.map((a) => <LeadRow key={a.id} asset={a} decision={decisions[a.id]} />)}
        </ul>
      )}

      <DisqualifiedLog assets={assets} initiallyOpen={hash === '#disqualified'} />
    </div>
  );
}

import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import ProvenanceValue from '../components/ProvenanceValue';
import { ADU_ASSUMPTIONS } from '../data/aduAssumptions';
import { ASSUMPTIONS, ASSUMPTION_CHANGES, CATEGORIES, MARKET_ORDER } from '../data/assumptionRegistry';
import type { Usage } from '../data/assumptionRegistry';
import { getAIDraft } from '../data/aiDrafts';
import { human } from '../data/provenance';
import { useSessionAssets } from '../data/useSessionAssets';
import type { Asset } from '../types';
import './OpportunityQueue.css';
import './PortfolioPage.css';
import './AssumptionsPage.css';

function shortDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const USAGE_NOUN: Record<Usage, [string, string]> = {
  underwrites: ['active underwrite', 'active underwrites'],
  aduUnderwrites: ['active underwrite in ADU markets', 'active underwrites in ADU markets'],
  builds: ['active build', 'active builds'],
  marks: ['open mark', 'open marks'],
  listings: ['active listing', 'active listings'],
};

/** How many live records each kind of assumption feeds, from the session's assets. */
function usageCounts(assets: Asset[]): Record<Usage, number> {
  const live = assets.filter((a) => !a.disqualified);
  const underwrites = live.filter(
    (a) => (a.stage === 'underwriting' && (a.underwrite || getAIDraft(a.id))) || a.stage === 'under_contract',
  );
  return {
    underwrites: underwrites.length,
    aduUnderwrites: underwrites.filter((a) => ADU_ASSUMPTIONS[a.market].offered).length,
    builds: live.filter((a) => (a.stage === 'precon' || a.stage === 'construction') && a.owned).length,
    marks: live.filter((a) => a.markProposal).length,
    listings: live.filter((a) => a.stage === 'for_sale').length,
  };
}

export default function AssumptionsPage() {
  const usage = usageCounts(useSessionAssets());
  const changes = [...ASSUMPTION_CHANGES].sort((a, b) => b.on.localeCompare(a.on));
  const lastChange = new Map<string, string>();
  for (const c of changes) if (!lastChange.has(c.assumptionId)) lastChange.set(c.assumptionId, c.on);

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Assumptions</h1>
          <p className="oq-subtitle">
            The rates, targets and cycle times every underwrite, mark and schedule uses, read from the same files the app computes with.
          </p>
        </div>
      </div>

      <section className="pf-card">
        <div className="pf-card-header">
          <h3 className="pf-card-title">Current assumptions</h3>
          <span className="pf-card-caption">One value spans the markets when it doesn’t differ</span>
        </div>
        <div className="pf-table-wrap">
          <table className="pf-table asm-table">
            <thead>
              <tr>
                <th>Assumption</th>
                {MARKET_ORDER.map((m) => <th key={m} className="pf-num">{m}</th>)}
                <th>Effective</th>
                <th>Approved by</th>
                <th className="pf-num">Used in</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => (
                <Fragment key={cat}>
                  <tr className="asm-cat-row">
                    <td colSpan={MARKET_ORDER.length + 4}>{cat}</td>
                  </tr>
                  {ASSUMPTIONS.filter((a) => a.category === cat).map((a) => {
                    const info = human(`Approved by ${a.approvedBy} · effective ${shortDate(a.effective)}`);
                    const [one, many] = USAGE_NOUN[a.usedIn];
                    const n = usage[a.usedIn];
                    return (
                      <tr key={a.id} className={lastChange.has(a.id) ? 'asm-row--changed' : ''}>
                        <td>
                          <span className="asm-name">{a.name}</span>
                          <span className="pf-asset-address">{a.source}</span>
                        </td>
                        {typeof a.value === 'string' ? (
                          <td colSpan={MARKET_ORDER.length} className="asm-all">
                            <ProvenanceValue info={info}>{a.value}</ProvenanceValue>
                            <span className="asm-all-note">all markets</span>
                          </td>
                        ) : (
                          MARKET_ORDER.map((m) => {
                            const v = (a.value as Record<string, string>)[m];
                            return (
                              <td key={m} className="pf-num">
                                {v === '—' ? <span className="asm-muted">—</span> : <ProvenanceValue info={info}>{v}</ProvenanceValue>}
                              </td>
                            );
                          })
                        )}
                        <td>
                          {shortDate(a.effective)}
                          {lastChange.has(a.id) && <a href="#change-log" className="asm-changed">changed</a>}
                        </td>
                        <td>{a.approvedBy}</td>
                        <td className="pf-num asm-used" title={`${n} ${n === 1 ? one : many}`}>
                          {n} <span className="asm-muted">{(n === 1 ? one : many).replace('active ', '').replace('open ', '')}</span>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pf-card" id="change-log">
        <div className="pf-card-header">
          <h3 className="pf-card-title">Change log</h3>
          <span className="pf-card-caption">Newest first</span>
        </div>
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Assumption</th>
                <th>Change</th>
                <th>Reason</th>
                <th>Requested by</th>
                <th>Approved by</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={`${c.assumptionId}-${c.on}`}>
                  <td className="asm-nowrap">{shortDate(c.on)}</td>
                  <td>{c.label}</td>
                  <td className="asm-nowrap">
                    <span className="asm-old">{c.from}</span> → <strong>{c.to}</strong>
                  </td>
                  <td className="asm-reason">
                    {c.reason}
                    {c.link && <> <Link to={c.link.to} className="asm-link">{c.link.label} →</Link></>}
                  </td>
                  <td className="asm-nowrap">{c.requestedBy}</td>
                  <td className="asm-nowrap">{c.approvedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

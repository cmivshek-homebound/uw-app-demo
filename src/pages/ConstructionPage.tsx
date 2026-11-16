import { Link } from 'react-router-dom';
import AssetLink from '../components/AssetLink';
import { StatusChip } from '../components/ConstructionDetail';
import { BLUEPRINT, MILESTONE_LABELS, shortDate } from '../components/constructionFormat';
import ProvenanceValue from '../components/ProvenanceValue';
import { useSessionAssets } from '../data/useSessionAssets';
import { LAST_SYNC, budgetSync, useBlueprint } from '../data/blueprint';
import { relativeTime } from '../data/dates';
import { assetsByStage, constructionStatus, nextMilestone } from '../data/selectors';
import ConstructionTab from './ConstructionTab';
import './OpportunityQueue.css';
import './PortfolioPage.css';

/** Closed lots not yet started: where each one is headed next. */
function PreconSection() {
  const precon = assetsByStage(useSessionAssets()).precon
    .filter((a) => a.owned)
    .sort((a, b) => a.owned!.schedule.plannedStart.localeCompare(b.owned!.schedule.plannedStart));

  return (
    <section className="pf-card cx-precon">
      <div className="pf-card-header">
        <h3 className="pf-card-title">Pre-construction</h3>
        <span className="pf-card-caption">Closed, not yet started · soonest start first</span>
      </div>
      <div className="pf-table-wrap">
        <table className="pf-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Stage</th>
              <th>Closed</th>
              <th>Planned start</th>
              <th>Next milestone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {precon.map((asset) => {
              const owned = asset.owned!;
              const next = nextMilestone(asset);
              const status = constructionStatus(asset);
              return (
                <tr key={asset.id}>
                  <td>
                    <Link to={`/asset/${asset.id}`} className="cx-address">{asset.address}</Link>
                    <span className="pf-asset-address">
                      <AssetLink id={asset.id}>{asset.id}</AssetLink> · {asset.market} · {asset.underwrite?.planName}
                    </span>
                  </td>
                  <td>Pre-Con</td>
                  <td><ProvenanceValue info={BLUEPRINT}>{shortDate(owned.closedOn)}</ProvenanceValue></td>
                  <td><ProvenanceValue info={BLUEPRINT}>{shortDate(owned.schedule.plannedStart)}</ProvenanceValue></td>
                  <td>
                    {next ? (
                      <>
                        {MILESTONE_LABELS[next.kind]}
                        <span className="cx-sub">
                          <ProvenanceValue info={BLUEPRINT}>
                            {next.forecast === next.planned
                              ? shortDate(next.planned)
                              : `${shortDate(next.forecast)} · plan ${shortDate(next.planned)}`}
                          </ProvenanceValue>
                        </span>
                      </>
                    ) : '—'}
                  </td>
                  <td>{status && <StatusChip status={status} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {precon.length === 0 && <div className="oq-empty">No lots in pre-construction.</div>}
      </div>
    </section>
  );
}

/** Blueprint data health: when it last synced and how many budgets moved since they were promoted. */
function BlueprintHealth() {
  const assets = useSessionAssets();
  const { promotions } = useBlueprint();
  const changed = assets
    .filter((a) => a.owned && a.stage !== 'sold')
    .filter((a) => budgetSync(a, promotions).status === 'changed').length;
  return (
    <Link to="/data/blueprint" className="cx-bp-health">
      <span className="cx-bp-dot" aria-hidden="true" />
      Blueprint synced {relativeTime(LAST_SYNC)}
      {' · '}
      <span className={changed ? 'cx-bp-changed' : ''}>
        {changed === 0 ? 'all budgets in sync' : `${changed} ${changed === 1 ? 'budget' : 'budgets'} changed`}
      </span>
    </Link>
  );
}

export default function ConstructionPage() {
  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Construction</h1>
          <p className="oq-subtitle">Lots waiting to start, then every build in progress, riskiest first.</p>
        </div>
        <BlueprintHealth />
      </div>
      <PreconSection />
      <ConstructionTab />
    </div>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AssetLink from '../components/AssetLink';
import { StatusChip } from '../components/ConstructionDetail';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { ASSETS } from '../data/assets';
import { daysSince } from '../data/dates';
import { DIAGNOSIS_LABELS, listingHealth } from '../data/listingHealth';
import { useListingActions, withListingActions } from '../data/listingActions';
import { useMarkReviews, withMarkReviews } from '../data/markReview';
import { AI, BLUEPRINT, MLS, computed } from '../data/provenance';
import { useDraftReviews, withReviewStatus } from '../data/review';
import {
  APPROVAL_THRESHOLD,
  assetsNeedingApproval,
  constructionByRisk,
  constructionMarginImpact,
  constructionStatus,
  constructionSummary,
  underwritingBoard,
} from '../data/selectors';
import { getAIDraft } from '../data/aiDrafts';
import type { Asset } from '../types';
import './ApprovalsPage.css';

// ── Manager view: needs your approval ──────────────────────────
// Four queues that need a manager's decision, built from the same data and
// session state as the pages they link to.

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const signedUsd = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

function Section({ title, count, caption, link, children }: {
  title: string;
  count: number;
  caption: string;
  link: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="ap-section">
      <div className="ap-head">
        <div>
          <h2 className="ap-title">
            {title} <span className={`ap-count ${count ? 'ap-count--open' : ''}`}>{count}</span>
          </h2>
          <p className="ap-caption">{caption}</p>
        </div>
        <Link to={link.to} className="ap-link">{link.label} →</Link>
      </div>
      {count === 0 ? <p className="ap-empty">Nothing waiting. <Link to={link.to} className="ap-link">{link.label}</Link></p> : <ul className="ap-list">{children}</ul>}
    </section>
  );
}

function Row({ asset, to, action, children }: { asset: Asset; to: string; action: string; children: ReactNode }) {
  return (
    <li className="ap-row">
      <div className="ap-asset">
        <AssetLink id={asset.id} className="ap-address">{asset.address}</AssetLink>
        <span className="ap-meta"><AssetLink id={asset.id}>{asset.id}</AssetLink> · {asset.market}</span>
      </div>
      <div className="ap-detail">{children}</div>
      <Link to={to} className="ap-go">{action} →</Link>
    </li>
  );
}

export default function ApprovalsPage() {
  const { reviews: markReviews, published } = useMarkReviews();
  const { reviews: draftReviews } = useDraftReviews();
  const { actions } = useListingActions();
  const assets = withListingActions(withReviewStatus(withMarkReviews(ASSETS, markReviews, published), draftReviews), actions);

  const marks = assetsNeedingApproval(assets);
  const drafts = underwritingBoard(assets).analyst_review;
  const builds = constructionByRisk(assets).filter((a) => constructionStatus(a) !== 'on_track');
  const listings = assets
    .filter((a) => a.stage === 'for_sale' && a.listing)
    .map((a) => ({ asset: a, health: listingHealth(a) }))
    .filter(({ asset, health }) => health.recommendation.kind !== 'hold' && !actions[asset.id]?.dismissal && !(actions[asset.id]?.drops.length));

  const total = marks.length + drafts.length + builds.length + listings.length;

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Needs your approval</h1>
          <p className="oq-subtitle">{total} decisions across marks, underwrites, construction and listings</p>
        </div>
      </div>

      <ProvenanceLegend />

      <Section
        title="Marks over the approval line"
        count={marks.length}
        caption={`April proposals that move more than ${usd(APPROVAL_THRESHOLD)} and aren't approved yet.`}
        link={{ to: '/marks', label: 'Month-end marks' }}
      >
        {marks.map((a) => {
          const p = a.markProposal!;
          return (
            <Row key={a.id} asset={a} to="/marks" action="Review mark">
              <span className={p.change < 0 ? 'ap-bad' : 'ap-good'}>
                <ProvenanceValue info={{ provenance: 'ai', note: 'Awaiting approval' }}>{signedUsd(p.change)}</ProvenanceValue>
              </span>{' '}
              to <ProvenanceValue info={AI}>{usd(p.proposedValue)}</ProvenanceValue>
              <span className="ap-sub">Proposed by {p.analyst}</span>
            </Row>
          );
        })}
      </Section>

      <Section
        title="Drafts awaiting sign-off"
        count={drafts.length}
        caption="Underwrites in analyst review, oldest first."
        link={{ to: '/underwrite', label: 'Underwrite board' }}
      >
        {[...drafts]
          .sort((a, b) => (a.underwritingSince ?? '').localeCompare(b.underwritingSince ?? ''))
          .map((a) => {
            const draft = getAIDraft(a.id);
            const days = a.underwritingSince ? daysSince(a.underwritingSince) : 0;
            return (
              <Row key={a.id} asset={a} to={`/underwrite/${a.id}/draft`} action="Open draft">
                {draft && (
                  <>
                    ESP <ProvenanceValue info={AI}>{usd(draft.recommendation.esp)}</ProvenanceValue> ·{' '}
                    <ProvenanceValue info={AI}>{draft.recommendation.marginPct.toFixed(1)}%</ProvenanceValue> margin
                  </>
                )}
                <span className="ap-sub">
                  {a.analyst} · <ProvenanceValue info={computed('Days in current board column')}>{days} {days === 1 ? 'day' : 'days'}</ProvenanceValue> in review
                </span>
              </Row>
            );
          })}
      </Section>

      <Section
        title="Construction at risk"
        count={builds.length}
        caption="Builds over budget or behind schedule, by margin impact."
        link={{ to: '/construction', label: 'Construction' }}
      >
        {builds.map((a) => {
          const s = constructionSummary(a)!;
          const impact = constructionMarginImpact(a);
          return (
            <Row key={a.id} asset={a} to={`/asset/${a.id}`} action="Open build">
              <StatusChip status={constructionStatus(a)!} />{' '}
              {s.variance !== 0 && <ProvenanceValue info={AI}>{signedUsd(s.variance)} ({s.variancePct > 0 ? '+' : ''}{s.variancePct.toFixed(1)}%)</ProvenanceValue>}
              {s.scheduleSlipDays > 0 && (
                <> · <ProvenanceValue info={BLUEPRINT}>{Math.round(s.scheduleSlipDays / 7)} wks late</ProvenanceValue></>
              )}
              {impact && (
                <span className="ap-sub">
                  Implied margin <ProvenanceValue info={AI}>{impact.marginPts > 0 ? '+' : impact.marginPts < 0 ? '−' : ''}{Math.abs(impact.marginPts).toFixed(1)} pts</ProvenanceValue>
                </span>
              )}
            </Row>
          );
        })}
      </Section>

      <Section
        title="Listings needing a price decision"
        count={listings.length}
        caption="Listings with a recommended price drop or counter that no one has acted on."
        link={{ to: '/for-sale', label: 'For sale' }}
      >
        {listings.map(({ asset, health }) => {
          const rec = health.recommendation;
          return (
            <Row key={asset.id} asset={asset} to="/for-sale" action="Decide">
              <span className="ap-diag">{DIAGNOSIS_LABELS[health.diagnosis]}</span>{' '}
              <ProvenanceValue info={MLS}>{asset.listing!.daysOnMarket} days</ProvenanceValue> on market ·{' '}
              list <ProvenanceValue info={MLS}>{usd(asset.listing!.listPrice)}</ProvenanceValue>
              <span className="ap-sub">
                {rec.kind === 'drop' && <>Recommended drop to <ProvenanceValue info={AI}>{usd(rec.newPrice)}</ProvenanceValue></>}
                {rec.kind === 'counter' && <>Recommended counter at <ProvenanceValue info={AI}>{usd(rec.price)}</ProvenanceValue></>}
              </span>
            </Row>
          );
        })}
      </Section>
    </div>
  );
}

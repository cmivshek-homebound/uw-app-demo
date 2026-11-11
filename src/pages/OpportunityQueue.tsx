import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import '../components/AssetLink.css';
import ProvenanceValue from '../components/ProvenanceValue';
import { mockOpportunities } from '../data/opportunities';
import { useDraftReviews, withReviewedQueueStatus } from '../data/review';
import { SFDC } from '../data/provenance';
import type { Opportunity } from '../types';
import './OpportunityQueue.css';

const STATUS_LABELS: Record<Opportunity['status'], string> = {
  pending_review: 'Pending Review',
  in_review: 'In Review',
  ready_for_offer: 'Ready for Offer',
  dqd: "DQ'd",
};

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'in_review', label: 'In Review' },
  { value: 'ready_for_offer', label: 'Ready for Offer' },
  { value: 'dqd', label: "DQ'd" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSqFt(n: number) {
  return n.toLocaleString('en-US') + ' sqft';
}

export default function OpportunityQueue() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // ?status= preselects a filter, e.g. the Underwrite board's DQ'd link.
  const initialFilter = FILTERS.some((f) => f.value === params.get('status')) ? params.get('status')! : 'all';
  const [filter, setFilter] = useState<string>(initialFilter);

  // Drafts submitted to Growth this session read Ready for Offer, as on the Underwrite board.
  const { reviews } = useDraftReviews();
  const opportunities = withReviewedQueueStatus(mockOpportunities, reviews);

  const filtered = filter === 'all'
    ? opportunities
    : opportunities.filter((o) => o.status === filter);

  const pendingCount = opportunities.filter(o => o.status === 'pending_review').length;

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Pipeline</h1>
          <p className="oq-subtitle">{opportunities.length} opportunities · {pendingCount} pending review</p>
        </div>
        <div className="oq-filters">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              className={`filter-btn ${filter === value ? 'active' : ''}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="oq-table-wrapper">
        <table className="oq-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Property Address</th>
              <th>Market</th>
              <th>Lot SqFt</th>
              <th>Source</th>
              <th>SDR Owner</th>
              <th>Date Received</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((opp) => (
              <tr key={opp.id} className="oq-row" onClick={() => navigate(`/underwrite/${opp.id}`)}>
                <td className="oq-id">
                  <Link
                    to={`/asset/${opp.id}`}
                    className="oq-id-link"
                    title="View asset record"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {opp.id}
                  </Link>
                </td>
                <td className="oq-address">
                  <Link to={`/underwrite/${opp.id}`} className="asset-link" onClick={(e) => e.stopPropagation()}>{opp.address}</Link>, {opp.city}, {opp.state} {opp.zip}
                </td>
                <td>{opp.market}</td>
                <td><ProvenanceValue info={SFDC}>{formatSqFt(opp.lotSqFt)}</ProvenanceValue></td>
                <td>
                  <span className={`source-tag source-${opp.source === 'MLS' ? 'mls' : 'off-market'}`}>
                    {opp.source}
                  </span>
                </td>
                <td>{opp.sdrOwner}</td>
                <td>{formatDate(opp.dateReceived)}</td>
                <td>
                  <span className={`status-badge status-${opp.status}`}>
                    {STATUS_LABELS[opp.status]}
                  </span>
                </td>
                <td>
                  <button
                    className="review-btn"
                    onClick={(e) => { e.stopPropagation(); navigate(`/underwrite/${opp.id}`); }}
                  >
                    Review →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="oq-empty">
            No opportunities match this filter.
            <button className="link-button" onClick={() => setFilter('all')}>Show all</button>
          </div>
        )}
      </div>
    </div>
  );
}

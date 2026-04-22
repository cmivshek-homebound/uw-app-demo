import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockOpportunities } from '../data/opportunities';
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
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all'
    ? mockOpportunities
    : mockOpportunities.filter((o) => o.status === filter);

  const pendingCount = mockOpportunities.filter(o => o.status === 'pending_review').length;

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">BOOL Opportunity Queue</h1>
          <p className="oq-subtitle">{mockOpportunities.length} opportunities · {pendingCount} pending review</p>
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
                <td className="oq-id">{opp.id}</td>
                <td className="oq-address">{opp.address}, {opp.city}, {opp.state} {opp.zip}</td>
                <td>{opp.market}</td>
                <td>{formatSqFt(opp.lotSqFt)}</td>
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
          <div className="oq-empty">No opportunities match this filter.</div>
        )}
      </div>
    </div>
  );
}

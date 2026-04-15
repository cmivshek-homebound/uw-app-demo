import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockOpportunities } from '../data/opportunities';
import type { Opportunity } from '../types';
import './OpportunityQueue.css';

const STATUS_LABELS: Record<Opportunity['status'], string> = {
  pending: 'Pending',
  in_review: 'In Review',
  approved: 'Approved',
  declined: 'Declined',
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OpportunityQueue() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all'
    ? mockOpportunities
    : mockOpportunities.filter((o) => o.status === filter);

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Opportunity Queue</h1>
          <p className="oq-subtitle">{mockOpportunities.length} submissions · {mockOpportunities.filter(o => o.status === 'pending').length} pending review</p>
        </div>
        <div className="oq-filters">
          {['all', 'pending', 'in_review', 'approved', 'declined'].map((s) => (
            <button
              key={s}
              className={`filter-btn ${filter === s ? 'active' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s as Opportunity['status']]}
            </button>
          ))}
        </div>
      </div>

      <div className="oq-table-wrapper">
        <table className="oq-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Applicant</th>
              <th>Property Address</th>
              <th>Submitted</th>
              <th>Coverage</th>
              <th>Premium</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((opp) => (
              <tr key={opp.id} className="oq-row" onClick={() => navigate(`/underwrite/${opp.id}`)}>
                <td className="oq-id">{opp.id}</td>
                <td className="oq-name">{opp.applicantName}</td>
                <td className="oq-address">{opp.address}, {opp.city}, {opp.state} {opp.zip}</td>
                <td>{formatDate(opp.submittedAt)}</td>
                <td>{formatCurrency(opp.coverageAmount)}</td>
                <td>{formatCurrency(opp.premium)}<span className="per-year">/yr</span></td>
                <td>
                  <span className={`status-badge status-${opp.status}`}>
                    {STATUS_LABELS[opp.status]}
                  </span>
                </td>
                <td>
                  <button className="review-btn" onClick={(e) => { e.stopPropagation(); navigate(`/underwrite/${opp.id}`); }}>
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

import { useParams, useNavigate } from 'react-router-dom';
import { mockOpportunities } from '../data/opportunities';
import type { Opportunity } from '../types';
import './UnderwritePage.css';

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
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function UnderwritePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const opp = id ? mockOpportunities.find((o) => o.id === id) : null;

  if (!opp && id) {
    return (
      <div className="uw-page">
        <div className="uw-not-found">
          <p>Opportunity <strong>{id}</strong> not found.</p>
          <button className="uw-back-btn" onClick={() => navigate('/')}>← Back to Queue</button>
        </div>
      </div>
    );
  }

  if (!opp) {
    return (
      <div className="uw-page">
        <div className="uw-empty-state">
          <div className="uw-empty-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M24 4L44 16V44H30V32H18V44H4V16L24 4Z" fill="#e4e7f0" />
            </svg>
          </div>
          <h2>No opportunity selected</h2>
          <p>Select a submission from the queue to begin underwriting.</p>
          <button className="uw-back-btn" onClick={() => navigate('/')}>← Go to Queue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="uw-page">
      <div className="uw-breadcrumb">
        <button className="uw-breadcrumb-link" onClick={() => navigate('/')}>Opportunity Queue</button>
        <span className="uw-breadcrumb-sep">›</span>
        <span className="uw-breadcrumb-current">{opp.id}</span>
      </div>

      <div className="uw-header">
        <div>
          <h1 className="uw-title">{opp.address}</h1>
          <p className="uw-subtitle">{opp.city}, {opp.state} {opp.zip}</p>
        </div>
        <span className={`uw-status-badge status-${opp.status}`}>
          {STATUS_LABELS[opp.status]}
        </span>
      </div>

      <div className="uw-grid">
        <section className="uw-card">
          <h2 className="uw-card-title">Applicant</h2>
          <div className="uw-field-group">
            <div className="uw-field">
              <span className="uw-label">Name</span>
              <span className="uw-value">{opp.applicantName}</span>
            </div>
            <div className="uw-field">
              <span className="uw-label">Submission ID</span>
              <span className="uw-value mono">{opp.id}</span>
            </div>
            <div className="uw-field">
              <span className="uw-label">Submitted</span>
              <span className="uw-value">{formatDate(opp.submittedAt)}</span>
            </div>
          </div>
        </section>

        <section className="uw-card">
          <h2 className="uw-card-title">Coverage Details</h2>
          <div className="uw-field-group">
            <div className="uw-field">
              <span className="uw-label">Coverage Amount</span>
              <span className="uw-value highlight">{formatCurrency(opp.coverageAmount)}</span>
            </div>
            <div className="uw-field">
              <span className="uw-label">Annual Premium</span>
              <span className="uw-value highlight">{formatCurrency(opp.premium)}</span>
            </div>
            <div className="uw-field">
              <span className="uw-label">Premium Rate</span>
              <span className="uw-value">{((opp.premium / opp.coverageAmount) * 100).toFixed(3)}%</span>
            </div>
          </div>
        </section>

        <section className="uw-card uw-card-full">
          <h2 className="uw-card-title">Risk Notes</h2>
          <textarea
            className="uw-notes"
            placeholder="Add underwriting notes, risk observations, or conditions here…"
            rows={5}
          />
        </section>

        <section className="uw-card uw-card-full uw-actions-card">
          <h2 className="uw-card-title">Decision</h2>
          <div className="uw-actions">
            <button className="uw-action-btn approve">Approve</button>
            <button className="uw-action-btn refer">Refer to Senior UW</button>
            <button className="uw-action-btn decline">Decline</button>
          </div>
        </section>
      </div>
    </div>
  );
}

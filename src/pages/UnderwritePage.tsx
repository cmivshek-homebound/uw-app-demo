import { useParams, useNavigate } from 'react-router-dom';
import { mockOpportunities, updateOpportunityStatus } from '../data/opportunities';
import TriageCard from '../components/TriageCard';
import './UnderwritePage.css';

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
          <p>Select a property from the queue to begin underwriting.</p>
          <button className="uw-back-btn" onClick={() => navigate('/')}>← Go to Queue</button>
        </div>
      </div>
    );
  }

  function handleDQ() {
    updateOpportunityStatus(opp!.id, 'dqd');
    navigate('/');
  }

  function handleProceed() {
    navigate(`/underwrite/${opp!.id}`);
  }

  function handleOverride() {
    navigate(`/underwrite/${opp!.id}`);
  }

  return (
    <div className="uw-page">
      <div className="uw-breadcrumb">
        <button className="uw-breadcrumb-link" onClick={() => navigate('/')}>Opportunity Queue</button>
        <span className="uw-breadcrumb-sep">›</span>
        <span className="uw-breadcrumb-current">{opp.id}</span>
      </div>

      <TriageCard
        opp={opp}
        onDQ={handleDQ}
        onProceed={handleProceed}
        onOverride={handleOverride}
      />
    </div>
  );
}

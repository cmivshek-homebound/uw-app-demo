import { useParams, useNavigate } from 'react-router-dom';
import { mockOpportunities, updateOpportunityStatus } from '../data/opportunities';
import TriageCard from '../components/TriageCard';
import './UnderwritePage.css';

export default function UnderwritePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const opp = mockOpportunities.find((o) => o.id === id);

  if (!opp) {
    return (
      <div className="uw-page">
        <div className="uw-not-found">
          <p>Opportunity <strong>{id}</strong> not found.</p>
          <button className="uw-back-btn" onClick={() => navigate('/queue')}>← Back to Queue</button>
        </div>
      </div>
    );
  }

  function handleDQ() {
    updateOpportunityStatus(opp!.id, 'dqd');
    navigate('/queue');
  }

  function handleProceed() {
    navigate(`/underwrite/${opp!.id}/scenario`);
  }

  function handleOverride() {
    navigate(`/underwrite/${opp!.id}/scenario`);
  }

  return (
    <div className="uw-page">
      <div className="uw-breadcrumb">
        <button className="uw-breadcrumb-link" onClick={() => navigate('/queue')}>Opportunity Queue</button>
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

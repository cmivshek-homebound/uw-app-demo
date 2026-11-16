import { useParams, useNavigate } from 'react-router-dom';
import { ASSETS } from '../data/assets';
import { demoNow } from '../data/dates';
import { decider, useIntake } from '../data/intake';
import { findOpportunity } from '../data/opportunities';
import { useRole } from '../data/role';
import TriageCard from '../components/TriageCard';
import './UnderwritePage.css';

export default function UnderwritePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { decide } = useIntake();
  const { role, analyst } = useRole();

  const opp = id ? findOpportunity(id) : undefined;

  if (!opp) {
    return (
      <div className="uw-page">
        <div className="uw-not-found">
          <p>Lot <strong>{id}</strong> not found.</p>
          <button className="uw-back-btn" onClick={() => navigate('/underwrite')}>← Back to Underwrite</button>
        </div>
      </div>
    );
  }

  // Disqualifying from triage lands in the same Disqualified log as intake.
  function handleDQ() {
    const flood = ASSETS.find((a) => a.id === opp!.id)?.floodZone;
    decide({
      [opp!.id]: {
        kind: 'disqualified',
        at: demoNow(),
        by: decider(role, analyst),
        reason: flood ? 'Flood risk' : 'Other',
        note: flood ? undefined : 'Failed pre-screen checks in triage',
      },
    });
    navigate('/intake#disqualified');
  }

  function handleProceed() {
    navigate(`/underwrite/${opp!.id}/scenario`);
  }

  return (
    <div className="uw-page">
      <div className="uw-breadcrumb">
        <button className="uw-breadcrumb-link" onClick={() => navigate('/underwrite')}>Underwrite</button>
        <span className="uw-breadcrumb-sep">›</span>
        <span className="uw-breadcrumb-current">{opp.id}</span>
      </div>

      <TriageCard
        opp={opp}
        onDQ={handleDQ}
        onProceed={handleProceed}
        onOverride={handleProceed}
      />
    </div>
  );
}

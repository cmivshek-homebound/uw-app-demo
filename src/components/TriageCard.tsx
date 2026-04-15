import type { Opportunity } from '../types';
import './TriageCard.css';

type CheckResult = 'pass' | 'fail' | 'flag';

interface PreScreenCheck {
  name: string;
  result: CheckResult;
  label: string;
}

interface TriageData {
  checks: PreScreenCheck[];
  overallResult: 'pass' | 'review_required' | 'fail';
}

const TRIAGE_DATA: Record<string, TriageData> = {
  'BOOL-001': {
    overallResult: 'review_required',
    checks: [
      { name: 'Dev Area',             result: 'pass', label: 'Pass' },
      { name: 'Zoning',               result: 'pass', label: 'Pass — SF-3 Residential' },
      { name: 'Lot Dimensions',       result: 'pass', label: 'Pass — 52ft × 120ft, fits 3 plans' },
      { name: 'Road Classification',  result: 'pass', label: 'Pass — Residential, 2 lanes' },
      { name: 'Commercial Proximity', result: 'flag', label: 'Flag — Gas station 190ft NE (58% confidence)' },
      { name: 'Flood Zone',           result: 'pass', label: 'Pass — Zone X' },
    ],
  },
  'BOOL-002': {
    overallResult: 'pass',
    checks: [
      { name: 'Dev Area',             result: 'pass', label: 'Pass' },
      { name: 'Zoning',               result: 'pass', label: 'Pass — SF-3 Residential' },
      { name: 'Lot Dimensions',       result: 'pass', label: 'Pass — 58ft × 122ft, fits 4 plans' },
      { name: 'Road Classification',  result: 'pass', label: 'Pass — Residential, 2 lanes' },
      { name: 'Commercial Proximity', result: 'pass', label: 'Pass — No disqualifying POI within 400ft' },
      { name: 'Flood Zone',           result: 'pass', label: 'Pass — Zone X' },
    ],
  },
  'BOOL-003': {
    overallResult: 'fail',
    checks: [
      { name: 'Dev Area',             result: 'pass', label: 'Pass' },
      { name: 'Zoning',               result: 'flag', label: 'Flag — Verify, mixed use boundary' },
      { name: 'Lot Dimensions',       result: 'pass', label: 'Pass — 48ft × 121ft, fits 2 plans' },
      { name: 'Road Classification',  result: 'flag', label: 'Flag — 4-lane arterial detected (82% confidence)' },
      { name: 'Commercial Proximity', result: 'pass', label: 'Pass' },
      { name: 'Flood Zone',           result: 'fail', label: 'Fail — Zone AE, high risk' },
    ],
  },
  'BOOL-004': {
    overallResult: 'pass',
    checks: [
      { name: 'Dev Area',             result: 'pass', label: 'Pass' },
      { name: 'Zoning',               result: 'pass', label: 'Pass — RS-60 Residential' },
      { name: 'Lot Dimensions',       result: 'pass', label: 'Pass — 55ft × 118ft, fits 3 plans' },
      { name: 'Road Classification',  result: 'pass', label: 'Pass — Residential, 2 lanes' },
      { name: 'Commercial Proximity', result: 'pass', label: 'Pass' },
      { name: 'Flood Zone',           result: 'pass', label: 'Pass — Zone X' },
    ],
  },
};

const OVERALL_LABELS: Record<TriageData['overallResult'], string> = {
  pass:            'Ready to Underwrite',
  review_required: 'Review Required',
  fail:            'Auto DQ Recommended',
};

const RESULT_LABELS: Record<CheckResult, string> = {
  pass: 'Pass',
  fail: 'Fail',
  flag: 'Flag',
};

interface Props {
  opp: Opportunity;
  onDQ: () => void;
  onProceed: () => void;
  onOverride: () => void;
}

export default function TriageCard({ opp, onDQ, onProceed, onOverride }: Props) {
  const triage = TRIAGE_DATA[opp.id];
  const isAutoDQ = triage?.overallResult === 'fail';

  return (
    <div className="triage-card">
      {/* Header */}
      <div className="triage-header">
        <div className="triage-header-left">
          <h2 className="triage-address">{opp.address}</h2>
          <p className="triage-meta">
            {opp.city}, {opp.state} {opp.zip}
            <span className="triage-meta-sep">·</span>
            {opp.market}
            <span className="triage-meta-sep">·</span>
            {opp.lotSqFt.toLocaleString()} sqft
          </p>
        </div>
        {triage && (
          <span className={`triage-overall-badge overall-${triage.overallResult}`}>
            {OVERALL_LABELS[triage.overallResult]}
          </span>
        )}
      </div>

      {/* Pre-Screen Checks */}
      <div className="triage-section">
        <h3 className="triage-section-title">Pre-Screen Checks</h3>
        <div className="triage-checks">
          {triage ? (
            triage.checks.map((check) => (
              <div key={check.name} className="triage-check-row">
                <span className="check-name">{check.name}</span>
                <div className="check-right">
                  <span className={`check-dot dot-${check.result}`} aria-label={RESULT_LABELS[check.result]} />
                  <span className={`check-label label-${check.result}`}>{check.label}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="triage-no-data">No triage data available for this opportunity.</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="triage-actions">
        {isAutoDQ ? (
          <>
            <button className="triage-btn triage-btn-auto-dq" onClick={onDQ}>
              Confirm Auto-DQ
            </button>
            <button className="triage-btn triage-btn-override" onClick={onOverride}>
              Override
            </button>
          </>
        ) : (
          <>
            <button className="triage-btn triage-btn-dq" onClick={onDQ}>
              DQ This Property
            </button>
            <button className="triage-btn triage-btn-proceed" onClick={onProceed}>
              Proceed to Underwrite
            </button>
          </>
        )}
      </div>
    </div>
  );
}

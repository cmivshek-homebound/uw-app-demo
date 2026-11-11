import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getAIDraft } from '../data/aiDrafts';
import { AI, SFDC } from '../data/provenance';
import { useCanAct } from '../data/role';
import AssetLink from './AssetLink';
import ProvenanceValue from './ProvenanceValue';
import type { Opportunity } from '../types';
import './TriageCard.css';

type CheckResult = 'pass' | 'fail' | 'flag';

interface PreScreenCheck {
  name: string;
  result: CheckResult;
  label: ReactNode;
}

interface TriageData {
  checks: PreScreenCheck[];
  overallResult: 'pass' | 'review_required' | 'fail';
}

/** Lot dimensions from the Salesforce lot record. */
function lot(width: number, depth: number) {
  return <ProvenanceValue info={SFDC}>{width}ft × {depth}ft</ProvenanceValue>;
}

/** AI detection confidence. */
function confidence(pct: number) {
  return <ProvenanceValue info={AI}>{pct}%</ProvenanceValue>;
}

const TRIAGE_DATA: Record<string, TriageData> = {
  'BOOL-001': {
    overallResult: 'review_required',
    checks: [
      { name: 'Dev Area',             result: 'pass', label: 'Pass' },
      { name: 'Zoning',               result: 'pass', label: 'Pass — SF-3 Residential' },
      { name: 'Lot Dimensions',       result: 'pass', label: <>Pass — {lot(52, 120)}, fits 3 plans</> },
      { name: 'Road Classification',  result: 'pass', label: 'Pass — Residential, 2 lanes' },
      { name: 'Commercial Proximity', result: 'flag', label: <>Flag — Gas station <ProvenanceValue info={AI}>190ft</ProvenanceValue> NE ({confidence(58)} confidence)</> },
      { name: 'Flood Zone',           result: 'pass', label: 'Pass — Zone X' },
    ],
  },
  'BOOL-002': {
    overallResult: 'pass',
    checks: [
      { name: 'Dev Area',             result: 'pass', label: 'Pass' },
      { name: 'Zoning',               result: 'pass', label: 'Pass — SF-3 Residential' },
      { name: 'Lot Dimensions',       result: 'pass', label: <>Pass — {lot(58, 122)}, fits 4 plans</> },
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
      { name: 'Lot Dimensions',       result: 'pass', label: <>Pass — {lot(48, 121)}, fits 2 plans</> },
      { name: 'Road Classification',  result: 'flag', label: <>Flag — 4-lane arterial detected ({confidence(82)} confidence)</> },
      { name: 'Commercial Proximity', result: 'pass', label: 'Pass' },
      { name: 'Flood Zone',           result: 'fail', label: 'Fail — Zone AE, high risk' },
    ],
  },
  'BOOL-004': {
    overallResult: 'pass',
    checks: [
      { name: 'Dev Area',             result: 'pass', label: 'Pass' },
      { name: 'Zoning',               result: 'pass', label: 'Pass — RS-60 Residential' },
      { name: 'Lot Dimensions',       result: 'pass', label: <>Pass — {lot(55, 118)}, fits 3 plans</> },
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
  const canAct = useCanAct();
  const hasDraft = getAIDraft(opp.id) !== undefined;

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
            <ProvenanceValue info={SFDC}>{opp.lotSqFt.toLocaleString()} sqft</ProvenanceValue>
            <span className="triage-meta-sep">·</span>
            <AssetLink id={opp.id} record />
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
        {hasDraft && (
          <Link className="triage-btn triage-btn-draft" to={`/underwrite/${opp.id}/draft`}>
            View AI draft
          </Link>
        )}
        {!canAct ? null : isAutoDQ ? (
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

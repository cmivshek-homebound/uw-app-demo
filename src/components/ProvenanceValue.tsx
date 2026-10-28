import type { ReactNode } from 'react';
import type { ProvenanceInfo, ProvenanceSource } from '../types';
import './ProvenanceValue.css';

// ── Provenance markers ─────────────────────────────────────────
// Wraps a displayed value with a quiet marker for where it came from.
// AI drafts stay tinted until confirmed; hovering explains the source.

const SOURCE_TAGS: Record<ProvenanceSource, string> = {
  Salesforce: 'SFDC',
  'BOOL data tape': 'TAPE',
  Blueprint: 'BP',
  MLS: 'MLS',
};

function SparkleIcon() {
  return (
    <svg className="pv-icon" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 0.8 L7.1 4.9 L11.2 6 L7.1 7.1 L6 11.2 L4.9 7.1 L0.8 6 L4.9 4.9 Z" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="pv-icon" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 6.3 L5 8.6 L9.5 3.6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function describe({ provenance, source, note }: ProvenanceInfo): string {
  switch (provenance) {
    case 'ai':
      return 'AI draft — not yet confirmed';
    case 'human':
      return note ?? 'Confirmed by analyst';
    case 'system':
      return source ? `From ${source}` : 'From system of record';
  }
}

export default function ProvenanceValue({ info, children }: { info: ProvenanceInfo; children: ReactNode }) {
  const label = describe(info);
  return (
    <span className={`pv pv--${info.provenance}`} title={label}>
      <span className="pv-value">{children}</span>
      {info.provenance === 'ai' && <SparkleIcon />}
      {info.provenance === 'human' && <CheckIcon />}
      {info.provenance === 'system' && info.source && (
        <span className="pv-tag">{SOURCE_TAGS[info.source]}</span>
      )}
      <span className="pv-sr">({label})</span>
    </span>
  );
}

export function ProvenanceLegend() {
  return (
    <div className="pv-legend">
      <span className="pv-legend-item">
        <span className="pv pv--ai"><SparkleIcon /></span> AI draft, unconfirmed
      </span>
      <span className="pv-legend-item">
        <span className="pv pv--human"><CheckIcon /></span> Analyst confirmed or overridden
      </span>
      <span className="pv-legend-item">
        <span className="pv pv--system"><span className="pv-tag">SFDC</span></span> System of record
      </span>
      <span className="pv-legend-hint">Hover a value for its source</span>
    </div>
  );
}

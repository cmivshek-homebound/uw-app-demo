import type { MonthlyMark, ProvenanceInfo } from '../types';

// ── Shared provenance markers ──────────────────────────────────
// One definition per source so every screen tags values the same way.
// The source list itself (fields fed, screens) lives in integrations.ts.

export const AI: ProvenanceInfo = { provenance: 'ai' };
export const SFDC: ProvenanceInfo = { provenance: 'system', source: 'Salesforce' };
export const TAPE: ProvenanceInfo = { provenance: 'system', source: 'BOOL data tape' };
export const BLUEPRINT: ProvenanceInfo = { provenance: 'system', source: 'Blueprint' };
export const MLS: ProvenanceInfo = { provenance: 'system', source: 'MLS' };

/** Computed in-app from system-of-record data (rollups, counts, day math). */
export function computed(note: string): ProvenanceInfo {
  return { provenance: 'system', note };
}

/** Confirmed or set by a person: reviewed underwrites, approved marks, assumptions. */
export function human(note: string): ProvenanceInfo {
  return { provenance: 'human', note };
}

/** A month-end mark: AI until approved, then auto-approved (system) or approved by a person. */
export function markProvenance(m: MonthlyMark | undefined): ProvenanceInfo {
  if (!m?.approvedBy) return { provenance: 'ai', note: 'Awaiting approval' };
  if (m.approvedBy === 'Auto-approved') return { provenance: 'system', note: 'Auto-approved' };
  return { provenance: 'human', note: `Approved by ${m.approvedBy}` };
}

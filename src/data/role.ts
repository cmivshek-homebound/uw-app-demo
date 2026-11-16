import { createContext, useContext } from 'react';
import { ANALYST_BY_MARKET } from './markProposals';
import { boardAnalysts } from './selectors';

// ── "View as" role ─────────────────────────────────────────────
// Same pages and data for everyone; the role only changes where you land
// and what's emphasized. Held in React state by RoleProvider (resets on reload).

export type Role = 'analyst' | 'manager' | 'executive';

export const ROLE_LABELS: Record<Role, string> = {
  analyst: 'Analyst',
  manager: 'Manager',
  executive: 'Executive',
};

/** Short labels for the nav's segmented control. */
export const ROLE_SHORT_LABELS: Record<Role, string> = {
  analyst: 'Analyst',
  manager: 'Manager',
  executive: 'Exec',
};

export const DEFAULT_ROLE: Role = 'manager';

/** Analysts who own board cards or a market's marks, for the Analyst view. */
export const VIEWABLE_ANALYSTS = [...new Set([...boardAnalysts(), ...Object.values(ANALYST_BY_MARKET)])].sort();
export const DEFAULT_ANALYST = VIEWABLE_ANALYSTS.includes('Maya Chen') ? 'Maya Chen' : VIEWABLE_ANALYSTS[0];

/** Where each role lands when selected. */
export function roleLanding(role: Role, analyst: string): string {
  if (role === 'analyst') return `/underwrite?analyst=${encodeURIComponent(analyst)}`;
  if (role === 'manager') return '/approvals';
  return '/';
}

/** The analyst's own month-end marks: proposals assigned to them. */
export function analystMarksPath(analyst: string): string {
  return `/marks?analyst=${encodeURIComponent(analyst)}`;
}

export interface RoleState {
  role: Role;
  analyst: string;
  setRole: (role: Role) => void;
  setAnalyst: (analyst: string) => void;
}

export const RoleContext = createContext<RoleState>({
  role: DEFAULT_ROLE,
  analyst: DEFAULT_ANALYST,
  setRole: () => {},
  setAnalyst: () => {},
});

export function useRole(): RoleState {
  return useContext(RoleContext);
}

/** Executives see the same screens without analyst-level action buttons. */
export function useCanAct(): boolean {
  return useRole().role !== 'executive';
}

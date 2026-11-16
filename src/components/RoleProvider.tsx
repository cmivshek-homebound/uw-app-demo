import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_ANALYST, DEFAULT_ROLE, RoleContext } from '../data/role';
import type { Role } from '../data/role';

/** Holds the "View as" selection in React state for the session. */
export default function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const [analyst, setAnalyst] = useState(DEFAULT_ANALYST);
  const value = useMemo(() => ({ role, analyst, setRole, setAnalyst }), [role, analyst]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

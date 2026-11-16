import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { IntakeContext } from '../data/intake';
import type { IntakeDecision, IntakeStore } from '../data/intake';

/** Holds send / disqualify / hold decisions on intake leads for the session. */
export default function IntakeProvider({ children }: { children: ReactNode }) {
  const [decisions, setDecisions] = useState<Record<string, IntakeDecision>>({});
  const decide = useCallback((updates: Record<string, IntakeDecision>) => {
    setDecisions((prev) => ({ ...prev, ...updates }));
  }, []);
  const store = useMemo<IntakeStore>(() => ({ decisions, decide }), [decisions, decide]);
  return <IntakeContext.Provider value={store}>{children}</IntakeContext.Provider>;
}

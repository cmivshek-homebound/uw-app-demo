import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ASSETS } from '../data/assets';
import { demoNow } from '../data/dates';
import { DRAFT_SECONDS, IntakeContext } from '../data/intake';
import type { IntakeDecision, IntakeStore } from '../data/intake';
import { ANALYST_BY_MARKET } from '../data/markProposals';
import { useNotifications } from '../data/notifications';

/**
 * Holds send / disqualify / hold decisions on intake leads for the session.
 * A sent lead's AI draft "finishes" DRAFT_SECONDS later: it moves to Draft
 * ready on the board and posts an "AI draft ready" notification.
 */
export default function IntakeProvider({ children }: { children: ReactNode }) {
  const [decisions, setDecisions] = useState<Record<string, IntakeDecision>>({});
  const { notify } = useNotifications();
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const finishDraft = useCallback((id: string) => {
    const readyAt = demoNow();
    setDecisions((prev) => {
      const d = prev[id];
      return d?.kind === 'sent' ? { ...prev, [id]: { ...d, draftReadyAt: readyAt } } : prev;
    });
    const asset = ASSETS.find((a) => a.id === id)!;
    const analyst = ANALYST_BY_MARKET[asset.market];
    notify({
      type: 'ai',
      title: `AI draft ready: ${asset.address}`,
      detail: `Drafted ${DRAFT_SECONDS}s after it left intake and assigned to ${analyst}. Ready for review.`,
      assetId: id,
      to: `/asset/${id}`,
      at: readyAt,
      roles: ['analyst', 'manager'],
      analyst,
    });
  }, [notify]);

  const decide = useCallback((updates: Record<string, IntakeDecision>) => {
    setDecisions((prev) => ({ ...prev, ...updates }));
    for (const [id, d] of Object.entries(updates)) {
      if (d.kind === 'sent') timers.current.push(window.setTimeout(() => finishDraft(id), DRAFT_SECONDS * 1000));
    }
  }, [finishDraft]);

  const store = useMemo<IntakeStore>(() => ({ decisions, decide }), [decisions, decide]);
  return <IntakeContext.Provider value={store}>{children}</IntakeContext.Provider>;
}

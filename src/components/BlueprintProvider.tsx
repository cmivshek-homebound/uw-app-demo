import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BlueprintContext, promotionImpact } from '../data/blueprint';
import type { BlueprintStore, BudgetSync, Promotion } from '../data/blueprint';
import { demoNow } from '../data/dates';
import { ANALYST_BY_MARKET } from '../data/markProposals';
import { useNotifications } from '../data/notifications';

function usdK(n: number) {
  return `${n < 0 ? '−' : '+'}$${(Math.abs(n) / 1000).toFixed(1).replace(/\.0$/, '')}K`;
}

/** Budget promotions from Blueprint for the session; each one logs who and when and posts a notification. */
export default function BlueprintProvider({ children }: { children: ReactNode }) {
  const [promotions, setPromotions] = useState<Record<string, Promotion>>({});
  const { notify } = useNotifications();

  const promote = useCallback((sync: BudgetSync, by: string) => {
    const at = demoNow();
    const impact = promotionImpact(sync);
    setPromotions((prev) => ({
      ...prev,
      [sync.asset.id]: { assetId: sync.asset.id, at, by, fromVersion: sync.uwVersion, toVersion: sync.bpVersion, change: sync.diff },
    }));
    notify({
      type: 'approval',
      title: `Budget promoted: ${sync.asset.address}`,
      detail: `${by} promoted Blueprint ${sync.bpVersion} (${usdK(sync.diff)}). Implied margin ${impact.marginBefore.toFixed(1)}% → ${impact.marginAfter.toFixed(1)}%.`,
      assetId: sync.asset.id,
      to: `/asset/${sync.asset.id}`,
      at,
      roles: ['analyst', 'manager', 'executive'],
      analyst: ANALYST_BY_MARKET[sync.asset.market],
    });
  }, [notify]);

  const store = useMemo<BlueprintStore>(() => ({ promotions, promote }), [promotions, promote]);
  return <BlueprintContext.Provider value={store}>{children}</BlueprintContext.Provider>;
}

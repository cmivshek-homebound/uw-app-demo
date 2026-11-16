import { useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { DASHBOARD, FromPageContext, pageLabel } from '../data/navHistory';
import type { FromPage } from '../data/navHistory';

/**
 * Remembers the last labeled page left behind, so an asset record opened from
 * For Sale points back to For Sale. Adjusted during render (not in an effect)
 * so the asset page sees the right origin on its first render.
 */
export default function NavHistoryProvider({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const here = pathname + search;
  const [state, setState] = useState<{ here: string; from: FromPage }>({ here, from: DASHBOARD });

  let from = state.from;
  if (state.here !== here) {
    const prev = new URL(state.here, 'http://app.local');
    const label = pageLabel(prev.pathname, prev.search);
    if (label) from = { path: state.here, label };
    setState({ here, from });
  }

  return <FromPageContext.Provider value={from}>{children}</FromPageContext.Provider>;
}

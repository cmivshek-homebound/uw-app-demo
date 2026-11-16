import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ShowSourcesContext } from '../data/showSources';

/** Holds the legend's "Show sources" toggle and flags it on <html> so CSS can reveal every tag. */
export default function ShowSourcesProvider({ children }: { children: ReactNode }) {
  const [showSources, setShowSources] = useState(false);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-show-sources', showSources);
  }, [showSources]);
  const value = useMemo(() => ({ showSources, setShowSources }), [showSources]);
  return <ShowSourcesContext.Provider value={value}>{children}</ShowSourcesContext.Provider>;
}

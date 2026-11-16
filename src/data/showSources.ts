import { createContext, useContext } from 'react';

// ── "Show sources" toggle ──────────────────────────────────────
// System source tags (SFDC, MLS, BP, TAPE) stay hidden until hovered;
// the legend toggle reveals them all. Session-only, held by ShowSourcesProvider.

export interface ShowSourcesState {
  showSources: boolean;
  setShowSources: (on: boolean) => void;
}

export const ShowSourcesContext = createContext<ShowSourcesState>({
  showSources: false,
  setShowSources: () => {},
});

export function useShowSources(): ShowSourcesState {
  return useContext(ShowSourcesContext);
}

import { createContext, useContext } from 'react';

// ── Where the user came from ───────────────────────────────────
// The asset record's breadcrumb points back at the last non-asset page
// visited, so it reads "For Sale › BOOL-031" or "Portfolio · Marks › BOOL-031".

export interface FromPage {
  path: string;   // pathname + search, exactly as visited
  label: string;
}

const PORTFOLIO_TABS: Record<string, string> = {
  marks: 'Month-end marks',
  accuracy: 'Underwriting accuracy',
  construction: 'Construction',
};

/** Breadcrumb label for an app path; undefined for asset records and unknown paths. */
export function pageLabel(pathname: string, search: string): string | undefined {
  if (pathname === '/') return 'Dashboard';
  if (pathname.startsWith('/asset/')) return undefined;
  if (pathname.startsWith('/queue')) return 'Pipeline';
  if (pathname === '/underwrite') return 'Underwrite';
  const uw = pathname.match(/^\/underwrite\/([^/]+)(\/draft|\/scenario\/comps|\/scenario)?$/);
  if (uw) {
    const sub = { '/draft': 'AI Draft', '/scenario': 'Scenarios', '/scenario/comps': 'Comps' }[uw[2] ?? ''];
    return sub ? `${uw[1]} ${sub}` : `Underwrite ${uw[1]}`;
  }
  if (pathname === '/contract') return 'Under Contract';
  if (pathname.startsWith('/contract/')) return `Under Contract ${pathname.split('/')[2]}`;
  if (pathname.startsWith('/portfolio')) {
    const tab = PORTFOLIO_TABS[new URLSearchParams(search).get('tab') ?? ''];
    return tab ? `Portfolio · ${tab}` : 'Portfolio';
  }
  if (pathname.startsWith('/for-sale')) return 'For Sale';
  if (pathname.startsWith('/approvals')) return 'Approvals';
  if (pathname.startsWith('/integrations')) return 'Data sources';
  return undefined;
}

export const DASHBOARD: FromPage = { path: '/', label: 'Dashboard' };

export const FromPageContext = createContext<FromPage>(DASHBOARD);

/** The last non-asset page visited; the Dashboard on a fresh load. */
export function useFromPage(): FromPage {
  return useContext(FromPageContext);
}

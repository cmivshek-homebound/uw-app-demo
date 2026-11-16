import { Navigate, useSearchParams } from 'react-router-dom';

/** Old /portfolio links: tabs map to their new pages; everything else lands on Construction. */
export default function PortfolioRedirect() {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  const analyst = params.get('analyst');
  const scope = analyst ? `analyst=${encodeURIComponent(analyst)}` : '';
  if (tab === 'marks') return <Navigate to={`/marks${scope && `?${scope}`}`} replace />;
  if (tab === 'accuracy') return <Navigate to={`/marks?tab=accuracy${scope && `&${scope}`}`} replace />;
  return <Navigate to="/construction" replace />;
}

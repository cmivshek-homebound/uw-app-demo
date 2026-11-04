import { useSearchParams } from 'react-router-dom';
import AssetStageTable from '../components/AssetStageTable';
import { ASSETS } from '../data/assets';
import { useMarkReviews, withMarkReviews } from '../data/markReview';
import { assetsByStage } from '../data/selectors';
import MonthEndMarksTab from './MonthEndMarksTab';
import UnderwritingAccuracyTab from './UnderwritingAccuracyTab';
import './PortfolioPage.css';

const TABS = [
  { id: 'assets', label: 'Assets' },
  { id: 'marks', label: 'Month-end marks' },
  { id: 'accuracy', label: 'Underwriting accuracy' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function PortfolioPage() {
  const [params, setParams] = useSearchParams();
  const { reviews, published } = useMarkReviews();
  const tabParam = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'assets';

  const byStage = assetsByStage(withMarkReviews(ASSETS, reviews, published));
  const assets = [...byStage.precon, ...byStage.construction];

  const setTab = (next: TabId) => {
    const p = new URLSearchParams(params);
    if (next === 'assets') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Portfolio</h1>
          <p className="oq-subtitle">
            Owned lots, month-end marks, and how underwriting held up on sold homes.
          </p>
        </div>
      </div>

      <div className="pf-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`pf-tab ${tab === t.id ? 'pf-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'assets' && <AssetStageTable assets={assets} />}
      {tab === 'marks' && <MonthEndMarksTab />}
      {tab === 'accuracy' && <UnderwritingAccuracyTab />}
    </div>
  );
}

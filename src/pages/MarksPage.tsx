import { useSearchParams } from 'react-router-dom';
import MonthEndMarksTab from './MonthEndMarksTab';
import UnderwritingAccuracyTab from './UnderwritingAccuracyTab';
import './OpportunityQueue.css';
import './PortfolioPage.css';

const TABS = [
  { id: 'marks', label: 'Month-end marks' },
  { id: 'accuracy', label: 'Underwriting accuracy' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function MarksPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get('tab') === 'accuracy' ? 'accuracy' : 'marks';

  // Keep other params (e.g. ?analyst=) so switching tabs doesn't drop a scope.
  const setTab = (next: TabId) => {
    const p = new URLSearchParams(params);
    if (next === 'marks') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Marks</h1>
          <p className="oq-subtitle">Month-end marks on owned lots, and how underwriting held up on sold homes.</p>
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

      {tab === 'marks' && <MonthEndMarksTab />}
      {tab === 'accuracy' && <UnderwritingAccuracyTab />}
    </div>
  );
}

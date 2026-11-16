import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DEMO_STEPS, useDemo } from '../data/demo';
import './DemoPresenter.css';

/** Floating presenter card: the current step's talking point and a link to its page. */
export default function DemoPresenter() {
  const { on, step, setOn, setStep } = useDemo();
  const { pathname, search, hash } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  // Steps can point at a section (#id); the router doesn't scroll to hashes, so do it here.
  useEffect(() => {
    if (!on || !hash) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 50);
    return () => window.clearTimeout(t);
  }, [on, pathname, hash]);

  if (!on) return null;

  const current = DEMO_STEPS[step];
  const here = pathname + search + hash === current.path || (pathname + search === current.path.split('#')[0] && !hash);
  const last = DEMO_STEPS.length - 1;

  return (
    <aside className={`dp-card ${collapsed ? 'dp-card--collapsed' : ''}`} aria-label="Demo presenter">
      <div className="dp-head">
        <span className="dp-kicker">
          Demo · Step {step + 1} of {DEMO_STEPS.length}
        </span>
        <div className="dp-head-actions">
          <button className="dp-icon" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand presenter' : 'Collapse presenter'}>
            {collapsed ? '▴' : '▾'}
          </button>
          <button className="dp-icon" onClick={() => setOn(false)} aria-label="Turn off demo mode">×</button>
        </div>
      </div>

      <h3 className="dp-title">{current.title}</h3>

      {!collapsed && (
        <>
          <p className="dp-point">{current.talkingPoint()}</p>

          <div className="dp-actions">
            <button className="dp-btn" onClick={() => setStep(step - 1)} disabled={step === 0}>← Prev</button>
            {here ? (
              <span className="dp-here">You’re here</span>
            ) : (
              <Link to={current.path} className="dp-btn dp-btn--go">Go →</Link>
            )}
            <button className="dp-btn" onClick={() => setStep(step + 1)} disabled={step === last}>Next →</button>
          </div>

          <button className="dp-toggle" aria-expanded={showSteps} onClick={() => setShowSteps(!showSteps)}>
            {showSteps ? 'Hide steps ▴' : `All ${DEMO_STEPS.length} steps ▾`}
          </button>

          {showSteps && <ol className="dp-steps">
            {DEMO_STEPS.map((s, i) => (
              <li key={s.path}>
                <button
                  className={`dp-step ${i === step ? 'dp-step--current' : ''} ${i < step ? 'dp-step--done' : ''}`}
                  onClick={() => setStep(i)}
                  title={s.title}
                >
                  <span className="dp-step-num">{i + 1}</span>
                  <span className="dp-step-label">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>}
        </>
      )}
    </aside>
  );
}

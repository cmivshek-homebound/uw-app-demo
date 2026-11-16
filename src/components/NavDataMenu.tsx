import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const ITEMS = [
  { to: '/data/assumptions', label: 'Assumptions', hint: 'Rates, targets and cycle times' },
  { to: '/data/blueprint', label: 'Blueprint sync', hint: 'Cost book and build budgets' },
  { to: '/integrations', label: 'Data sources', hint: 'Where every number comes from' },
];

/** "Data" dropdown at the right of the nav: assumptions, Blueprint sync, data sources. */
export default function NavDataMenu() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = ITEMS.some((i) => pathname.startsWith(i.to));

  // Close on outside click or Escape. Picking an item closes it in its onClick.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="nav-data" ref={ref}>
      <button
        className={`nav-link nav-data-btn ${active || open ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Data <span className="nav-data-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="nav-data-menu" role="menu">
          {ITEMS.map((i) => (
            <Link
              key={i.to}
              to={i.to}
              role="menuitem"
              className={`nav-data-item ${pathname.startsWith(i.to) ? 'nav-data-item--active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="nav-data-label">{i.label}</span>
              <span className="nav-data-hint">{i.hint}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

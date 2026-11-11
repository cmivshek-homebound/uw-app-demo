import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './RoleBanner.css';

/** A one-line strip that says whose view this is and where to go next. */
export default function RoleBanner({ children, next }: { children: ReactNode; next?: { to: string; label: string } }) {
  return (
    <div className="role-banner">
      <span className="role-banner-text">{children}</span>
      {next && (next.to.startsWith('#')
        ? <a href={next.to} className="role-banner-next">{next.label} →</a>
        : <Link to={next.to} className="role-banner-next">{next.label} →</Link>)}
    </div>
  );
}

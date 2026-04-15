import { Link, useLocation } from 'react-router-dom';
import './NavBar.css';

export default function NavBar() {
  const { pathname } = useLocation();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <div className="navbar-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2L26 10V26H18V18H10V26H2V10L14 2Z" fill="#ffffff" />
          </svg>
        </div>
        <span className="navbar-title">Homebound Underwriting App 2.0</span>
      </div>

      <div className="navbar-links">
        <Link
          to="/"
          className={`nav-link ${pathname === '/' ? 'active' : ''}`}
        >
          Opportunity Queue
        </Link>
        <Link
          to="/underwrite"
          className={`nav-link ${pathname.startsWith('/underwrite') ? 'active' : ''}`}
        >
          Underwrite
        </Link>
      </div>
    </nav>
  );
}

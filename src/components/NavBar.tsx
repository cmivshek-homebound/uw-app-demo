import { Link, useLocation } from 'react-router-dom';
import homeboundLogo from '../assets/homebound-logo.png';
import './NavBar.css';

export default function NavBar() {
  const { pathname } = useLocation();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <img
          src={homeboundLogo}
          alt="Homebound"
          className="navbar-logo-img"
        />
        <span className="navbar-subtitle">Underwriting App 2.0</span>
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

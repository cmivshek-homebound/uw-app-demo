import { Link, useLocation } from 'react-router-dom';
import '../components/AssetLink.css';

/** Catch-all for unknown routes, so a mistyped link never lands on a blank page. */
export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Page not found</h1>
          <p className="oq-subtitle">
            Nothing lives at <code>{pathname}</code>.
            <Link to="/" className="link-button">Back to the dashboard</Link>
            <Link to="/intake" className="link-button">Open intake</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

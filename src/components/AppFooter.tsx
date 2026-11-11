import { Link } from 'react-router-dom';
import './AppFooter.css';

export default function AppFooter() {
  return (
    <footer className="app-footer">
      <span>Underwriting App 2.0 · BOOL infill · Demo data</span>
      <Link to="/integrations">Data sources</Link>
    </footer>
  );
}

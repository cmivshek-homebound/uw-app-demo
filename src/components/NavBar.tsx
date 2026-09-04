import { Link, useLocation } from 'react-router-dom';
import homeboundLogo from '../assets/homebound-logo.png';
import { mockOpportunities } from '../data/opportunities';
import { CONTRACT_DEALS, contractCount, daysRemaining } from '../data/contracts';
import './NavBar.css';

export default function NavBar() {
  const { pathname } = useLocation();

  // Counts shown beside each destination so the bar reports live workload.
  const queueCount = mockOpportunities.length;
  const pendingCount = mockOpportunities.filter((o) => o.status === 'pending_review').length;
  const inReviewCount = mockOpportunities.filter((o) => o.status === 'in_review').length;

  // Soonest inspection deadline across under-contract deals.
  const soonestDays = Object.values(CONTRACT_DEALS)
    .map((d) => daysRemaining(d.inspectionExpires))
    .sort((a, b) => a - b)[0];

  const contractUrgent = soonestDays !== undefined && soonestDays < 7;

  const links = [
    {
      to: '/',
      label: 'Opportunity Queue',
      active: pathname === '/',
      count: queueCount,
      tone: pendingCount > 0 ? 'attention' : 'muted',
      title: `${queueCount} opportunities · ${pendingCount} pending review`,
    },
    {
      to: '/underwrite',
      label: 'Underwrite',
      active: pathname.startsWith('/underwrite'),
      count: inReviewCount,
      tone: 'muted',
      title: `${inReviewCount} in review`,
    },
    {
      to: contractCount === 1 ? `/contract/${Object.keys(CONTRACT_DEALS)[0]}` : '/contract',
      label: 'Under Contract',
      active: pathname.startsWith('/contract'),
      count: contractCount,
      tone: contractUrgent ? 'urgent' : 'muted',
      title: contractUrgent
        ? `${contractCount} under contract · inspection ends in ${soonestDays} days`
        : `${contractCount} under contract`,
    },
  ];

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
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            title={link.title}
            className={`nav-link ${link.active ? 'active' : ''}`}
          >
            {link.label}
            <span className={`nav-count nav-count--${link.tone}`}>{link.count}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

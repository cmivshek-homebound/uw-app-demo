import { Link, useLocation } from 'react-router-dom';
import homeboundLogo from '../assets/homebound-logo.png';
import { daysRemaining } from '../data/dates';
import { assetsByStage, countByStage, pipelineAssets } from '../data/selectors';
import './NavBar.css';

export default function NavBar() {
  const { pathname } = useLocation();

  // Counts shown beside each destination so the bar reports live workload.
  const pipeline = pipelineAssets();
  const stageCounts = countByStage();
  const pipelineCount = pipeline.length;
  const pendingCount = pipeline.filter((a) => a.pipelineStatus === 'pending_review').length;
  const inReviewCount = pipeline.filter((a) => a.pipelineStatus === 'in_review').length;
  const contractCount = stageCounts.under_contract;
  const portfolioCount = stageCounts.precon + stageCounts.construction;
  const forSaleCount = stageCounts.for_sale;

  // Soonest inspection deadline across under-contract assets.
  const soonestDays = assetsByStage().under_contract
    .filter((a) => a.contract)
    .map((a) => daysRemaining(a.contract!.inspectionExpires))
    .sort((a, b) => a - b)[0];

  const contractUrgent = soonestDays !== undefined && soonestDays < 7;

  const links = [
    {
      to: '/queue',
      label: 'Pipeline',
      active: pathname.startsWith('/queue'),
      count: pipelineCount,
      tone: pendingCount > 0 ? 'attention' : 'muted',
      title: `${pipelineCount} opportunities · ${pendingCount} pending review`,
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
      to: '/contract',
      label: 'Under Contract',
      active: pathname.startsWith('/contract'),
      count: contractCount,
      tone: contractUrgent ? 'urgent' : 'muted',
      title: contractUrgent
        ? `${contractCount} under contract · inspection ends in ${soonestDays} days`
        : `${contractCount} under contract`,
    },
    {
      to: '/portfolio',
      label: 'Portfolio',
      active: pathname.startsWith('/portfolio'),
      count: portfolioCount,
      tone: 'muted',
      title: `${stageCounts.precon} pre-con · ${stageCounts.construction} in construction`,
    },
    {
      to: '/for-sale',
      label: 'For Sale',
      active: pathname.startsWith('/for-sale'),
      count: forSaleCount,
      tone: 'muted',
      title: `${forSaleCount} listed`,
    },
  ];

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand" title="Dashboard">
        <img
          src={homeboundLogo}
          alt="Homebound"
          className="navbar-logo-img"
        />
        <span className="navbar-subtitle">Underwriting App 2.0</span>
      </Link>

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

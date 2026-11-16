import { Link, useLocation, useNavigate } from 'react-router-dom';
import homeboundLogo from '../assets/homebound-logo.png';
import { daysRemaining } from '../data/dates';
import { ASSETS } from '../data/assets';
import { useDraftReviews, withReviewStatus } from '../data/review';
import { useIntake, withIntakeDecisions } from '../data/intake';
import { useMarkReviews, withMarkReviews } from '../data/markReview';
import { BOARD_LATE_DAYS, assetsByStage, assetsNeedingApproval, countByStage, daysInColumn, underwritingBoard, untriagedLeads } from '../data/selectors';
import { useDemo } from '../data/demo';
import { ROLE_LABELS, ROLE_SHORT_LABELS, VIEWABLE_ANALYSTS, roleLanding, useRole } from '../data/role';
import type { Role } from '../data/role';
import './NavBar.css';

export default function NavBar() {
  const { pathname } = useLocation();
  const demo = useDemo();
  const navigate = useNavigate();
  const { role, analyst, setRole, setAnalyst } = useRole();

  // Switching view lands on that role's starting page.
  const viewAs = (next: Role) => {
    setRole(next);
    navigate(roleLanding(next, analyst));
  };
  const viewAsAnalyst = (name: string) => {
    setAnalyst(name);
    navigate(roleLanding('analyst', name));
  };

  // Counts shown beside each destination so the bar reports live workload.
  const stageCounts = countByStage();
  const { decisions } = useIntake();
  const { reviews } = useDraftReviews();
  const sessionAssets = withReviewStatus(withIntakeDecisions(ASSETS, decisions), reviews);
  const intakeCount = untriagedLeads(sessionAssets).length;
  const draftReady = underwritingBoard(sessionAssets).draft_ready;
  const draftReadyCount = draftReady.length;
  const draftsOverdue = draftReady.filter((a) => daysInColumn(a) > BOARD_LATE_DAYS).length;
  const { reviews: markReviews, published } = useMarkReviews();
  const marksNeedingApproval = assetsNeedingApproval(withMarkReviews(ASSETS, markReviews, published)).length;
  const contractCount = stageCounts.under_contract;
  const portfolioCount = stageCounts.precon + stageCounts.construction;
  const forSaleCount = stageCounts.for_sale;

  // Soonest inspection deadline across under-contract assets.
  const soonestDays = assetsByStage().under_contract
    .filter((a) => a.contract)
    .map((a) => daysRemaining(a.contract!.inspectionExpires))
    .sort((a, b) => a - b)[0];

  const inspectionOverdue = soonestDays !== undefined && soonestDays < 0;

  // Badges stay neutral; amber only when something is overdue or needs approval.
  const links = [
    {
      to: '/intake',
      label: 'Intake',
      active: pathname.startsWith('/intake'),
      count: intakeCount,
      tone: 'muted',
      title: `${intakeCount} untriaged ${intakeCount === 1 ? 'lead' : 'leads'}`,
    },
    {
      to: '/underwrite',
      label: 'Underwrite',
      active: pathname.startsWith('/underwrite'),
      count: draftReadyCount,
      tone: draftsOverdue > 0 ? 'urgent' : 'muted',
      title: draftsOverdue > 0
        ? `${draftReadyCount} AI drafts ready for review · ${draftsOverdue} waiting over ${BOARD_LATE_DAYS} days`
        : `${draftReadyCount} AI drafts ready for review`,
    },
    {
      to: '/contract',
      label: 'Under Contract',
      active: pathname.startsWith('/contract'),
      count: contractCount,
      tone: inspectionOverdue ? 'urgent' : 'muted',
      title: soonestDays === undefined
        ? `${contractCount} under contract`
        : inspectionOverdue
          ? `${contractCount} under contract · an inspection period has lapsed`
          : `${contractCount} under contract · next inspection ends in ${soonestDays} days`,
    },
    {
      to: '/portfolio',
      label: 'Portfolio',
      active: pathname.startsWith('/portfolio'),
      count: portfolioCount,
      tone: marksNeedingApproval > 0 ? 'urgent' : 'muted',
      title: `${stageCounts.precon} pre-con · ${stageCounts.construction} in construction`
        + (marksNeedingApproval > 0 ? ` · ${marksNeedingApproval} month-end marks need approval` : ''),
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
        <div className="nav-roles" role="group" aria-label="View as">
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <button
              key={r}
              className={`nav-role ${role === r ? 'nav-role--on' : ''}`}
              aria-pressed={role === r}
              title={`View as ${ROLE_LABELS[r]}`}
              onClick={() => role !== r && viewAs(r)}
            >
              {ROLE_SHORT_LABELS[r]}
            </button>
          ))}
        </div>
        {role === 'analyst' && (
          <select
            className="nav-select"
            aria-label="Analyst"
            value={analyst}
            onChange={(e) => viewAsAnalyst(e.target.value)}
          >
            {VIEWABLE_ANALYSTS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}
        <button
          className={`nav-demo ${demo.on ? 'nav-demo--on' : ''}`}
          aria-pressed={demo.on}
          onClick={() => demo.setOn(!demo.on)}
          title={demo.on ? 'Hide the demo presenter' : 'Show the guided demo presenter'}
        >
          Demo
        </button>
      </div>
    </nav>
  );
}

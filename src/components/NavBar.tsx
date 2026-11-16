import { Link, useLocation, useNavigate } from 'react-router-dom';
import homeboundLogo from '../assets/homebound-logo.png';
import { daysRemaining } from '../data/dates';
import { ASSETS } from '../data/assets';
import { useDraftReviews, withReviewStatus } from '../data/review';
import { useIntake, withIntakeDecisions } from '../data/intake';
import { useMarkReviews, withMarkReviews } from '../data/markReview';
import { listingsNeedingAction, useListingActions, withListingActions } from '../data/listingActions';
import {
  BOARD_LATE_DAYS,
  assetsByStage,
  assetsNeedingApproval,
  constructionAtRisk,
  constructionStatus,
  daysInColumn,
  underwritingBoard,
  untriagedLeads,
} from '../data/selectors';
import { useDemo } from '../data/demo';
import { ROLE_LABELS, ROLE_SHORT_LABELS, VIEWABLE_ANALYSTS, roleLanding, useRole } from '../data/role';
import type { Role } from '../data/role';
import NavDataMenu from './NavDataMenu';
import NotificationBell from './NotificationBell';
import './NavBar.css';

interface NavLink {
  to: string;
  label: string;
  count: number;
  tone: 'muted' | 'urgent';
  title: string;
}

/** Acquisitions (before closing) and Portfolio (after), divided at closing. */
interface NavGroup {
  label: string;
  links: NavLink[];
}

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
  // Badges stay neutral; amber only when something is overdue or needs approval.
  const { decisions } = useIntake();
  const { reviews } = useDraftReviews();
  const { reviews: markReviews, published } = useMarkReviews();
  const { actions } = useListingActions();
  const sessionAssets = withListingActions(
    withReviewStatus(withIntakeDecisions(withMarkReviews(ASSETS, markReviews, published), decisions), reviews),
    actions,
  );

  const intakeCount = untriagedLeads(sessionAssets).length;
  const draftReady = underwritingBoard(sessionAssets).draft_ready;
  const draftsOverdue = draftReady.filter((a) => daysInColumn(a) > BOARD_LATE_DAYS).length;
  const underContract = assetsByStage(sessionAssets).under_contract;
  // Soonest inspection deadline across under-contract assets.
  const soonestDays = underContract
    .filter((a) => a.contract)
    .map((a) => daysRemaining(a.contract!.inspectionExpires))
    .sort((a, b) => a - b)[0];
  const inspectionOverdue = soonestDays !== undefined && soonestDays < 0;

  const atRisk = constructionAtRisk(sessionAssets);
  const late = atRisk.filter((a) => {
    const st = constructionStatus(a);
    return st === 'behind_schedule' || st === 'both';
  }).length;
  const listingsToAct = listingsNeedingAction(sessionAssets, actions).length;
  const marksNeedingApproval = assetsNeedingApproval(sessionAssets).length;

  const groups: NavGroup[] = [
    {
      label: 'Acquisitions',
      links: [
        {
          to: '/intake',
          label: 'Intake',
          count: intakeCount,
          tone: 'muted',
          title: `${intakeCount} untriaged ${intakeCount === 1 ? 'lead' : 'leads'}`,
        },
        {
          to: '/underwrite',
          label: 'Underwrite',
          count: draftReady.length,
          tone: draftsOverdue > 0 ? 'urgent' : 'muted',
          title: `${draftReady.length} AI drafts ready for review`
            + (draftsOverdue > 0 ? ` · ${draftsOverdue} waiting over ${BOARD_LATE_DAYS} days` : ''),
        },
        {
          to: '/contract',
          label: 'Under Contract',
          count: underContract.length,
          tone: inspectionOverdue ? 'urgent' : 'muted',
          title: soonestDays === undefined
            ? `${underContract.length} under contract`
            : inspectionOverdue
              ? `${underContract.length} under contract · an inspection period has lapsed`
              : `${underContract.length} under contract · next inspection ends in ${soonestDays} days`,
        },
      ],
    },
    {
      label: 'Portfolio',
      links: [
        {
          to: '/construction',
          label: 'Construction',
          count: atRisk.length,
          tone: late > 0 ? 'urgent' : 'muted',
          title: `${atRisk.length} at risk (over budget or late)${late > 0 ? ` · ${late} behind schedule` : ''}`,
        },
        {
          to: '/for-sale',
          label: 'For Sale',
          count: listingsToAct,
          tone: 'muted',
          title: `${listingsToAct} ${listingsToAct === 1 ? 'listing needs' : 'listings need'} action`,
        },
        {
          to: '/marks',
          label: 'Marks',
          count: marksNeedingApproval,
          tone: marksNeedingApproval > 0 ? 'urgent' : 'muted',
          title: `${marksNeedingApproval} month-end ${marksNeedingApproval === 1 ? 'mark needs' : 'marks need'} approval`,
        },
      ],
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

      <div className="nav-groups">
        {groups.map((group, i) => (
          <div key={group.label} className="nav-group-wrap">
            {i > 0 && <span className="nav-divider" aria-hidden="true" />}
            <div className="nav-group" role="group" aria-label={group.label}>
              <span className="nav-group-label">{group.label}</span>
              <div className="nav-group-links">
                {group.links.map((link) => {
                  const active = pathname.startsWith(link.to);
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      title={link.title}
                      aria-current={active ? 'page' : undefined}
                      className={`nav-link ${active ? 'active' : ''}`}
                    >
                      {link.label}
                      <span className={`nav-count nav-count--${link.tone}`}>{link.count}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="navbar-controls">
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
        <NavDataMenu />
        <NotificationBell />
      </div>
    </nav>
  );
}

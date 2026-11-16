import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDemoToday, relativeTime } from '../data/dates';
import { notificationTitle, useNotifications, viewer, visibleTo } from '../data/notifications';
import type { AppNotification, NotificationType } from '../data/notifications';
import { ROLE_LABELS, useRole } from '../data/role';
import { SLACK_CHANNELS } from '../data/integrations';
import './NotificationBell.css';

const TYPE_LABELS: Record<NotificationType, string> = {
  ai: 'AI',
  approval: 'Approval',
  handoff: 'Handoff',
  deadline: 'Deadline',
  mention: 'Mention',
};

function BellIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="M10 2.5a5 5 0 0 0-5 5v3.2L3.6 13.3a.8.8 0 0 0 .7 1.2h11.4a.8.8 0 0 0 .7-1.2L15 10.7V7.5a5 5 0 0 0-5-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 16.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TypeIcon({ type }: { type: NotificationType }) {
  const paths: Record<NotificationType, ReactNode> = {
    ai: <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" fill="currentColor" />,
    approval: <path d="M3.5 8.3 6.6 11.2 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    handoff: <path d="M2.5 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
    deadline: <><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 5v3.3l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
    mention: <text x="8" y="11.6" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">@</text>,
  };
  return (
    <span className={`nb-type nb-type--${type}`} title={TYPE_LABELS[type]}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">{paths[type]}</svg>
    </span>
  );
}

/** Bell with unread count; opens a panel of this view's notifications, Today then Earlier. */
export default function NotificationBell() {
  const { notifications, isRead, markRead } = useNotifications();
  const { role, analyst } = useRole();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const mine = notifications.filter((n) => visibleTo(n, role, analyst));
  const unread = mine.filter((n) => !isRead(n));
  // Amber only when something waiting is a deadline or needs approval; neutral otherwise.
  const urgent = unread.some((n) => n.type === 'deadline' || n.type === 'approval');
  const me = viewer(role, analyst);
  const groups = [
    { label: 'Today', items: mine.filter((n) => isDemoToday(n.at)) },
    { label: 'Earlier', items: mine.filter((n) => !isDemoToday(n.at)) },
  ].filter((g) => g.items.length > 0);

  // Close on outside click or Escape.
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

  const go = (n: AppNotification) => {
    markRead([n.id]);
    setOpen(false);
    navigate(n.to);
  };

  return (
    <div className="nb" ref={ref}>
      <button
        className={`nb-bell ${open ? 'nb-bell--open' : ''}`}
        aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        {unread.length > 0 && (
          <span className={`nb-count ${urgent ? 'nb-count--urgent' : ''}`}>{unread.length}</span>
        )}
      </button>

      {open && (
        <div className="nb-panel" role="dialog" aria-label="Notifications">
          <div className="nb-head">
            <span className="nb-title">Notifications</span>
            <span className="nb-scope">{ROLE_LABELS[role]}{role === 'analyst' ? ` · ${analyst}` : ''}</span>
            <button className="nb-mark" disabled={unread.length === 0} onClick={() => markRead(unread.map((n) => n.id))}>
              Mark all as read
            </button>
          </div>

          <div className="nb-list">
            {groups.length === 0 && <p className="nb-empty">Nothing for this view yet.</p>}
            {groups.map((g) => (
              <section key={g.label}>
                <h3 className="nb-group">{g.label}</h3>
                <ul>
                  {g.items.map((n) => (
                    <li key={n.id}>
                      <button className={`nb-item ${isRead(n) ? '' : 'nb-item--unread'}`} onClick={() => go(n)}>
                        <TypeIcon type={n.type} />
                        <span className="nb-body">
                          <span className="nb-item-title">{notificationTitle(n, me)}</span>
                          <span className="nb-detail">{n.detail}</span>
                        </span>
                        <span className="nb-time">{relativeTime(n.at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="nb-foot">
            In production these also post to each market’s Slack channel ({Object.values(SLACK_CHANNELS).slice(0, 2).join(', ')}, …).
          </p>
        </div>
      )}
    </div>
  );
}

import { createContext, useContext } from 'react';
import { ASSETS } from './assets';
import { ANALYSTS, SEED_COMMENTS, mentionsIn } from './comments';
import { daysRemaining, hoursAgo } from './dates';
import { ANALYST_BY_MARKET } from './markProposals';
import { MARKS_MANAGER } from './markReview';
import type { Role } from './role';
import {
  assetsByStage,
  assetsNeedingApproval,
  constructionMarginImpact,
  constructionStatus,
  constructionSummary,
  staleListings,
  underwritingBoard,
} from './selectors';
import type { Asset } from '../types';

// ── In-app notifications ───────────────────────────────────────
// Seeded from real states in the data (marks over $10K, the stale LA listing,
// over-budget builds, inspection windows, drafts ready, a Growth handoff and
// two comment @mentions), plus live ones added during the session. In
// production each one also posts to its market's Slack channel (integrations.ts).

export type NotificationType = 'ai' | 'approval' | 'handoff' | 'deadline' | 'mention';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  detail: string;
  assetId: string;
  to: string;           // the exact page to open
  at: string;           // ISO
  read: boolean;        // seeded read state; session reads are tracked by the store
  roles: Role[];        // which View as roles see it
  analyst?: string;     // in Analyst view, only this analyst sees it
  mention?: { by: string; recipient: string };
}

/** Who "you" are in each view: the analyst, or the marks manager. Executives aren't mentioned. */
export function viewer(role: Role, analyst: string): string | undefined {
  if (role === 'analyst') return analyst;
  if (role === 'manager') return MARKS_MANAGER;
  return undefined;
}

export function visibleTo(n: AppNotification, role: Role, analyst: string): boolean {
  if (!n.roles.includes(role)) return false;
  return role !== 'analyst' || !n.analyst || n.analyst === analyst;
}

/** "Elena Ruiz mentioned you" in the recipient's own view; the name otherwise. */
export function notificationTitle(n: AppNotification, me: string | undefined): string {
  if (!n.mention) return n.title;
  return `${n.mention.by} mentioned ${n.mention.recipient === me ? 'you' : n.mention.recipient}`;
}

/** Who sees a mention: the analyst it names, and managers (who oversee the team). */
export function mentionAudience(recipient: string): Pick<AppNotification, 'roles' | 'analyst'> {
  return ANALYSTS.includes(recipient) ? { roles: ['analyst', 'manager'], analyst: recipient } : { roles: ['manager'] };
}

// ── Formatting ─────────────────────────────────────────────────
function usdK(n: number, signed = false) {
  const sign = n < 0 ? '−' : signed ? '+' : '';
  return `${sign}$${(Math.abs(n) / 1000).toFixed(1).replace(/\.0$/, '')}K`;
}

function asset(id: string): Asset {
  return ASSETS.find((a) => a.id === id)!;
}

function at(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

// ── Seeds ──────────────────────────────────────────────────────
// Hours-ago offsets keep "Today" items in the past whatever time the demo runs.
const APPROVAL_HOURS = [2, 5, 26];
const OVER_BUDGET_HOURS = [8, 30];
const INSPECTION_HOURS = [1.5, 4, 28];

function buildSeeds(): AppNotification[] {
  const seeds: AppNotification[] = [];

  // Marks over $10K waiting on the manager
  assetsNeedingApproval().forEach((a, i) => {
    const p = a.markProposal!;
    seeds.push({
      id: `approval-${a.id}`,
      type: 'approval',
      title: `Mark needs approval: ${a.address}`,
      detail: `April mark moves ${usdK(p.change, true)}, over the $10K line. Proposed by ${p.analyst}.`,
      assetId: a.id,
      to: '/marks',
      at: hoursAgo(APPROVAL_HOURS[i] ?? 30),
      read: i >= 2,
      roles: ['manager', 'analyst'],
      analyst: p.analyst,
    });
  });

  // The stale LA listing
  const stale = staleListings().find((a) => a.market === 'LA');
  if (stale) {
    seeds.push({
      id: `stale-${stale.id}`,
      type: 'deadline',
      title: `Listing gone stale: ${stale.address}`,
      detail: `${stale.listing!.daysOnMarket} days on market, ${stale.listing!.showings} showings and no offers. AI recommends a price drop.`,
      assetId: stale.id,
      to: '/for-sale',
      at: hoursAgo(3),
      read: false,
      roles: ['analyst', 'manager', 'executive'],
      analyst: ANALYST_BY_MARKET[stale.market],
    });
  }

  // Over-budget builds
  assetsByStage().construction
    .filter((a) => constructionStatus(a) === 'over_budget' || constructionStatus(a) === 'both')
    .forEach((a, i) => {
      const s = constructionSummary(a)!;
      const pts = constructionMarginImpact(a)?.marginPts;
      seeds.push({
        id: `budget-${a.id}`,
        type: 'ai',
        title: `Over budget: ${a.address}`,
        detail: `AI estimate at completion is ${usdK(s.variance, true)} (${s.variancePct}%) over budget${pts !== undefined && pts !== 0 ? `, ${pts < 0 ? '−' : '+'}${Math.abs(pts).toFixed(1)} pts of margin` : ''}.`,
        assetId: a.id,
        to: `/asset/${a.id}`,
        at: hoursAgo(OVER_BUDGET_HOURS[i] ?? 40),
        read: i >= 1,
        roles: ['manager', 'executive'],
      });
    });

  // Inspection windows closing, soonest first
  assetsByStage().under_contract
    .filter((a) => a.contract)
    .sort((a, b) => a.contract!.inspectionExpires.localeCompare(b.contract!.inspectionExpires))
    .forEach((a, i) => {
      const days = daysRemaining(a.contract!.inspectionExpires);
      seeds.push({
        id: `inspection-${a.id}`,
        type: 'deadline',
        title: `Inspection ends in ${days} ${days === 1 ? 'day' : 'days'}: ${a.address}`,
        detail: 'Diligence sign-offs still open before the window closes.',
        assetId: a.id,
        to: `/contract/${a.id}`,
        at: hoursAgo(INSPECTION_HOURS[i] ?? 30),
        read: i >= 2,
        roles: ['analyst', 'manager', 'executive'],
        analyst: ANALYST_BY_MARKET[a.market],
      });
    });

  // Drafts that finished and are waiting on their analyst
  underwritingBoard().draft_ready.forEach((a) => {
    seeds.push({
      id: `draft-${a.id}`,
      type: 'ai',
      title: `AI draft ready: ${a.address}`,
      detail: `Full underwrite drafted and assigned to ${a.analyst}. Confirm each section, then submit to Growth.`,
      assetId: a.id,
      to: `/underwrite/${a.id}/draft`,
      at: at(a.underwritingSince!, 9),
      read: false,
      roles: ['analyst', 'manager'],
      analyst: a.analyst,
    });
  });

  // A lot submitted to Growth that came back with an AE counter
  const submitted = underwritingBoard().submitted_to_growth
    .filter((a) => a.underwrite)
    .sort((a, b) => b.underwritingSince!.localeCompare(a.underwritingSince!))[0];
  if (submitted) {
    const uw = submitted.underwrite!;
    const counter = Math.round((uw.landPrice * 1.06) / 5000) * 5000;
    seeds.push({
      id: `handoff-${submitted.id}`,
      type: 'handoff',
      title: `AE counter on ${submitted.address}`,
      detail: `Submitted to Growth at ${usdK(uw.landPrice)}; the AE relayed a seller counter at ${usdK(counter)} (${usdK(counter - uw.landPrice, true)}).`,
      assetId: submitted.id,
      to: `/asset/${submitted.id}`,
      at: hoursAgo(20),
      read: false,
      roles: ['analyst', 'manager', 'executive'],
      analyst: submitted.analyst,
    });
  }

  // @mentions in the seeded comment threads
  for (const c of SEED_COMMENTS) {
    for (const recipient of mentionsIn(c.text)) {
      seeds.push({
        id: `mention-${c.id}-${recipient}`,
        type: 'mention',
        title: `${c.author} mentioned ${recipient}`,
        detail: c.text,
        assetId: c.assetId,
        to: `/asset/${c.assetId}#comments`,
        at: c.at,
        read: false,
        mention: { by: c.author, recipient },
        ...mentionAudience(recipient),
      });
    }
  }

  return seeds.sort((a, b) => b.at.localeCompare(a.at));
}

export const SEED_NOTIFICATIONS: AppNotification[] = buildSeeds();

/** Address for live notifications. */
export function assetAddress(id: string): string {
  return asset(id).address;
}

// ── React context ──────────────────────────────────────────────
export type NewNotification = Omit<AppNotification, 'id' | 'at' | 'read'> & { at?: string };

export interface NotificationStore {
  notifications: AppNotification[]; // newest first
  isRead: (n: AppNotification) => boolean;
  markRead: (ids: string[]) => void;
  notify: (n: NewNotification) => void;
}

export const NotificationContext = createContext<NotificationStore>({
  notifications: SEED_NOTIFICATIONS,
  isRead: (n) => n.read,
  markRead: () => {},
  notify: () => {},
});

export function useNotifications(): NotificationStore {
  return useContext(NotificationContext);
}

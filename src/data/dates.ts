// ── Demo clock ─────────────────────────────────────────────────
// Fixed "today" for the demo so countdowns and day counts are stable.
// Apr 18 against BOOL-001's Apr 24 inspection expiry lands at 6 days remaining.
export const DEMO_TODAY = '2026-04-18T00:00:00Z';

const DAY_MS = 86_400_000;

/** Whole days from `from` until `until`, floored at 0. */
export function daysRemaining(until: string, from: string = DEMO_TODAY): number {
  return Math.max(0, Math.round((new Date(until).getTime() - new Date(from).getTime()) / DAY_MS));
}

/** Whole days elapsed since `since`, as of `from`, floored at 0. */
export function daysSince(since: string, from: string = DEMO_TODAY): number {
  return daysRemaining(from, since);
}

/** The demo date at the current local time of day, for timestamps logged in-session. */
export function demoNow(): string {
  const today = new Date(DEMO_TODAY);
  const now = new Date();
  return new Date(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  ).toISOString();
}

/** A time `hours` before the demo's current moment, for seeded activity. */
export function hoursAgo(hours: number, now: string = demoNow()): string {
  return new Date(new Date(now).getTime() - hours * 3_600_000).toISOString();
}

/** Whether a timestamp falls on the demo's "today" (local calendar day). */
export function isDemoToday(iso: string, now: string = demoNow()): boolean {
  return new Date(iso).toDateString() === new Date(now).toDateString();
}

/** "just now", "12m ago", "3h ago", "Yesterday", "4d ago". */
export function relativeTime(iso: string, now: string = demoNow()): string {
  const mins = Math.max(0, Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (isDemoToday(iso, now)) return `${Math.floor(mins / 60)}h ago`;
  const yesterday = new Date(new Date(now).getTime() - DAY_MS).toDateString();
  if (new Date(iso).toDateString() === yesterday) return 'Yesterday';
  return `${Math.max(2, Math.round(mins / 1440))}d ago`;
}

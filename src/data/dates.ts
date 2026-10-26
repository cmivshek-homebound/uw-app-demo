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

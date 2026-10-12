import { toDate } from './recurrence';

/**
 * "Mark Complete" opens ONE DAY before the due date's month begins
 * (i.e. on the last day of the previous month). A task due Nov 1 can be completed from Oct 31.
 * Tasks due this month — or overdue from an earlier month — can always be completed.
 * If the due date is unknown we don't block anything.
 */
export function completionOpensOn(dueDate: unknown): Date | null {
  const d = toDate(dueDate);
  if (!d) return null;
  // Day 0 of the due month = last day of the previous month.
  return new Date(d.getFullYear(), d.getMonth(), 0, 0, 0, 0, 0);
}

export function canCompleteNow(dueDate: unknown, now: Date = new Date()): boolean {
  const opens = completionOpensOn(dueDate);
  if (!opens) return true;
  return now.getTime() >= opens.getTime();
}

/** The first day Mark Complete becomes available, e.g. "Oct 31". */
export function completionOpensLabel(dueDate: unknown): string {
  const opens = completionOpensOn(dueDate);
  if (!opens) return '';
  return opens.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

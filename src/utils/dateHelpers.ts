/**
 * Shared date helper utilities for task due dates and scheduling rules.
 */

/**
 * Shifts a given date to Friday if it falls on a weekend:
 * - Saturday (day 6): subtracts 1 day (moves to Friday)
 * - Sunday (day 0): subtracts 2 days (moves to Friday)
 * - Otherwise (Monday through Friday): returns the date unchanged.
 */
export function shiftToFridayIfWeekend(date: Date): Date {
  const result = new Date(date.getTime());
  const day = result.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 6) {
    result.setDate(result.getDate() - 1);
  } else if (day === 0) {
    result.setDate(result.getDate() - 2);
  }
  return result;
}

/**
 * Returns true if the date falls on Saturday or Sunday.
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Safely parses input date strings from <input type="date"> (YYYY-MM-DD)
 * or <input type="datetime-local"> (YYYY-MM-DDTHH:mm) into a local Date object.
 */
export function parseInputDate(value: string, endOfDay = true): Date | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // YYYY-MM-DD format (standard date picker)
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const day = parseInt(dateMatch[3], 10);
    return endOfDay
      ? new Date(year, month, day, 23, 59, 59, 999)
      : new Date(year, month, day, 0, 0, 0, 0);
  }

  // YYYY-MM-DDTHH:mm format (datetime-local picker)
  const dateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(trimmed);
  if (dateTimeMatch) {
    const year = parseInt(dateTimeMatch[1], 10);
    const month = parseInt(dateTimeMatch[2], 10) - 1;
    const day = parseInt(dateTimeMatch[3], 10);
    const hours = parseInt(dateTimeMatch[4], 10);
    const minutes = parseInt(dateTimeMatch[5], 10);
    return new Date(year, month, day, hours, minutes, 0, 0);
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a Date object into a readable date string (e.g., "Sep 19, 2026").
 */
export function formatNoticeDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

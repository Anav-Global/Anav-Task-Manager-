import type { TaskFrequency, Task, TaskTemplate } from '../types';
import { shiftToFridayIfWeekend, parseInputDate } from './dateHelpers';

/**
 * Safely converts any Firestore timestamp, string, or Date to a JavaScript Date object.
 */
export function toDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val.toMillis === 'function') return new Date(val.toMillis());
  if (val.seconds !== undefined) return new Date(val.seconds * 1000 + (val.nanoseconds ? val.nanoseconds / 1e6 : 0));
  if (typeof val === 'string') {
    const parsedInput = parseInputDate(val);
    if (parsedInput) return parsedInput;
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Determines whether a task is overdue at render time.
 * Overdue is defined strictly as: status === "pending" AND due_date is before today (or now).
 * NEVER written as a stored field in Firestore.
 */
export function isTaskOverdue(task: Task): boolean {
  if (task.status !== 'pending') return false;
  const dueDate = toDate(task.due_date);
  if (!dueDate) return false;
  return dueDate.getTime() < Date.now();
}

/**
 * Returns the number of days in the specified month of the given year.
 * @param year e.g. 2026
 * @param month 0-indexed (0 = Jan, 1 = Feb, ..., 11 = Dec)
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Clamps a day-of-month (e.g. 31) to the maximum valid day in that target month.
 * e.g., Day 31 in February 2026 becomes 28.
 * Day 31 in April 2026 becomes 30.
 */
export function clampDayToMonth(year: number, month: number, desiredDay: number): number {
  const maxDays = getDaysInMonth(year, month);
  return Math.min(Math.max(1, desiredDay), maxDays);
}

/**
 * Checks if two Date objects correspond to the same calendar day (year, month, date).
 */
export function isSameCalendarDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Checks whether a task instance already exists for this template with the exact due date.
 */
export function hasTaskWithExactDueDate(templateId: string, tasks: Task[], targetDate: Date): boolean {
  return tasks.some((t) => {
    if (t.template_id !== templateId) return false;
    const d = toDate(t.due_date);
    return d ? isSameCalendarDay(d, targetDate) : false;
  });
}

/**
 * Determines the intended month and year of a task instance's due date.
 * If anchorDay is 1 or 2 and the date shifted into the previous month's Friday (>= 27),
 * the intended month was actually month + 1.
 */
export function getIntendedMonthAndYear(latestDate: Date, anchorDay: number): { year: number; month: number } {
  let year = latestDate.getFullYear();
  let month = latestDate.getMonth();
  if (anchorDay <= 2 && latestDate.getDate() >= 27) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return { year, month };
}

/**
 * Computes next monthly/quarterly/yearly due date using anchor day and clamping.
 */
export function computeNextMonthlyDueDate(
  latestDate: Date,
  monthsToAdd: number,
  anchorDay: number
): Date {
  const { year, month } = getIntendedMonthAndYear(latestDate, anchorDay);
  const totalMonths = month + monthsToAdd;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const clampedDay = clampDayToMonth(targetYear, targetMonth, anchorDay);
  return new Date(targetYear, targetMonth, clampedDay, 23, 59, 59, 999);
}

/**
 * Computes next daily due date (+1 day).
 */
export function computeNextDailyDueDate(latestDate: Date): Date {
  const next = new Date(latestDate.getTime());
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Computes next weekly due date (+7 days).
 */
export function computeNextWeeklyDueDate(latestDate: Date): Date {
  const next = new Date(latestDate.getTime());
  next.setDate(next.getDate() + 7);
  return next;
}

/**
 * Computes all missing due dates that need task instances created for an active template.
 * Walk forward from the anchor date (or anchor_day_1/anchor_day_2 for semi-monthly)
 * by repeatedly adding the frequency's period.
 * For EACH computed due date up to and including the FIRST one that is greater than or equal
 * to today's date:
 *   - apply shiftToFridayIfWeekend()
 *   - check if a task instance already exists for this template_id with that exact due_date
 *   - if not, create it
 *
 * This generates all past missed cycles as overdue tasks, AND ensures the next upcoming cycle
 * (even if a few days in the future) is generated immediately without waiting for its due date.
 * The walk stops immediately after the first future-or-today due date.
 */
export function computeMissingDueDatesForTemplate(
  template: TaskTemplate,
  existingTasks: Task[],
  now: Date = new Date()
): Date[] {
  if (!template.active) return [];

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const isGreaterOrEqualToToday = (date: Date): boolean => {
    const calDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    return calDate.getTime() >= startOfToday.getTime();
  };

  const missingDueDates: Date[] = [];
  const simulatedTasks: Task[] = existingTasks.filter((t) => t.template_id === template.id);

  // Semi-Monthly
  if (template.frequency === 'semi_monthly') {
    const day1 = template.anchor_day_1;
    const day2 = template.anchor_day_2;
    if (!day1 && !day2) return [];

    const rawDays = [day1, day2].filter(
      (d): d is number => typeof d === 'number' && d >= 1 && d <= 31
    );
    if (rawDays.length === 0) return [];
    const anchorDays = Array.from(new Set(rawDays)).sort((a, b) => a - b);

    // Determine starting reference date
    let anchorDate = toDate(template.anchor_date);
    if (!anchorDate) {
      let earliestTaskDate: Date | null = null;
      for (const t of simulatedTasks) {
        const d = toDate(t.due_date);
        if (d && (!earliestTaskDate || d < earliestTaskDate)) {
          earliestTaskDate = d;
        }
      }
      anchorDate = earliestTaskDate || toDate(template.created_at) || now;
    }

    const startYear = anchorDate.getFullYear();
    const startMonth = anchorDate.getMonth();
    const startOfAnchor = new Date(
      anchorDate.getFullYear(),
      anchorDate.getMonth(),
      anchorDate.getDate(),
      0,
      0,
      0,
      0
    );

    let monthOffset = 0;
    let stopped = false;
    const MAX_MONTHS = 240; // Guard against runaway loops (20 years)

    while (monthOffset < MAX_MONTHS && !stopped) {
      const currentTotalMonths = startMonth + monthOffset;
      const targetYear = startYear + Math.floor(currentTotalMonths / 12);
      const targetMonth = ((currentTotalMonths % 12) + 12) % 12;

      for (const day of anchorDays) {
        const clampedDay = clampDayToMonth(targetYear, targetMonth, day);
        const computedDueDate = new Date(targetYear, targetMonth, clampedDay, 23, 59, 59, 999);

        // Skip any computed date earlier than the anchor date
        if (computedDueDate.getTime() < startOfAnchor.getTime()) {
          continue;
        }

        // Apply shiftToFridayIfWeekend()
        const finalDueDate = shiftToFridayIfWeekend(computedDueDate);

        // Check if task instance already exists for this template with exact due date
        if (!hasTaskWithExactDueDate(template.id, simulatedTasks, finalDueDate)) {
          missingDueDates.push(finalDueDate);
          simulatedTasks.push({
            id: `sim-${template.id}-${finalDueDate.getTime()}`,
            client_id: template.client_id,
            template_id: template.id,
            title: template.title,
            assigned_to: template.assigned_to,
            due_date: finalDueDate,
            status: 'pending',
            created_by: 'system-recurrence',
            created_at: now,
          });
        }

        // Stopping condition: Stop the walk once we've processed up to and including
        // the FIRST computed due date that is greater than or equal to today's date
        if (isGreaterOrEqualToToday(computedDueDate)) {
          stopped = true;
          break;
        }
      }

      monthOffset++;
    }

    return missingDueDates;
  }

  // Weekly, Monthly, Quarterly, Yearly
  let anchorDate = toDate(template.anchor_date);
  if (!anchorDate) {
    anchorDate = toDate(template.created_at) || now;
  }

  const baseYear = anchorDate.getFullYear();
  const baseMonth = anchorDate.getMonth();
  const anchorDay = anchorDate.getDate();

  let step = 0;
  const MAX_CYCLES = 500; // Safeguard against infinite loops

  while (step < MAX_CYCLES) {
    let computedDueDate: Date;

    if (template.frequency === 'daily') {
      computedDueDate = new Date(baseYear, baseMonth, anchorDay + step, 23, 59, 59, 999);
    } else if (template.frequency === 'weekly') {
      computedDueDate = new Date(baseYear, baseMonth, anchorDay + step * 7, 23, 59, 59, 999);
    } else if (template.frequency === 'monthly') {
      const totalMonths = baseMonth + step;
      const targetYear = baseYear + Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12;
      const clampedDay = clampDayToMonth(targetYear, targetMonth, anchorDay);
      computedDueDate = new Date(targetYear, targetMonth, clampedDay, 23, 59, 59, 999);
    } else if (template.frequency === 'quarterly') {
      const totalMonths = baseMonth + step * 3;
      const targetYear = baseYear + Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12;
      const clampedDay = clampDayToMonth(targetYear, targetMonth, anchorDay);
      computedDueDate = new Date(targetYear, targetMonth, clampedDay, 23, 59, 59, 999);
    } else if (template.frequency === 'yearly') {
      const targetYear = baseYear + step;
      const clampedDay = clampDayToMonth(targetYear, baseMonth, anchorDay);
      computedDueDate = new Date(targetYear, baseMonth, clampedDay, 23, 59, 59, 999);
    } else {
      const totalMonths = baseMonth + step;
      const targetYear = baseYear + Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12;
      const clampedDay = clampDayToMonth(targetYear, targetMonth, anchorDay);
      computedDueDate = new Date(targetYear, targetMonth, clampedDay, 23, 59, 59, 999);
    }

    // Apply shiftToFridayIfWeekend()
    const finalDueDate = shiftToFridayIfWeekend(computedDueDate);

    // Check if task instance already exists for this template with exact due date
    if (!hasTaskWithExactDueDate(template.id, simulatedTasks, finalDueDate)) {
      missingDueDates.push(finalDueDate);
      simulatedTasks.push({
        id: `sim-${template.id}-${finalDueDate.getTime()}`,
        client_id: template.client_id,
        template_id: template.id,
        title: template.title,
        assigned_to: template.assigned_to,
        due_date: finalDueDate,
        status: 'pending',
        created_by: 'system-recurrence',
        created_at: now,
      });
    }

    // Stopping condition: Stop the walk once we've processed up to and including
    // the FIRST computed due date that is greater than or equal to today's date
    if (isGreaterOrEqualToToday(computedDueDate)) {
      break;
    }

    step++;
  }

  return missingDueDates;
}

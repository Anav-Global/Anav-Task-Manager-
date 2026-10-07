/**
 * Task assigned_to is a single user ID in this app, but a list is also tolerated
 * (so data written as an array never breaks the screens). Always go through these.
 */
export function assigneeIdsOf(task: { assigned_to?: unknown }): string[] {
  const v = task.assigned_to;
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  }
  return typeof v === 'string' && v ? [v] : [];
}

export function isAssignee(task: { assigned_to?: unknown }, uid: string | null | undefined): boolean {
  return !!uid && assigneeIdsOf(task).includes(uid);
}

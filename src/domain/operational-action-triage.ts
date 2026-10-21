export type OperationalActionCandidate = {
  dueAt: string | Date | null;
  createdAt: string | Date;
  ownerPersonId: string | null;
  priority: string;
  status: string;
};

export type OperationalActionUrgency = "overdue" | "due_soon" | "upcoming" | "unscheduled";

const priorityRank: Record<string, number> = {
  critical: 0,
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};
const urgencyRank: Record<OperationalActionUrgency, number> = {
  overdue: 0,
  due_soon: 1,
  upcoming: 2,
  unscheduled: 3,
};

function timestamp(value: string | Date, field: string): number {
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid operational action ${field}.`);
  return result;
}

export function triageOperationalActions<T extends OperationalActionCandidate>(
  actions: T[],
  now = new Date(),
) {
  const instant = now.getTime();
  if (!Number.isFinite(instant)) throw new Error("Invalid operational action triage time.");
  const nextDay = instant + 24 * 60 * 60 * 1000;
  const ranked = actions.map(action => {
    const dueAt = action.dueAt === null ? null : timestamp(action.dueAt, "due date");
    const createdAt = timestamp(action.createdAt, "creation date");
    const urgency: OperationalActionUrgency = dueAt === null ? "unscheduled" :
      dueAt < instant ? "overdue" : dueAt <= nextDay ? "due_soon" : "upcoming";
    return { action, dueAt, createdAt, urgency };
  });
  ranked.sort((left, right) =>
    urgencyRank[left.urgency] - urgencyRank[right.urgency] ||
    (priorityRank[left.action.priority] ?? 2) - (priorityRank[right.action.priority] ?? 2) ||
    (left.dueAt ?? Number.POSITIVE_INFINITY) - (right.dueAt ?? Number.POSITIVE_INFINITY) ||
    left.createdAt - right.createdAt,
  );

  return {
    items: ranked.map(({ action, urgency }) => ({ ...action, urgency })),
    summary: {
      overdue: ranked.filter(item => item.urgency === "overdue").length,
      dueWithin24Hours: ranked.filter(item => item.urgency === "due_soon").length,
      unassigned: ranked.filter(item => !item.action.ownerPersonId).length,
    },
  };
}

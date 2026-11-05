import type { AccessContext } from "./access-context";

export function attendanceQueueIdentity(actor: AccessContext): string {
  return JSON.stringify([actor.accountId, actor.grantId, actor.actorPersonId, actor.role,
    [...actor.scope.organizationIds ?? []].sort(), [...actor.scope.siteIds ?? []].sort(),
    [...actor.scope.programIds ?? []].sort()]);
}

export type OfflineAttendanceMark = {
  studentProfileId: string; programId: string; date: string;
  status: "present" | "absent" | "tardy"; mutationId: string; note: string;
  expectedPreviousEventId?: string | null; queueContext: string;
};

export function attendanceQueueKey(identity: string, siteId: string, programId: string): string {
  return "can-os:attendance:pending:v3:" + encodeURIComponent(JSON.stringify([identity, siteId, programId]));
}

export function readAttendanceQueue(storage: Pick<Storage, "getItem">, key: string,
  identity: string, programId: string): OfflineAttendanceMark[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((value): value is OfflineAttendanceMark =>
      value?.queueContext === identity && value.programId === programId &&
      typeof value.studentProfileId === "string" && typeof value.date === "string" &&
      ["present", "absent", "tardy"].includes(value.status) &&
      typeof value.mutationId === "string" && typeof value.note === "string").slice(0, 500);
  } catch { return []; }
}
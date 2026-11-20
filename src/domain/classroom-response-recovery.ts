/** Short-lived tab-only recovery of an unconfirmed formative submission.
 * This is NOT offline evidence. CAN account handoffs clear all can-* storage. */
export type PendingClassroomResponse = {
  clientSubmissionId: string;
  clientInstanceId: string;
  answer: string;
  savedAt: number;
};
export const classroomPendingTtlMs = 15 * 60_000;
export function classroomPendingKey(courseAttemptId: string, roomId: string, releaseId: string) {
  return "can-classroom-pending:" + courseAttemptId + ":" + roomId + ":" + releaseId;
}
export function readPendingClassroomResponse(storage: Pick<Storage, "getItem" | "removeItem">,
  key: string, now = Date.now()): PendingClassroomResponse | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") { storage.removeItem(key); return null; }
    const item = value as Partial<PendingClassroomResponse>;
    if (typeof item.clientSubmissionId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(item.clientSubmissionId) ||
      typeof item.clientInstanceId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(item.clientInstanceId) ||
      typeof item.answer !== "string" || item.answer.length > 1000 ||
      typeof item.savedAt !== "number" || !Number.isFinite(item.savedAt) ||
      item.savedAt > now || now - item.savedAt > classroomPendingTtlMs) {
      storage.removeItem(key); return null;
    }
    return item as PendingClassroomResponse;
  } catch {
    try { storage.removeItem(key); } catch { /* storage unavailable */ }
    return null;
  }
}
export function writePendingClassroomResponse(storage: Pick<Storage,"setItem">,
  key: string, data: PendingClassroomResponse) {
  try { storage.setItem(key, JSON.stringify(data)); return true; } catch { return false; }
}
export function clearPendingClassroomResponse(storage: Pick<Storage,"removeItem">, key: string) {
  try { storage.removeItem(key); } catch { /* storage access may be disabled */ }
}

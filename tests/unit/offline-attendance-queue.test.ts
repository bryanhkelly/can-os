import { describe, expect, it } from "vitest";
import {
  enqueueOfflineAttendanceMark, readOfflineAttendanceQueue, removeOfflineAttendanceMarks,
  replaceOfflineAttendanceMark, writeOfflineAttendanceQueue, type OfflineAttendanceMark,
} from "@/modules/attendance/offline-attendance-queue";

const key = "can-os:attendance:pending:v2";
const firstMark: OfflineAttendanceMark = {
  studentProfileId: "10000000-0000-4000-8000-000000000001",
  programId: "20000000-0000-4000-8000-000000000002",
  date: "2026-10-19", status: "absent",
  mutationId: "30000000-0000-4000-8000-000000000003", note: "",
  expectedPreviousEventId: null,
};

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: (requestedKey: string) => requestedKey === key ? value : null,
    setItem: (requestedKey: string, next: string) => {
      if (requestedKey === key) value = next;
    },
    value: () => value,
  };
}

describe("offline attendance queue", () => {
  it("preserves unreadable or invalid queues instead of silently clearing them", () => {
    for (const raw of ["{", "{}", JSON.stringify([{
      ...firstMark, date: "2026-02-30",
    }])]) {
      const storage = memoryStorage(raw);
      const result = readOfflineAttendanceQueue(storage);
      expect(result.marks).toEqual([]);
      expect(result.error).toMatch(/queue/i);
      expect(storage.value()).toBe(raw);
      expect(() => enqueueOfflineAttendanceMark(storage, firstMark)).toThrow(/preserved/i);
      expect(storage.value()).toBe(raw);
    }
  });

  it("rejects oversized queues without truncating persisted entries", () => {
    const marks = Array.from({ length: 501 }, (_, index) => ({
      ...firstMark,
      mutationId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    const storage = memoryStorage(JSON.stringify(marks));
    expect(readOfflineAttendanceQueue(storage).error).toMatch(/too many/i);
    expect(storage.value()).toBe(JSON.stringify(marks));
  });

  it("enqueues idempotently and retains entries added before completed sync marks are removed", () => {
    const storage = memoryStorage();
    expect(enqueueOfflineAttendanceMark(storage, firstMark)).toEqual([firstMark]);
    expect(enqueueOfflineAttendanceMark(storage, firstMark)).toEqual([firstMark]);
    const laterMark = { ...firstMark, mutationId: "30000000-0000-4000-8000-000000000004" };
    enqueueOfflineAttendanceMark(storage, laterMark);
    expect(removeOfflineAttendanceMarks(storage, new Set([firstMark.mutationId]))).toEqual([laterMark]);
  });

  it("replaces a conflicted mark without dropping other pending changes", () => {
    const storage = memoryStorage();
    const laterMark = { ...firstMark, mutationId: "30000000-0000-4000-8000-000000000004" };
    enqueueOfflineAttendanceMark(storage, firstMark);
    enqueueOfflineAttendanceMark(storage, laterMark);
    const replacement = { ...firstMark, status: "present" as const,
      mutationId: "30000000-0000-4000-8000-000000000005" };
    expect(replaceOfflineAttendanceMark(storage, firstMark.mutationId, replacement))
      .toEqual([replacement, laterMark]);
  });

  it("surfaces storage write failures instead of claiming that an entry was saved", () => {
    expect(() => writeOfflineAttendanceQueue({
      setItem: () => { throw new Error("quota exceeded"); },
    }, [firstMark])).toThrow(/not saved/i);
  });
});

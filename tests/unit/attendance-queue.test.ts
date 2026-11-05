import { describe, expect, it } from "vitest";
import { attendanceQueueIdentity, attendanceQueueKey, readAttendanceQueue } from "@/domain/attendance-queue";
import { resolveAccessContext } from "@/domain/access-context";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";

const identity = (accountId: string, siteId: string) => attendanceQueueIdentity(resolveAccessContext(
  { accountId, sessionId: "session", activeGrantId: "grant:" + siteId },
  [{ id: "grant:" + siteId, accountId, personId: "person:" + accountId, role: "teacher", organizationId: "org:" + siteId, siteId, active: true }],
));
describe("offline attendance isolation", () => {
  it("partitions by account, grant, school and program", () => {
    const key = attendanceQueueKey(identity("a", "school-a"), "school-a", "program-a");
    expect(key).not.toBe(attendanceQueueKey(identity("b", "school-a"), "school-a", "program-a"));
    expect(key).not.toBe(attendanceQueueKey(identity("a", "school-b"), "school-b", "program-a"));
    expect(key).not.toBe(attendanceQueueKey(identity("a", "school-a"), "school-a", "program-b"));
  });
  it("never restores foreign account or school entries, even if copied into the current key", () => {
    const account = identity("a", "school-a");
    const mark = { studentProfileId: "student", programId: "program-a", date: "2026-11-04", status: "present", mutationId: "mutation", note: "", queueContext: account };
    const storage = { getItem: () => JSON.stringify([mark]) };
    expect(readAttendanceQueue(storage, "key", account, "program-a")).toEqual([mark]);
    expect(readAttendanceQueue(storage, "key", identity("b", "school-a"), "program-a")).toEqual([]);
    expect(readAttendanceQueue(storage, "key", identity("a", "school-b"), "program-a")).toEqual([]);
    expect(readAttendanceQueue(storage, "key", account, "program-b")).toEqual([]);
    expect(readAttendanceQueue({ getItem: () => "not json" }, "key", account, "program-a")).toEqual([]);
  });
  it("uses the New York school date while California is still on the previous day", () => {
    const now = new Date("2026-11-04T06:00:00Z");
    expect(dateKeyInTimezone(now, "America/New_York")).toBe("2026-11-04");
    expect(dateKeyInTimezone(now, "America/Los_Angeles")).toBe("2026-11-03");
  });
});
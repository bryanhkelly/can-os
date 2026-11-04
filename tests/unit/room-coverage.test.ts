import { describe, expect, it } from "vitest";
import { resolveAccessContext } from "@/domain/access-context";
import {
  assertRoomCoverageManager, roomCoverageOccurs, roomCoverageOverlaps, saveRoomCoverageSchema,
} from "@/domain/room-coverage";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const coverage = {
  siteId: id, id, expectedRevision: null, roomId: id, primaryPersonId: id,
  backupPersonId: otherId, startsOn: "2026-11-03", endsOn: "2026-12-03",
  weekdays: [2, 3, 4], startsAtLocal: "08:00", endsAtLocal: "14:00", sectionIds: [id, otherId],
};

describe("all-day mixed-course physical-room coverage", () => {
  it("uses Tuesday, Wednesday and Thursday in the school-local calendar", () => {
    expect(saveRoomCoverageSchema.parse(coverage)).toEqual(coverage);
    for (const date of ["2026-11-03", "2026-11-04", "2026-11-05", "2026-12-03"])
      expect(roomCoverageOccurs(coverage, date)).toBe(true);
    for (const date of ["2026-11-02", "2026-11-06", "2026-11-07", "2026-12-04"])
      expect(roomCoverageOccurs(coverage, date)).toBe(false);
  });

  it("covers the whole 08:00-14:00 shift and different virtual-course blocks, not adjacent time", () => {
    for (const [start, end] of [["08:00", "14:00"], ["09:00:00", "10:00:00"], ["13:00", "14:00:00"]])
      expect(roomCoverageOccurs(coverage, "2026-11-03", start, end)).toBe(true);
    for (const [start, end] of [["07:59", "09:00"], ["13:00", "14:00:01"], ["14:00", "15:00"],
      ["10:00", "09:00"], ["08:00", "08:00"], ["09:99", "10:00"]])
      expect(roomCoverageOccurs(coverage, "2026-11-03", start, end)).toBe(false);
  });

  it.each([
    { startsOn: "not-a-date" }, { endsOn: "2026-11-31" }, { endsOn: "2027-02-02" },
    { endsOn: "2026-11-02" }, { weekdays: [] }, { weekdays: [2, 2] }, { weekdays: [7] },
    { sectionIds: [id, id] }, { backupPersonId: id }, { endsAtLocal: "08:00" },
    { startsAtLocal: "24:00" }, { endsAtLocal: "14:60" },
  ])("rejects malformed, duplicate or unbounded planning input: %j", patch => {
    expect(saveRoomCoverageSchema.safeParse({ ...coverage, ...patch }).success).toBe(false);
  });

  it("allows incomplete planning without claiming operating approval", () => {
    expect(saveRoomCoverageSchema.safeParse({ ...coverage, backupPersonId: null, sectionIds: [] }).success).toBe(true);
    expect(saveRoomCoverageSchema.safeParse({ ...coverage, endsOn: "2027-02-01" }).success).toBe(true);
  });

  it("detects shared dates and weekdays rather than just overlapping term ranges", () => {
    expect(roomCoverageOverlaps(coverage, { ...coverage, startsAtLocal: "13:59", endsAtLocal: "15:00" })).toBe(true);
    expect(roomCoverageOverlaps(coverage, { ...coverage, weekdays: [1, 5] })).toBe(false);
    expect(roomCoverageOverlaps(coverage, { ...coverage, startsAtLocal: "14:00", endsAtLocal: "15:00" })).toBe(false);
    expect(roomCoverageOverlaps(coverage, { ...coverage, startsOn: "2026-12-04", endsOn: "2026-12-10" })).toBe(false);
  });

  it("requires the original exact-school admin membership without granting instructional authority", () => {
    const actor = resolveAccessContext({ accountId: id, sessionId: id, activeGrantId: id }, [{
      id, accountId: id, personId: id, role: "site_admin", organizationId: id, siteId: id, active: true,
    }]);
    expect(() => assertRoomCoverageManager(actor, { id, organizationId: id })).not.toThrow();
    expect(() => assertRoomCoverageManager(actor, { id: otherId, organizationId: id })).toThrow();
    expect(() => assertRoomCoverageManager({ ...actor, sessionAccountId: otherId }, { id, organizationId: id })).toThrow();
    expect(() => assertRoomCoverageManager({ ...actor, role: "room_facilitator" }, { id, organizationId: id })).toThrow();
    expect(() => assertRoomCoverageManager({ ...actor, capabilities: new Set() }, { id, organizationId: id })).toThrow();
  });
});

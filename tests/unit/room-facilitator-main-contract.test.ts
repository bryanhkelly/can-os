import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("room facilitator main workflow contract", () => {
  it("checks a requested school day consistently while keeping current staff verification", () => {
    const server = source("src/modules/operations/room-coverage.server.ts");
    expect(server).toContain("verifiedStaffIdentityPredicate()");
    expect(server).toContain("const day = date ?? siteDate(new Date(), site.timezone)");
    expect(server).toContain("row.startsOn <= day && row.endsOn >= day && roomCoverageOccurs(row, day)");
    expect(server).not.toContain("roomCoverageOccurs(row, date ?? day)");
  });

  it("reuses request identities for uncertain activity release and distinguishes saved writes from refresh failure", () => {
    const host = source("src/components/learning/ClassroomFacilitatorConsole.tsx");
    const attendance = source("src/components/learning/ClassroomAttendancePanel.tsx");
    expect(host).toContain("activityRequests.current.set(requestKey, requestId)");
    expect(host).toContain("useMutationFeedback(() => room.refetch({throwOnError:true}))");
    expect(host).toContain("feedback.refreshFailed");
    expect(host).toContain("Classroom action saved, but the current room state could not be refreshed");
    expect(attendance).toContain("classroomAttendanceNeedsExplanation({");
    expect(attendance).toContain("useMutationFeedback(()=>roster.refetch({throwOnError:true}))");
    expect(attendance).toContain("blocked=Boolean(busy)||feedback.refreshFailed");
    expect(attendance).toContain("Facilitator verification was saved, but the roster could not be refreshed");
  });

  it("uses shared V6.1 primitives in the physical room and custody workflows", () => {
    for (const path of [
      "src/components/operations/RoomCoverageWorkspace.tsx",
      "src/components/operations/OnsitePickupPanel.tsx",
      "src/components/operations/OnsiteRoomPlanningPanel.tsx",
      "src/components/operations/OnsiteDayReconciliationPanel.tsx",
    ]) {
      const panel = source(path);
      expect(panel).not.toMatch(/<select\b|<textarea\b/);
      expect(panel).not.toMatch(/\brounded(?:-[\w/]+)?\b/);
    }
  });
});

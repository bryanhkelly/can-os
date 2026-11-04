import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomCoverageWorkspace } from "@/components/operations/RoomCoverageWorkspace";

const state = vi.hoisted(() => ({ canManage: true, error: null as Error | null }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ isPending: false, error: state.error, refetch: vi.fn(),
    data: state.error ? undefined : {
      siteId: "site", timezone: "America/Los_Angeles", today: "2026-11-03", canManage: state.canManage,
      rooms: [{ id: "room", name: "Youth Classroom 2", capacity: 20, retiredAt: null, revision: 1 }],
      staff: [{ id: "facilitator", name: "Synthetic Facilitator" }], classes: [],
      schedules: [{ id: "coverage", roomId: "room", revision: 1, primaryPersonId: "facilitator",
        backupPersonId: null, startsOn: "2026-11-03", endsOn: "2026-12-03", weekdays: [2, 3, 4],
        startsAtLocal: "08:00", endsAtLocal: "14:00", sectionIds: [] }],
    } }),
}));
vi.mock("@/modules/operations/room-coverage.functions", () => ({
  getRoomCoverageWorkspaceFn: vi.fn(), createRoomAtSiteFn: vi.fn(), saveRoomCoverageFn: vi.fn(),
}));
beforeEach(() => { state.canManage = true; state.error = null; });

describe("physical-room coverage setup and facilitator view", () => {
  it("shows exact local shift, occupancy and incomplete safety/class setup before a Program exists", () => {
    const html = renderToStaticMarkup(<RoomCoverageWorkspace />);
    for (const text of ["Youth Classroom 2", "Tuesday, Wednesday, Thursday", "08:00-14:00",
      "America/Los_Angeles", "Room occupancy limit: 20", "Setup incomplete", "No classes linked yet",
      "not verified arrival", "independent", "Create a physical room", "Assign all-day room coverage",
      "For standalone schools, this is planning only"])
      expect(html.toLowerCase()).toContain(text.toLowerCase());
  });
  it("does not give the facilitator admin editing or teacher controls", () => {
    state.canManage = false;
    const html = renderToStaticMarkup(<RoomCoverageWorkspace />);
    expect(html).toContain("Youth Classroom 2");
    for (const text of ["Create a physical room", "Assign all-day room coverage", "Edit room assignment", "gradebook"])
      expect(html).not.toContain(text);
    expect(html).not.toContain("<form");
  });
  it("surfaces read failures instead of showing an empty successful setup", () => {
    state.error = new Error("School access changed");
    const html = renderToStaticMarkup(<RoomCoverageWorkspace />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry room coverage");
    expect(html).not.toContain("No room coverage assignments recorded");
  });
});

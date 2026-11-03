import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OnsiteRoomPlanningPanel } from "@/components/operations/OnsiteRoomPlanningPanel";
import type { getOnsiteRoomPlanningFn } from "@/modules/operations/onsite-room-plan.functions";

type Model = Awaited<ReturnType<typeof getOnsiteRoomPlanningFn>>;
const state = vi.hoisted(() => ({ model: null as Model | null }));
vi.mock("@/modules/operations/onsite-room-plan.functions", () => ({
  getOnsiteRoomPlanningFn: vi.fn(), submitOnsiteRoomPlanFn: vi.fn(), reviewOnsiteRoomPlanFn: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => {
    const [value, setValue] = actual.useState(initial);
    return [initial === null ? state.model : value, setValue];
  } };
});

beforeEach(() => {
  state.model = {
    programId: "program", siteId: "site", date: "2030-01-01", timezone: "UTC", canSubmit: true, canReview: false,
    rooms: [{ id: "active-room", name: "Library", capacity: 18, revision: 1, retiredAt: null }],
    blocks: [{ sectionId: "section", periodId: "period", periodLabel: "Morning",
      startsAtLocal: "09:00", endsAtLocal: "10:00", title: "Science", assignedRoomId: "retired-room",
      assignedPrimaryPersonId: null, staff: [], current: null }],
  };
});
describe("retired classrooms in daily planning", () => {
  it("shows a real empty selection rather than visually selecting a different active room", () => {
    const html = renderToStaticMarkup(<OnsiteRoomPlanningPanel programId="program" initialDate="2030-01-01"/>);
    expect(html).toContain('<option value="" selected="">Choose a saved school room</option>');
    expect(html).toContain("The previous classroom is retired or unavailable");
    expect(html).not.toContain('value="active-room" selected');
  });
  it("directs pending plans with changed or retired rooms back to school correction", () => {
    state.model!.blocks[0]!.current = {
      id: "plan", submittedByPersonId: "host", primaryPersonId: "primary", backupPersonId: "backup",
      roomId: "active-room", roomLabel: "Previous library name", roomCapacity: 18,
      rationale: "Original review evidence", substitutesForPersonId: null, expiresAt: null,
      status: "pending", reason: null, canReview: true,
    };
    const html = renderToStaticMarkup(<OnsiteRoomPlanningPanel programId="program" initialDate="2030-01-01"/>);
    expect(html).toContain("must submit");
    expect(html).toContain("corrected plan using an active room");
    expect(html).toContain("Rejection with correction instructions remains available");
  });
  it("does not relabel an already approved snapshot as an invalid pending plan", () => {
    state.model!.blocks[0]!.current = {
      id: "plan", submittedByPersonId: "host", primaryPersonId: "primary", backupPersonId: "backup",
      roomId: "retired-room", roomLabel: "Retired reviewed classroom", roomCapacity: 12,
      rationale: "Original review evidence", substitutesForPersonId: null, expiresAt: null,
      status: "approved", reason: null, canReview: false,
    };
    const html = renderToStaticMarkup(<OnsiteRoomPlanningPanel programId="program" initialDate="2030-01-01"/>);
    expect(html).toContain("Retired reviewed classroom");
    expect(html).not.toContain("This pending plan");
    expect(html).toContain("existing approved evidence is unchanged");
  });
});

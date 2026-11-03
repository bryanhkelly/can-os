import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SchoolRoomsSetup } from "@/components/operations/SchoolRoomsSetup";

const state = vi.hoisted(() => ({
  rooms: [
    { id: "active-room", name: "Library", capacity: 18, revision: 1, retiredAt: null as string | null },
    { id: "retired-room", name: "Old classroom", capacity: 12, revision: 2, retiredAt: "2030-01-01T00:00:00.000Z" as string | null },
  ],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { rooms: state.rooms, classes: [
    { id: "class", title: "Science", code: "SCI", roomId: "retired-room" },
  ] }, isPending: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/modules/operations/site-rooms.functions", () => ({
  assignSchoolSectionRoomFn: vi.fn(), createSchoolRoomFn: vi.fn(), getSchoolRoomsFn: vi.fn(),
  retireSchoolRoomFn: vi.fn(), updateSchoolRoomFn: vi.fn(),
}));

beforeEach(() => {
  state.rooms = [
    { id: "active-room", name: "Library", capacity: 18, revision: 1, retiredAt: null },
    { id: "retired-room", name: "Old classroom", capacity: 12, revision: 2, retiredAt: "2030-01-01T00:00:00.000Z" },
  ];
});
describe("classroom lifecycle setup", () => {
  it("retains retired rooms and makes their defaults explicit without allowing new selection", () => {
    const html = renderToStaticMarkup(<SchoolRoomsSetup programId="program" />);
    expect(html).toContain("Historical records are retained");
    expect(html).toContain("Old classroom (retired - replace or clear)");
    expect(html).toMatch(/<option value="retired-room" disabled="" selected=""/);
    expect(html).toContain('<option value="active-room">Library');
    expect(html).not.toContain("Edit or retire Old classroom");
    expect(html).toContain("Select an active room or clear the default");
  });
  it("requires a reason and explicit confirmation and explains Site-wide snapshot semantics", () => {
    const html = renderToStaticMarkup(<SchoolRoomsSetup programId="program" />);
    expect(html).toContain("Changes affect every Program at this Site");
    expect(html).toContain("not an emergency closure");
    expect(html).toContain("Reason for changing Library");
    expect(html).toContain('minLength="5"');
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retire Library<\/button>/);
    expect(html).toContain("Pending plans");
  });
  it("allows clearing defaults even when all rooms are retired", () => {
    state.rooms = state.rooms.filter(room => room.retiredAt);
    const html = renderToStaticMarkup(<SchoolRoomsSetup programId="program" />);
    expect(html).toContain("Classroom locations");
    expect(html).toContain('<option value="">Not assigned</option>');
    expect(html).not.toContain('value="active-room"');
  });
});

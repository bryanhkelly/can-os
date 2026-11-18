import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClassroomAttendancePanel } from "@/components/learning/ClassroomAttendancePanel";

const state = vi.hoisted(() => ({
  pairedDevice: false,
  latestStatus: "unknown",
  latestMethod: null as string | null,
  lastAssertedAt: null as string | null,
  attestationsOpen: true,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isPending: false, isError: false, isSuccess: true,
    refetch: vi.fn(),
    data: {
      members: [{
        courseAttemptId: "synthetic-attempt", displayName: "Synthetic Learner",
        source: "noncredit", pairedDevice: state.pairedDevice,
        latestStatus: state.latestStatus, latestMethod: state.latestMethod,
        lastAssertedAt: state.lastAssertedAt,
      }],
      attestationsOpen: state.attestationsOpen, partial: false,
    },
  }),
}));
vi.mock("@/modules/learning/classroom-attendance.functions", () => ({
  getClassroomAttendanceRoster: vi.fn(), attestClassroomParticipation: vi.fn(),
}));

describe("room facilitator's V6.1 attendance workspace", () => {
  beforeEach(() => {
    state.pairedDevice = false;
    state.latestStatus = "unknown";
    state.latestMethod = null;
    state.lastAssertedAt = null;
    state.attestationsOpen = true;
  });
  it("shows required direct-observation evidence for no-device participants", () => {
    state.pairedDevice = false;
    state.lastAssertedAt = null;
    state.attestationsOpen = true;
    const html = renderToStaticMarkup(
      <ClassroomAttendancePanel facilitatedSessionId="synthetic-room" />,
    );
    expect(html).toContain("Synthetic Learner");
    expect(html).toContain("No current device pairing");
    expect(html).toContain("at least 15 characters");
    expect(html).toContain("Verified present");
    expect(html).toContain("border-input");
    expect(html).toContain("focus-visible:ring-ring");
  });

  it("shows correction evidence guidance for a previously verified learner", () => {
    state.pairedDevice = true;
    state.latestStatus = "present";
    state.latestMethod = "in_person_roll_call";
    state.lastAssertedAt = "2026-11-17T09:00:00.000Z";
    const html = renderToStaticMarkup(
      <ClassroomAttendancePanel facilitatedSessionId="synthetic-room" />,
    );
    expect(html).toContain("An explanation of at least 15 characters");
    expect(html).toContain("Verified: present");
    expect(html).toContain("Device currently paired");
  });

  it("does not allow updates after the room correction window closes", () => {
    state.pairedDevice = true;
    state.lastAssertedAt = null;
    state.latestStatus = "unknown";
    state.latestMethod = null;
    state.attestationsOpen = false;
    const html = renderToStaticMarkup(
      <ClassroomAttendancePanel facilitatedSessionId="synthetic-room" />,
    );
    expect(html).toContain("The 48-hour correction window has closed");
    expect(html).toMatch(/disabled=""[^>]*>Verified present/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/domain/command-context";

const state = vi.hoisted(() => ({
  actor: {
    actorPersonId: "teacher-1",
    role: "teacher",
    capabilities: new Set(["conference.manage", "conference.complete", "conference.remind"]),
    scope: { siteIds: ["site-1"], programIds: ["program-1"] },
  } as { actorPersonId: string; role: string; capabilities: Set<string>; scope: Record<string, string[]> },
  createConferenceSeries: vi.fn(),
  completeConference: vi.fn(),
  queueConferenceReminder: vi.fn(),
  cancelConferenceBooking: vi.fn(),
  rescheduleConferenceBooking: vi.fn(),
  bookConference: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => state.actor,
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://can.local"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (input: unknown) => input,
    validator(parse: (input: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: { data: unknown }) => unknown) {
      return async (input: { data: unknown }) => callback({ data: this.parse(input.data) });
    },
  }),
}));
vi.mock("@/modules/conferences/conference-service", () => ({
  createConferenceSeries: state.createConferenceSeries,
  completeConference: state.completeConference,
  queueConferenceReminder: state.queueConferenceReminder,
  cancelConferenceBooking: state.cancelConferenceBooking,
  rescheduleConferenceBooking: state.rescheduleConferenceBooking,
  bookConference: state.bookConference,
}));

import {
  cancelTeacherConferenceBooking,
  completeTeacherConference,
  createTeacherConferenceSeries,
  queueTeacherConferenceReminder,
} from "@/modules/conferences/conference.functions";
import { cancelOfficeHour } from "@/modules/student-experience/school-experiences.functions";

const seriesInput = {
  title: "Fall office hours",
  startsAt: "2027-11-10T22:00:00.000Z",
  endsAt: "2027-11-10T23:00:00.000Z",
  slotMinutes: 20,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.actor = {
    actorPersonId: "teacher-1",
    role: "teacher",
    capabilities: new Set(["conference.manage", "conference.complete", "conference.remind"]),
    scope: { siteIds: ["site-1"], programIds: ["program-1"] },
  };
  state.createConferenceSeries.mockResolvedValue("series-1");
  state.completeConference.mockResolvedValue({});
  state.queueConferenceReminder.mockResolvedValue(undefined);
  state.cancelConferenceBooking.mockResolvedValue(undefined);
});

describe("teacher conference server functions", () => {
  it("creates a series owned by the signed-in teacher at their verified site", async () => {
    await expect(createTeacherConferenceSeries({ data: seriesInput }))
      .resolves.toEqual({ seriesId: "series-1" });
    expect(state.createConferenceSeries).toHaveBeenCalledWith(state.actor, {
      siteId: "site-1",
      teacherPersonId: "teacher-1",
      title: seriesInput.title,
      startsAt: new Date(seriesInput.startsAt),
      endsAt: new Date(seriesInput.endsAt),
      slotMinutes: 20,
    });
  });

  it.each(["guardian", "student", "registrar"] as const)("denies series creation to role %s", async role => {
    state.actor.role = role;
    await expect(createTeacherConferenceSeries({ data: seriesInput }))
      .rejects.toBeInstanceOf(AuthorizationError);
    expect(state.createConferenceSeries).not.toHaveBeenCalled();
  });

  it("rejects malformed input at the validator before reaching the service", async () => {
    await expect(createTeacherConferenceSeries({ data: { ...seriesInput, title: "x" } }))
      .rejects.toThrow();
    await expect(createTeacherConferenceSeries({ data: { ...seriesInput, startsAt: "not-a-date" } }))
      .rejects.toThrow();
    expect(state.createConferenceSeries).not.toHaveBeenCalled();
  });

  it("delegates outcome recording, reminder queueing and teacher cancellation", async () => {
    const bookingId = "a1000000-0000-4000-8000-000000000001";
    await expect(completeTeacherConference({ data: { bookingId, outcome: "held" } })).resolves.toEqual({});
    expect(state.completeConference).toHaveBeenCalledWith(state.actor, {
      bookingId, outcome: "held", note: undefined,
    });
    await expect(queueTeacherConferenceReminder({ data: { bookingId } })).resolves.toEqual({ queued: true });
    expect(state.queueConferenceReminder).toHaveBeenCalledWith(state.actor, bookingId);
    await expect(cancelTeacherConferenceBooking({ data: { bookingId } })).resolves.toEqual({ cancelled: true });
    expect(state.cancelConferenceBooking).toHaveBeenCalledWith(state.actor, { bookingId, reason: undefined });
  });

  it("denies outcome recording to non-teachers", async () => {
    state.actor.role = "guardian";
    await expect(completeTeacherConference({
      data: { bookingId: "a1000000-0000-4000-8000-000000000001", outcome: "no_show" },
    })).rejects.toBeInstanceOf(AuthorizationError);
    expect(state.completeConference).not.toHaveBeenCalled();
  });
});

describe("cancelOfficeHour server function", () => {
  it("delegates guardian cancellation to the conference service", async () => {
    state.actor = {
      actorPersonId: "guardian-1",
      role: "guardian",
      capabilities: new Set(["conference.book"]),
      scope: { siteIds: ["site-1"] },
    };
    const bookingId = "a1000000-0000-4000-8000-000000000002";
    await expect(cancelOfficeHour({ data: { bookingId } })).resolves.toEqual({ cancelled: true });
    expect(state.cancelConferenceBooking).toHaveBeenCalledWith(state.actor, { bookingId });
  });

  it.each(["student", "teacher"] as const)("denies cancellation to role %s at the boundary", async role => {
    state.actor.role = role;
    await expect(cancelOfficeHour({ data: { bookingId: "a1000000-0000-4000-8000-000000000002" } }))
      .rejects.toBeInstanceOf(AuthorizationError);
    expect(state.cancelConferenceBooking).not.toHaveBeenCalled();
  });
});

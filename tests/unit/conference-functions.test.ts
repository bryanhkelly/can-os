import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  readRows: [] as unknown[][],
}));

function readChain(rows: unknown[]) {
  const self: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "orderBy"]) {
    self[method] = () => self;
  }
  self.limit = async () => rows;
  self.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
  return self;
}

vi.mock("@/db/client", () => ({ db: {
  select: () => readChain(state.readRows.shift() ?? []),
} }));
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
      return async (input: { data: unknown } = { data: undefined }) => callback({ data: this.parse(input.data) });
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
  getTeacherConferences,
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
  state.readRows = [];
});

afterEach(() => vi.unstubAllEnvs());

describe("teacher conference server functions", () => {
  it("keeps recent bookings visible even without an upcoming series", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://unit.invalid/test");
    const start = new Date(Date.now() - 3_600_000);
    state.readRows = [[], [{
      id: "booking-1", status: "booked", startsAt: start, endsAt: new Date(start.getTime() + 1_200_000),
      seriesTitle: "Recent conferences", studentFirstName: "Jordan", studentLastName: "Example",
      studentPreferredName: null,
    }]];
    const result = await getTeacherConferences();
    expect(result.series).toEqual([]);
    expect(result.bookings).toEqual([expect.objectContaining({
      id: "booking-1", studentName: "Jordan Example", startsAt: start.toISOString(),
    })]);
  });
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

  it("passes the optional stable series identity through the validated teacher command", async () => {
    const seriesId = "a1000000-0000-4000-8000-000000000001";
    await createTeacherConferenceSeries({ data: { ...seriesInput, seriesId } });
    expect(state.createConferenceSeries).toHaveBeenCalledWith(state.actor, expect.objectContaining({ seriesId }));
    await expect(createTeacherConferenceSeries({ data: { ...seriesInput, seriesId: "invalid" } })).rejects.toThrow();
    expect(state.createConferenceSeries).toHaveBeenCalledOnce();
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
      noteVisibility: undefined, followUp: undefined,
    });
    await completeTeacherConference({ data: {
      bookingId, outcome: "held", note: "Shared reading goal.", noteVisibility: "family_visible",
      followUp: { title: "Check reading goal", dueAt: "2027-11-24T12:00:00.000Z" },
    } });
    expect(state.completeConference).toHaveBeenLastCalledWith(state.actor, {
      bookingId, outcome: "held", note: "Shared reading goal.", noteVisibility: "family_visible",
      followUp: { title: "Check reading goal", dueAt: new Date("2027-11-24T12:00:00.000Z") },
    });
    await expect(completeTeacherConference({ data: {
      bookingId, outcome: "held", followUp: { title: "Check reading goal", ownerPersonId: "other-person" },
    } })).rejects.toThrow();
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

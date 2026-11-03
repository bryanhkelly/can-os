import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { resolveAccessContext } from "@/domain/access-context";

const state = vi.hoisted(() => ({
  booking: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  emitEvent: vi.fn(),
  writeAudit: vi.fn(),
  cancelProjection: vi.fn(),
  releaseClaimedSlot: vi.fn(),
}));

function chain<T>(result: T) {
  const self: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "for", "orderBy", "groupBy"]) {
    self[method] = () => self;
  }
  self.limit = async () => result;
  self.then = (resolve: (value: T) => unknown) => Promise.resolve(result).then(resolve);
  return self;
}

vi.mock("@/db/client", () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: () => chain(state.booking ? [state.booking] : []),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          state.updates.push(values);
          return { where: async () => [] };
        },
      }),
    }),
  },
}));
vi.mock("@/platform/mutation", () => ({ emitEvent: state.emitEvent, writeAudit: state.writeAudit }));
vi.mock("@/platform/calendar/projection", () => ({
  cancelProjection: state.cancelProjection,
  publishProjection: vi.fn(),
  rescheduleProjection: vi.fn(),
}));
vi.mock("@/platform/scheduling/booking", () => ({
  claimAvailableSlot: vi.fn(),
  releaseClaimedSlot: state.releaseClaimedSlot,
}));
vi.mock("@/platform/scheduling/reminders", () => ({ scheduleReminder: vi.fn() }));
vi.mock("@/platform/scheduling/slots", () => ({ materializeSlots: vi.fn() }));

import { bookConference, cancelConferenceBooking, completeConference, createConferenceSeries } from "@/modules/conferences/conference-service";

const guardian: CommandContext = {
  actorPersonId: "guardian-1",
  capabilities: new Set(["conference.book"]),
  scope: { siteIds: ["site-1"] },
};
const teacher: CommandContext = {
  actorPersonId: "teacher-1",
  capabilities: new Set(["conference.manage"]),
  scope: { siteIds: ["site-1"] },
};
const booked = {
  bookingId: "booking-1",
  status: "booked",
  studentProfileId: "profile-1",
  guardianPersonId: "guardian-1",
  slotId: "slot-1",
  teacherPersonId: "teacher-1",
  siteId: "site-1",
};

describe("completeConference", () => {
  const context: CommandContext = {
    ...teacher,
    capabilities: new Set(["conference.complete"]),
  };
  const input = { bookingId: "booking-1", outcome: "held" as const };
  const completion = {
    ...booked,
    bookingStatus: "booked",
    startsAt: new Date("2020-01-01T10:00:00Z"),
    endsAt: new Date("2020-01-01T10:20:00Z"),
  };

  it("records an elapsed booked appointment with audit and event", async () => {
    state.booking = completion;
    await expect(completeConference(context, input)).resolves.toEqual({});
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ status: "held" });
    expect(state.emitEvent).toHaveBeenCalledOnce();
    expect(state.writeAudit).toHaveBeenCalledOnce();
  });

  it.each(["cancelled", "held", "no_show"])("rejects terminal status %s without duplicate evidence", async status => {
    state.booking = { ...completion, bookingStatus: status };
    await expect(completeConference(context, input)).rejects.toThrow("Only a booked conference");
    await expect(completeConference(context, input)).rejects.toMatchObject({ code: "CONFERENCE_NOT_BOOKED" });
    expect(state.updates).toHaveLength(0);
    expect(state.emitEvent).not.toHaveBeenCalled();
    expect(state.writeAudit).not.toHaveBeenCalled();
  });

  it.each(["held", "no_show"] as const)("rejects a future %s without a mutation", async outcome => {
    state.booking = {
      ...completion,
      startsAt: new Date(Date.now() + 60_000),
      endsAt: new Date(Date.now() + 120_000),
    };
    await expect(completeConference(context, { ...input, outcome })).rejects.toThrow("before the appointment starts");
    await expect(completeConference(context, { ...input, outcome })).rejects.toMatchObject({ code: "CONFERENCE_NOT_STARTED" });
    expect(state.updates).toHaveLength(0);
    expect(state.emitEvent).not.toHaveBeenCalled();
  });

  it("does not record a no-show while the appointment is still open", async () => {
    state.booking = { ...completion, endsAt: new Date(Date.now() + 60_000) };
    await expect(completeConference(context, { ...input, outcome: "no_show" })).rejects.toThrow("before the appointment ends");
    await expect(completeConference(context, { ...input, outcome: "no_show" })).rejects.toMatchObject({ code: "CONFERENCE_NOT_ENDED" });
    expect(state.updates).toHaveLength(0);
  });

  describe("conference window validation", () => {
    it.each([
      { startsAt: new Date("invalid"), endsAt: new Date("2027-01-01"), slotMinutes: 20 },
      { startsAt: new Date("2027-01-02"), endsAt: new Date("2027-01-01"), slotMinutes: 20 },
      { startsAt: new Date("2027-01-01"), endsAt: new Date("2027-01-02"), slotMinutes: 1 },
      { startsAt: new Date("2027-01-01"), endsAt: new Date("2027-01-02"), slotMinutes: 121 },
      { startsAt: new Date("2027-01-01T10:00:00Z"), endsAt: new Date("2027-01-01T10:10:00Z"), slotMinutes: 20 },
    ])("returns an expected validation code before writing for invalid windows", async window => {
      await expect(createConferenceSeries(teacher, {
        siteId: "site-1", teacherPersonId: "teacher-1", title: "Office hours", ...window,
      })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      expect(state.updates).toHaveLength(0);
      expect(state.emitEvent).not.toHaveBeenCalled();
      expect(state.writeAudit).not.toHaveBeenCalled();
    });
  });

  describe("conference availability conflicts", () => {
    it.each([
      null,
      { status: "booked" },
      { status: "available", seriesStatus: "cancelled", startsAt: new Date("2027-01-01") },
      { status: "available", seriesStatus: "published", startsAt: new Date("2020-01-01") },
    ])("returns an expected conflict for unavailable slots without writes", async slot => {
      state.booking = slot;
      await expect(bookConference(guardian, {
        conferenceSlotId: "slot-1", studentProfileId: "profile-1",
      })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(state.updates).toHaveLength(0);
      expect(state.emitEvent).not.toHaveBeenCalled();
      expect(state.writeAudit).not.toHaveBeenCalled();
    });
  });

  it("preserves owning teacher and site checks", async () => {
    state.booking = completion;
    await expect(completeConference({ ...context, actorPersonId: "other-teacher" }, input))
      .rejects.toThrow("Only the teacher");
    await expect(completeConference({ ...context, scope: { siteIds: ["other-site"] } }, input))
      .rejects.toThrow();
    expect(state.updates).toHaveLength(0);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  state.booking = { ...booked };
  state.updates = [];
});

describe("cancelConferenceBooking", () => {
  it("lets the booking guardian cancel: frees the slot, cancels the projection, writes audit and event", async () => {
    await expect(cancelConferenceBooking(guardian, { bookingId: "booking-1" })).resolves.toBeUndefined();
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ status: "cancelled" });
    expect(state.updates[0]?.cancelledAt).toBeInstanceOf(Date);
    expect(state.releaseClaimedSlot).toHaveBeenCalledWith(expect.anything(), "slot-1");
    expect(state.cancelProjection).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sourceType: "conference_booking",
      sourceId: "booking-1",
    }));
    expect(state.emitEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "ConferenceCancelled",
      aggregateType: "conference_booking",
      aggregateId: "booking-1",
      siteId: "site-1",
    }));
    expect(state.writeAudit).toHaveBeenCalledWith(expect.anything(), guardian, expect.objectContaining({
      action: "conference.cancel",
      entityType: "conference_booking",
      entityId: "booking-1",
      before: { status: "booked", slotId: "slot-1" },
      after: { status: "cancelled" },
    }));
  });

  it("lets the owning teacher cancel with conference.manage", async () => {
    await expect(cancelConferenceBooking(teacher, { bookingId: "booking-1" })).resolves.toBeUndefined();
    expect(state.updates[0]).toMatchObject({ status: "cancelled" });
  });

  it("denies a non-owner even with both capabilities", async () => {
    const outsider: CommandContext = {
      actorPersonId: "outsider",
      capabilities: new Set(["conference.book", "conference.manage"]),
      scope: { siteIds: ["site-1"] },
    };
    await expect(cancelConferenceBooking(outsider, { bookingId: "booking-1" }))
      .rejects.toBeInstanceOf(AuthorizationError);
    expect(state.updates).toHaveLength(0);
    expect(state.emitEvent).not.toHaveBeenCalled();
  });

  it("denies the guardian owner without conference.book and the teacher owner without conference.manage", async () => {
    await expect(cancelConferenceBooking(
      { ...guardian, capabilities: new Set() }, { bookingId: "booking-1" },
    )).rejects.toBeInstanceOf(AuthorizationError);
    await expect(cancelConferenceBooking(
      { ...teacher, capabilities: new Set() }, { bookingId: "booking-1" },
    )).rejects.toBeInstanceOf(AuthorizationError);
    expect(state.updates).toHaveLength(0);
  });

  it("denies a booking outside the actor's site scope", async () => {
    await expect(cancelConferenceBooking(
      { ...guardian, scope: { siteIds: ["other-site"] } }, { bookingId: "booking-1" },
    )).rejects.toBeInstanceOf(AuthorizationError);
    expect(state.updates).toHaveLength(0);
  });

  it("treats an already-cancelled booking as an idempotent no-op", async () => {
    state.booking = { ...booked, status: "cancelled" };
    await expect(cancelConferenceBooking(guardian, { bookingId: "booking-1" })).resolves.toBeUndefined();
    expect(state.updates).toHaveLength(0);
    expect(state.emitEvent).not.toHaveBeenCalled();
    expect(state.releaseClaimedSlot).not.toHaveBeenCalled();
  });

  it("rejects completed bookings", async () => {
    state.booking = { ...booked, status: "held" };
    await expect(cancelConferenceBooking(guardian, { bookingId: "booking-1" }))
      .rejects.toThrow("Only a booked conference can be cancelled");
    await expect(cancelConferenceBooking(guardian, { bookingId: "booking-1" }))
      .rejects.toMatchObject({ code: "CONFERENCE_NOT_BOOKED" });
    expect(state.updates).toHaveLength(0);
  });

  it("rejects unknown bookings", async () => {
    state.booking = null;
    await expect(cancelConferenceBooking(guardian, { bookingId: "booking-1" }))
      .rejects.toThrow("Conference booking not found");
  });
});

describe("conference capability grants", () => {
  it("grants teachers series management, completion and reminder capabilities", () => {
    const context = resolveAccessContext(
      { accountId: "account", sessionId: "session", activeGrantId: "grant" },
      [{ id: "grant", accountId: "account", personId: "teacher-1", role: "teacher",
        organizationId: "org", siteId: "site-1", active: true }],
    );
    for (const capability of ["conference.manage", "conference.complete", "conference.remind"]) {
      expect(context.capabilities.has(capability)).toBe(true);
    }
    expect(context.capabilities.has("conference.book")).toBe(false);
  });
});

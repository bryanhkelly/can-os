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

import { cancelConferenceBooking } from "@/modules/conferences/conference-service";

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

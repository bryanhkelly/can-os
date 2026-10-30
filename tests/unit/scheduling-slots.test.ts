import { describe, expect, it } from "vitest";
import { conferenceSlots } from "@/db/schema";
import {
  claimAvailableSlot,
  releaseClaimedSlot,
  type BookingTx,
  type UpdateChain,
} from "@/platform/scheduling/booking";
import { materializeSlots } from "@/platform/scheduling/slots";

describe("materializeSlots", () => {
  it("fills the window exactly when it divides evenly (slot end <= endsAt)", () => {
    const startsAt = new Date("2027-11-10T22:00:00.000Z");
    const endsAt = new Date("2027-11-10T23:00:00.000Z");
    const slots = materializeSlots({ startsAt, endsAt, slotMinutes: 20 });
    expect(slots).toEqual([
      {
        startsAt: new Date("2027-11-10T22:00:00.000Z"),
        endsAt: new Date("2027-11-10T22:20:00.000Z"),
      },
      {
        startsAt: new Date("2027-11-10T22:20:00.000Z"),
        endsAt: new Date("2027-11-10T22:40:00.000Z"),
      },
      {
        startsAt: new Date("2027-11-10T22:40:00.000Z"),
        endsAt: new Date("2027-11-10T23:00:00.000Z"),
      },
    ]);
  });

  it("drops a trailing remainder shorter than slotMinutes", () => {
    const startsAt = new Date("2027-11-10T22:00:00.000Z");
    const endsAt = new Date("2027-11-10T22:50:00.000Z");
    const slots = materializeSlots({ startsAt, endsAt, slotMinutes: 20 });
    expect(slots).toHaveLength(2);
    expect(slots[1]!.endsAt).toEqual(new Date("2027-11-10T22:40:00.000Z"));
  });

  it("returns an empty array when the window is shorter than one slot", () => {
    const startsAt = new Date("2027-11-10T22:00:00.000Z");
    const endsAt = new Date("2027-11-10T22:15:00.000Z");
    expect(materializeSlots({ startsAt, endsAt, slotMinutes: 20 })).toEqual([]);
  });

  it("returns an empty array when endsAt is not after startsAt", () => {
    const at = new Date("2027-11-10T22:00:00.000Z");
    expect(materializeSlots({ startsAt: at, endsAt: at, slotMinutes: 20 })).toEqual([]);
    expect(
      materializeSlots({
        startsAt: at,
        endsAt: new Date("2027-11-10T21:00:00.000Z"),
        slotMinutes: 20,
      }),
    ).toEqual([]);
  });

  it("rejects zero, negative, and non-finite slotMinutes", () => {
    const startsAt = new Date("2027-11-10T22:00:00.000Z");
    const endsAt = new Date("2027-11-10T23:00:00.000Z");
    expect(() => materializeSlots({ startsAt, endsAt, slotMinutes: 0 })).toThrow();
    expect(() => materializeSlots({ startsAt, endsAt, slotMinutes: -20 })).toThrow();
    expect(() => materializeSlots({ startsAt, endsAt, slotMinutes: NaN })).toThrow();
  });
});

type UpdateCall = { table: unknown; set: unknown; where: unknown };

function makeFakeUpdateTx(returnedRows: Array<Record<string, unknown>>) {
  const calls: UpdateCall[] = [];
  const tx: BookingTx = {
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(condition: unknown) {
              calls.push({ table, set: values, where: condition });
              const chain: UpdateChain = {
                returning() {
                  return Promise.resolve(returnedRows);
                },
                then(onfulfilled, onrejected) {
                  return Promise.resolve(undefined).then(onfulfilled, onrejected);
                },
              };
              return chain;
            },
          };
        },
      };
    },
  };
  return { tx, calls };
}

describe("claimAvailableSlot", () => {
  it("claims the slot with a status-conditional update and returns its id", async () => {
    const { tx, calls } = makeFakeUpdateTx([{ id: "slot-1" }]);
    const id = await claimAvailableSlot(tx, "slot-1", {
      calendarEventId: "event-1",
    });
    expect(id).toBe("slot-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.table).toBe(conferenceSlots);
    expect(calls[0]!.set).toMatchObject({
      status: "booked",
      calendarEventId: "event-1",
    });
    expect((calls[0]!.set as { updatedAt: unknown }).updatedAt).toBeInstanceOf(Date);
  });

  it("throws when the conditional update claims no row (already taken)", async () => {
    const { tx } = makeFakeUpdateTx([]);
    await expect(
      claimAvailableSlot(tx, "slot-1", { calendarEventId: "event-1" }),
    ).rejects.toThrow("not available");
  });
});

describe("releaseClaimedSlot", () => {
  it("returns the slot to available and detaches the calendar event", async () => {
    const { tx, calls } = makeFakeUpdateTx([]);
    await releaseClaimedSlot(tx, "slot-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.table).toBe(conferenceSlots);
    expect(calls[0]!.set).toMatchObject({
      status: "available",
      calendarEventId: null,
    });
    expect((calls[0]!.set as { updatedAt: unknown }).updatedAt).toBeInstanceOf(Date);
  });
});

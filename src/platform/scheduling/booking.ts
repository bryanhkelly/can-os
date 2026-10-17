import { and, eq } from "drizzle-orm";
import { conferenceSlots } from "@/db/schema";

/**
 * Minimal structural view of a Drizzle transaction's update surface. The db
 * client is never statically imported here so server-only code stays out of
 * client bundles; callers pass the `tx` handed to `db.transaction(...)`.
 */
export interface UpdateChain extends PromiseLike<unknown> {
  returning(
    columns: Record<string, unknown>,
  ): PromiseLike<Array<Record<string, unknown>>>;
}

export interface BookingTx {
  update(table: unknown): {
    set(values: Record<string, unknown>): {
      where(condition: unknown): UpdateChain;
    };
  };
}

/**
 * Atomically claim an available conference slot via a status-conditional
 * UPDATE (available -> booked). The WHERE clause re-checks the status so a
 * concurrent booking loses the race instead of double-booking; if no row is
 * claimed the slot was taken (or never available) and an error is thrown.
 *
 * This adapter is intentionally typed to the conference schema: the
 * claim-then-verify pattern is the shareable part, while the status column
 * and claimed fields (calendarEventId) are table-specific. Other booking
 * domains should register their own table adapter here rather than forcing a
 * fake-generic abstraction over unrelated slot tables.
 */
export async function claimAvailableSlot(
  tx: BookingTx,
  slotId: string,
  claim: { calendarEventId: string },
): Promise<string> {
  const rows = await tx
    .update(conferenceSlots)
    .set({
      status: "booked",
      calendarEventId: claim.calendarEventId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(conferenceSlots.id, slotId),
        eq(conferenceSlots.status, "available"),
      ),
    )
    .returning({ id: conferenceSlots.id });

  const id = rows[0]?.id;
  if (typeof id !== "string") {
    throw new Error("Conference slot is not available");
  }
  return id;
}

import { and, gt, inArray, isNull, or } from "drizzle-orm";
import { instructionalCapacityReservations } from "@/db/schema";

type Reservation = Pick<typeof instructionalCapacityReservations.$inferSelect, "status" | "expiresAt">;

export function isCurrentCapacityReservation(reservation: Reservation, now: Date): boolean {
  return (reservation.status === "held" || reservation.status === "committed") &&
    (!reservation.expiresAt || reservation.expiresAt > now);
}

export function currentCapacityReservationFilter(now: Date) {
  return and(
    inArray(instructionalCapacityReservations.status, ["held", "committed"]),
    or(isNull(instructionalCapacityReservations.expiresAt), gt(instructionalCapacityReservations.expiresAt, now)),
  );
}

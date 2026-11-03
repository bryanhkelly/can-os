import { DomainError } from "@/domain/errors";
import { isValidDateOnly } from "@/modules/calendar/timezone";

export function appointmentExpiryBounds(at = new Date()) {
  return {
    min: at.toISOString().slice(0, 10),
    max: new Date(at.getTime() + 89 * 86400_000).toISOString().slice(0, 10),
  };
}

/** Preserve the existing UTC expiry contract until Site-local semantics are agreed. */
export function appointmentExpiryToIso(date: string): string {
  if (!isValidDateOnly(date)) throw new DomainError("VALIDATION_FAILED");
  return new Date(date + "T23:59:59Z").toISOString();
}

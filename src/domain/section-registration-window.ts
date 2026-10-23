import { dateKeyInTimezone } from "@/modules/calendar/timezone";

/**
 * A registration deadline is a date in the school's timezone, not UTC.
 * Preview and enrollment command MUST share this exact check.
 */
export function canAddStudentToSection(input: {
  addDropEndsOn: string;
  enrollmentCapacity: number;
  occupiedSeats: number;
  timezone: string;
  now?: Date;
}): boolean {
  const {addDropEndsOn,enrollmentCapacity,occupiedSeats,timezone,now=new Date()}=input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(addDropEndsOn) ||
      !Number.isSafeInteger(enrollmentCapacity) || enrollmentCapacity<1 ||
      !Number.isSafeInteger(occupiedSeats) || occupiedSeats<0) return false;
  return dateKeyInTimezone(now.toISOString(),timezone)<=addDropEndsOn &&
    occupiedSeats<enrollmentCapacity;
}

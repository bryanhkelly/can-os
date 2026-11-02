import { DomainError } from "@/domain/errors";

export type AmbiguousTimePolicy = "earlier" | "later" | "reject";
type Instant = string | Date;

function instantDate(value: Instant): Date {
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.exec(value);
    if (!match || !isValidDateOnly(match[1]!) || Number(match[2]) > 23 ||
        Number(match[3]) > 59 || Number(match[4] ?? 0) > 59)
      throw new DomainError("VALIDATION_FAILED", "Expected a valid timestamp with an explicit UTC offset");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new DomainError("VALIDATION_FAILED", "Invalid timestamp");
  return date;
}

function partsInTimezone(date: Date, timezone: string): Record<string, number> {
  if (!isValidTimeZone(timezone)) throw new DomainError("VALIDATION_FAILED", "Invalid site timezone");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

function parseLocalClock(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new DomainError("VALIDATION_FAILED", "Enter a valid date and time");
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year!, month! - 1, day!);
  date.setUTCHours(hour!, minute!, 0, 0);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    throw new DomainError("VALIDATION_FAILED", "Enter a valid date and time");
  }

  return date.getTime();
}

/** Legacy calendar callers choose the earlier overlap; scheduling callers can reject it. */
export function dateTimeInputInTimezone(
  value: string, timezone: string, ambiguity: AmbiguousTimePolicy = "earlier",
): string {
  if (!isValidTimeZone(timezone)) throw new DomainError("VALIDATION_FAILED", "Invalid site timezone");
  if (!["earlier", "later", "reject"].includes(ambiguity))
    throw new DomainError("VALIDATION_FAILED", "Invalid ambiguous time policy");
  const localAsUtc = parseLocalClock(value);
  const offsets = new Set<number>();
  for (const delta of [-48, -24, -12, 0, 12, 24, 48]) {
    const instant = localAsUtc + delta * 3_600_000;
    const represented = parseLocalClock(dateTimeInputValue(new Date(instant), timezone));
    offsets.add(represented - instant);
  }
  const matches = [...offsets].map(offset => localAsUtc - offset)
    .filter(candidate => dateTimeInputValue(new Date(candidate), timezone) === value)
    .sort((a, b) => a - b);
  if (!matches.length) throw new DomainError("VALIDATION_FAILED", `That local time does not exist in ${timezone}`);
  if (matches.length > 1 && ambiguity === "reject")
    throw new DomainError("VALIDATION_FAILED", `That local time is ambiguous in ${timezone}; choose earlier or later`);
  return new Date(ambiguity === "later" ? matches[matches.length - 1]! : matches[0]!).toISOString();
}

export function dateTimeInputValue(instant: Instant, timezone: string): string {
  const parts = partsInTimezone(instantDate(instant), timezone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function dateKeyInTimezone(instant: Instant, timezone: string): string {
  return dateTimeInputValue(instant, timezone).slice(0, 10);
}

export function todayInTimezone(timezone: string, at: Date = new Date()): string {
  return dateKeyInTimezone(at, timezone);
}

/** Absolute boundaries of the calendar date at a Site, not the server's UTC
 * date or the browser's timezone. Resolving both midnights separately handles
 * 23- and 25-hour days across daylight-saving transitions.
 */
export function localDayBoundsInTimezone(at: Date, timezone: string): {
  start: Date;
  end: Date;
} {
  return dateOnlyDayBoundsInTimezone(dateKeyInTimezone(at, timezone), timezone);
}

export function dateOnlyDayStartInTimezone(dateKey: string, timezone: string): Date {
  const start = firstInstantOnOrAfterDate(dateKey, timezone);
  if (dateKeyInTimezone(start, timezone) !== dateKey)
    throw new DomainError("VALIDATION_FAILED", `That calendar date does not exist in ${timezone}`);
  return start;
}

function firstInstantOnOrAfterDate(dateKey: string, timezone: string): Date {
  assertDateOnly(dateKey);
  if (!isValidTimeZone(timezone)) throw new DomainError("VALIDATION_FAILED", "Invalid site timezone");
  const nominal = Date.parse(`${dateKey}T00:00:00.000Z`);
  let low = nominal - 48 * 3_600_000;
  let high = nominal + 48 * 3_600_000;
  // Find the first instant of the date even when a DST gap skips midnight.
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (dateKeyInTimezone(new Date(middle), timezone) < dateKey) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}

/** Half-open [start, end); a completely skipped calendar date is rejected. */
export function dateOnlyDayBoundsInTimezone(dateKey: string, timezone: string): { start: Date; end: Date } {
  return {
    start: dateOnlyDayStartInTimezone(dateKey, timezone),
    end: firstInstantOnOrAfterDate(addCalendarDays(dateKey, 1), timezone),
  };
}

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function assertDateOnly(value: string): void {
  if (!isValidDateOnly(value)) throw new DomainError("VALIDATION_FAILED", "Invalid calendar date");
}

export function addCalendarDays(value: string, days: number): string {
  assertDateOnly(value);
  if (!Number.isSafeInteger(days)) throw new DomainError("VALIDATION_FAILED", "Invalid calendar day offset");
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime()) || !/^\d{4}-/.test(date.toISOString()))
    throw new DomainError("VALIDATION_FAILED", "Calendar date out of range");
  return date.toISOString().slice(0, 10);
}

export function calendarWeekday(value: string): number {
  assertDateOnly(value);
  return new Date(`${value}T00:00:00.000Z`).getUTCDay();
}

/** A calendar date never shifts into the viewer's previous/next day. */
export function formatDateOnly(value: string, locale = "en-US", dateStyle: Intl.DateTimeFormatOptions["dateStyle"] = "medium"): string {
  assertDateOnly(value);
  return new Intl.DateTimeFormat(locale, { dateStyle, timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00.000Z`));
}

/** Timestamp display always requires the resource's explicit timezone. */
export function formatTimestamp(value: Instant, timezone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
  locale = "en-US"): string {
  if (!isValidTimeZone(timezone)) throw new DomainError("VALIDATION_FAILED", "Invalid site timezone");
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(instantDate(value));
}

export function isValidTimeZone(timezone: string): boolean {
  if (typeof timezone !== "string" || !timezone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

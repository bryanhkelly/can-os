export type InstructionalPeriod = {
  dayOfWeek: number;
  startsAtLocal: string;
  endsAtLocal: string;
};

export type RecurringInstructionalSchedule = {
  timezone: string;
  periods: readonly InstructionalPeriod[];
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function localParts(instant: number, timezone: string) {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function wallClockInstants(date: string, time: string, timezone: string): number[] {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time))
    throw new Error("Instructional schedule periods contain an invalid local time");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  if (hour! > 23 || minute! > 59 || second! > 59)
    throw new Error("Instructional schedule periods contain an invalid local time");
  const wallClock = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 12, 36]) {
    const instant = wallClock + delta * 60 * 60 * 1000;
    const local = localParts(instant, timezone);
    offsets.add(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - instant);
  }
  const candidates = new Set<number>();
  for (const offset of offsets) {
    const instant = wallClock - offset;
    const local = localParts(instant, timezone);
    if (Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) === wallClock)
      candidates.add(instant);
  }
  return [...candidates];
}

function localTimeSeconds(value: string) {
  const [hour, minute, second = 0] = value.split(":").map(Number);
  return hour! * 3600 + minute! * 60 + second!;
}

function scheduleOccurrences(
  schedule: RecurringInstructionalSchedule,
  from: number,
  through: number,
): Array<{ startsAt: number; endsAt: number }> {
  const occurrences: Array<{ startsAt: number; endsAt: number }> = [];
  const fromDay = new Date(from - 2 * 24 * 60 * 60 * 1000);
  fromDay.setUTCHours(0, 0, 0, 0);
  const throughDay = new Date(through + 2 * 24 * 60 * 60 * 1000);
  throughDay.setUTCHours(0, 0, 0, 0);
  for (let day = fromDay.getTime(); day <= throughDay.getTime(); day += 24 * 60 * 60 * 1000) {
    const date = new Date(day).toISOString().slice(0, 10);
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    for (const period of schedule.periods) {
      if (!Number.isInteger(period.dayOfWeek) || period.dayOfWeek < 0 || period.dayOfWeek > 6)
        throw new Error("Instructional schedule periods contain an invalid weekday");
      if (period.dayOfWeek !== weekday) continue;
      if (localTimeSeconds(period.endsAtLocal) <= localTimeSeconds(period.startsAtLocal))
        throw new Error("Instructional schedule periods must end after they start on the same day");
      for (const startsAt of wallClockInstants(date, period.startsAtLocal, schedule.timezone)) {
        for (const endsAt of wallClockInstants(date, period.endsAtLocal, schedule.timezone)) {
          if (startsAt < endsAt && startsAt < through && endsAt > from)
            occurrences.push({ startsAt, endsAt });
        }
      }
    }
  }
  return occurrences.sort((a, b) => a.startsAt - b.startsAt);
}

export function recurringSchedulesConflict(
  first: RecurringInstructionalSchedule,
  second: RecurringInstructionalSchedule,
  from: Date,
  through: Date,
): boolean {
  if (through <= from || !first.periods.length || !second.periods.length) return false;
  const left = scheduleOccurrences(first, from.getTime(), through.getTime());
  const right = scheduleOccurrences(second, from.getTime(), through.getTime());
  let firstIndex = 0;
  let secondIndex = 0;
  while (firstIndex < left.length && secondIndex < right.length) {
    const a = left[firstIndex]!;
    const b = right[secondIndex]!;
    if (a.startsAt < b.endsAt && b.startsAt < a.endsAt) return true;
    if (a.endsAt <= b.startsAt) firstIndex++;
    else secondIndex++;
  }
  return false;
}

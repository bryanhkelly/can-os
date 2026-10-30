import { dateTimeInputInTimezone, isValidTimeZone } from "@/modules/calendar/timezone";

export type SessionPattern = {
  fromDate: string;
  throughDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
};

export type PlannedSession = {
  date: string;
  startsAt: Date;
  endsAt: Date;
  instanceKey: string;
};

/** Bound synchronous batches so an accidental annual pattern cannot create thousands of calendar rows. */
export const MAX_EXTENDED_SESSIONS_PER_BATCH = 180;

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function utcDay(value: string): number {
  if (!dayPattern.test(value)) throw new Error("Enter ISO calendar dates");
  const stamp = Date.parse(value + "T00:00:00.000Z");
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value)
    throw new Error("Enter real calendar dates");
  return stamp;
}

/** Date-first recurrence. Every meeting is resolved separately in the SITE's IANA timezone. */
export function planExtendedSessions(
  pattern: SessionPattern,
  season: { startsOn: string; endsOn: string },
  timezone: string,
): PlannedSession[] {
  if (!isValidTimeZone(timezone)) throw new Error("Site timezone is invalid");
  const from = utcDay(pattern.fromDate);
  const through = utcDay(pattern.throughDate);
  const seasonStart = utcDay(season.startsOn);
  const seasonEnd = utcDay(season.endsOn);
  if (from > through || from < seasonStart || through > seasonEnd)
    throw new Error("Session dates must stay inside the offering season");
  if (through - from > 366 * 86400000)
    throw new Error("Schedule at most one year per request");
  if (!clockPattern.test(pattern.startTime) || !clockPattern.test(pattern.endTime) ||
      pattern.endTime <= pattern.startTime)
    throw new Error("Enter valid same-day start and end times");
  if (!pattern.weekdays.length || pattern.weekdays.some(day =>
      !Number.isInteger(day) || day < 0 || day > 6) ||
      new Set(pattern.weekdays).size !== pattern.weekdays.length)
    throw new Error("Choose unique weekdays");

  const weekdays = new Set(pattern.weekdays);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const localKey = (d: Date) => {
    const v = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
    return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
  };
  const sessions: PlannedSession[] = [];
  for (let stamp = from; stamp <= through; stamp += 86400000) {
    if (!weekdays.has(new Date(stamp).getUTCDay())) continue;
    const date = new Date(stamp).toISOString().slice(0, 10);
    const startsAt = new Date(dateTimeInputInTimezone(`${date}T${pattern.startTime}`, timezone));
    const endsAt = new Date(dateTimeInputInTimezone(`${date}T${pattern.endTime}`, timezone));
    if (endsAt <= startsAt) throw new Error("Local session must end after it starts");
    // A repeated local clock hour at fall DST is ambiguous; block either boundary.
    // Compare adjacent UTC instants to detect the repeated wall clock hour.
    for (const [instant, clock] of [[startsAt, pattern.startTime], [endsAt, pattern.endTime]] as const) {
      const local = `${date}T${clock}`;
      if (localKey(new Date(instant.getTime() - 3600000)) === local ||
          localKey(new Date(instant.getTime() + 3600000)) === local)
        throw new Error(`Ambiguous daylight-saving time on ${date}`);
    }
    sessions.push({ date, startsAt, endsAt, instanceKey: `extended:${date}:${pattern.startTime}` });
    if (sessions.length > MAX_EXTENDED_SESSIONS_PER_BATCH)
      throw new Error(`Schedule at most ${MAX_EXTENDED_SESSIONS_PER_BATCH} sessions per request`);
  }
  if (!sessions.length) throw new Error("No sessions match the selected weekdays");
  return sessions;
}

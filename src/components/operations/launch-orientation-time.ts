import { dateTimeInputInTimezone, dateTimeInputValue } from "@/modules/calendar/timezone";

export function unambiguousInstant(local: string, timezone: string): string {
  const iso = dateTimeInputInTimezone(local, timezone);
  const instant = Date.parse(iso);
  for (const offset of [-3_600_000, 3_600_000]) {
    if (dateTimeInputValue(new Date(instant + offset).toISOString(), timezone) === local) {
      throw new Error("This local time occurs twice in the Site timezone; choose an unambiguous time");
    }
  }
  return iso;
}


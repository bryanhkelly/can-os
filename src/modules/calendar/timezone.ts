function partsInTimezone(date: Date, timezone: string): Record<string, number> {
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

export function dateTimeInputInTimezone(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid date and time");
  const [, year, month, day, hour, minute] = match.map(Number);
  const localAsUtc = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const date = new Date(localAsUtc);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    throw new Error("Enter a valid date and time");
  }

  let candidate = localAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = partsInTimezone(new Date(candidate), timezone);
    const representedAsUtc = Date.UTC(
      local.year!,
      local.month! - 1,
      local.day!,
      local.hour!,
      local.minute!,
      local.second!,
    );
    const adjustment = localAsUtc - representedAsUtc;
    if (adjustment === 0) return new Date(candidate).toISOString();
    candidate += adjustment;
  }

  const resolved = partsInTimezone(new Date(candidate), timezone);
  if (
    resolved.year !== year ||
    resolved.month !== month ||
    resolved.day !== day ||
    resolved.hour !== hour ||
    resolved.minute !== minute
  ) {
    throw new Error(`That local time does not exist in ${timezone}`);
  }
  return new Date(candidate).toISOString();
}

export function dateTimeInputValue(instant: string, timezone: string): string {
  const parts = partsInTimezone(new Date(instant), timezone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function dateKeyInTimezone(instant: string, timezone: string): string {
  return dateTimeInputValue(instant, timezone).slice(0, 10);
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

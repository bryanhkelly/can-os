/** Clock-based quiet-hour calculation, independent of provider and database. */
export function nextAllowedDelivery(now: Date, timezone: string, start: string | null, end: string | null): Date | null {
  if (!start || !end || start === end) return null;
  if (!Number.isFinite(now.getTime()) || ![start, end].every(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
    throw new Error("Invalid notification quiet hours");
  }
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parse = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  const from = parse(start), to = parse(end);
  const within = (instant: Date) => {
    const parts = formatter.formatToParts(instant);
    const local = Number(parts.find(p => p.type === "hour")!.value) * 60 +
      Number(parts.find(p => p.type === "minute")!.value);
    return from < to ? local >= from && local < to : local >= from || local < to;
  };
  if (!within(now)) return null;
  // Search real minute boundaries, including skipped/repeated local times at DST.
  const firstMinute = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000;
  for (let minute = 0; minute < 48 * 60; minute++) {
    const candidate = new Date(firstMinute + minute * 60_000);
    if (!within(candidate)) return candidate;
  }
  throw new Error("Notification quiet hours have no delivery boundary within 48 hours");
}

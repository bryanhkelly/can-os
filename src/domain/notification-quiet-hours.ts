/** Clock-based quiet-hour calculation, independent of provider and database. */
export function nextAllowedDelivery(now: Date, timezone: string, start: string | null, end: string | null): Date | null {
  if (!start || !end || start === end) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
  } catch { return null; }
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  const local = hour * 60 + minute;
  const parse = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  const from = parse(start), to = parse(end);
  const within = from < to ? local >= from && local < to : local >= from || local < to;
  if (!within) return null;
  const remaining = ((to - local + 1440) % 1440) || 1440;
  // Reevaluate when quiet hours end; DST transitions are handled by the recheck.
  return new Date(now.getTime() + remaining * 60_000);
}

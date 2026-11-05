export type InterestEventEmailKind =
  | "confirmation"
  | "reminder_24h"
  | "reminder_2h"
  | "follow_up_attended"
  | "follow_up_no_show";

export function interestEventRegistrationEmailSchedule(startsAt: Date, now = new Date()) {
  const schedule: { kind: InterestEventEmailKind; deliverAt: Date }[] = [
    { kind: "confirmation", deliverAt: now },
  ];
  for (const reminder of [
    { kind: "reminder_24h" as const, offset: 24 * 60 * 60 * 1000 },
    { kind: "reminder_2h" as const, offset: 2 * 60 * 60 * 1000 },
  ]) {
    const deliverAt = new Date(startsAt.getTime() - reminder.offset);
    if (deliverAt > now) schedule.push({ kind: reminder.kind, deliverAt });
  }
  return schedule;
}

export function interestEventFollowUpTime(endsAt: Date | null, now = new Date()): Date {
  return endsAt && endsAt > now ? endsAt : now;
}

function escapeCalendarText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function foldCalendarLine(line: string): string {
  const folded: string[] = [];
  let segment = "";
  let bytes = 0;
  for (const character of line) {
    const length = new TextEncoder().encode(character).length;
    if (bytes + length > 75) {
      folded.push(segment);
      segment = " ";
      bytes = 1;
    }
    segment += character;
    bytes += length;
  }
  folded.push(segment);
  return folded.join("\r\n");
}

function formatCalendarInstant(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function renderInterestEventCalendar(input: {
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date | null;
  now?: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CAN OS//Interest Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(input.uid)}`,
    `DTSTAMP:${formatCalendarInstant(input.now ?? new Date())}`,
    `DTSTART:${formatCalendarInstant(input.startsAt)}`,
    ...(input.endsAt ? [`DTEND:${formatCalendarInstant(input.endsAt)}`] : []),
    `SUMMARY:${escapeCalendarText(input.title)}`,
    ...(input.description ? [`DESCRIPTION:${escapeCalendarText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${escapeCalendarText(input.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldCalendarLine).join("\r\n")}\r\n`;
}
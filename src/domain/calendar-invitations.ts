/** RFC 5545 / iTIP calendar requests and cancellations. Pure, server-safe,
 * and shared by enrollment, Sessions and interest-event email attachments. */
export type CalendarInvitationEvent = {
  uid: string;
  summary: string;
  startsAt: Date;
  endsAt?: Date;
  attendeeEmail?: string;
  organizerEmail?: string;
  description?: string;
  location?: string;
  sequence?: number;
};
export type CalendarInvitationMethod = "REQUEST" | "CANCEL" | "PUBLISH";

export function escapeCalendarText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** RFC 5545 lines fold at 75 UTF-8 octets, not 75 characters. */
export function foldCalendarLine(line: string): string {
  const parts: string[] = [];
  let segment = "";
  let count = 0;
  for (const character of line) {
    const bytes = new TextEncoder().encode(character).length;
    if (count + bytes > 75) {
      parts.push(segment);
      segment = " ";
      count = 1;
    }
    segment += character;
    count += bytes;
  }
  parts.push(segment);
  return parts.join("\r\n");
}

function validMailto(value: string): string {
  if (!/^[^@\s;:\r\n]+@[^@\s;:\r\n]+$/.test(value)) throw new Error("Invalid calendar recipient");
  return value;
}

function stamp(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid calendar instant");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** The same logical Session retains the same UID across requests/cancellations. */
export function classSessionCalendarUid(sessionId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("Invalid Class Session ID");
  return "class-session-" + sessionId.toLowerCase() + "@can-os";
}

export function renderCalendarInvitation(
  items: readonly CalendarInvitationEvent[],
  method: CalendarInvitationMethod,
  now = new Date(),
): string {
  if (items.length === 0) throw new Error("Calendar invitation needs at least one event");
  const dtstamp = stamp(now);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//CAN OS//Enrollment and Class Sessions//EN",
    "CALSCALE:GREGORIAN", "METHOD:" + method,
  ];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.uid || /[\r\n]/.test(item.uid) || seen.has(item.uid)) {
      throw new Error("Calendar UID must be unique and single-line");
    }
    if (!Number.isFinite(item.startsAt.getTime()) ||
        (item.endsAt !== undefined && (!Number.isFinite(item.endsAt.getTime()) || item.endsAt <= item.startsAt))) {
      throw new Error("Calendar event needs a valid positive interval");
    }
    const sequence = item.sequence ?? 0;
    if (!Number.isInteger(sequence) || sequence < 0) throw new Error("Invalid calendar sequence");
    seen.add(item.uid);
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + escapeCalendarText(item.uid),
      "DTSTAMP:" + dtstamp,
      "DTSTART:" + stamp(item.startsAt),
      ...(item.endsAt ? ["DTEND:" + stamp(item.endsAt)] : []),
      "SEQUENCE:" + sequence,
      "SUMMARY:" + escapeCalendarText(item.summary),
      ...(item.organizerEmail ? ["ORGANIZER:mailto:" + validMailto(item.organizerEmail)] : []),
      ...(item.attendeeEmail ? [
        "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:" + validMailto(item.attendeeEmail),
      ] : []),
      ...(item.description ? ["DESCRIPTION:" + escapeCalendarText(item.description)] : []),
      ...(item.location ? ["LOCATION:" + escapeCalendarText(item.location)] : []),
      ...(method === "CANCEL" ? ["STATUS:CANCELLED"] : ["STATUS:CONFIRMED"]),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldCalendarLine).join("\r\n") + "\r\n";
}

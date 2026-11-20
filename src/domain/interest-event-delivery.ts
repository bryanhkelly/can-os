import { renderCalendarInvitation } from "./calendar-invitations";

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

/** Calendar attachment is an actual iTIP request, not a PUBLISH-only export. */
export function renderInterestEventCalendar(input: {
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date | null;
  now?: Date;
}): string {
  // Missing event end time is not a made-up duration: use a one-minute
  // calendar placeholder only for email clients that require DTEND.
  const endsAt = input.endsAt ?? new Date(input.startsAt.getTime() + 60_000);
  return renderCalendarInvitation([{
    uid: input.uid, summary: input.title, description: input.description,
    location: input.location, startsAt: input.startsAt, endsAt,
  }], "REQUEST", input.now);
}

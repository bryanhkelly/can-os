import { z } from "zod";
import { isValidTimeZone } from "@/modules/calendar/timezone";

const uuid = z.string().uuid();
const plainText = (max: number, min = 0) => z.string().trim().min(min).max(max)
  .refine(value => !/[<>\r\n]/.test(value), "Use plain text");

export const interestEventCreateInput = z.object({
  requestId: uuid,
  programId: uuid,
  title: plainText(160, 3),
  description: z.string().trim().max(2000).refine(value => !/[<>]/.test(value), "Use plain text")
    .optional().default(""),
  kind: z.enum(["information_session", "open_house", "campus_tour", "family_experience", "other"]),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  timezone: z.string().min(1).max(100).refine(isValidTimeZone, "Use a valid IANA timezone"),
  location: plainText(300).optional().default(""),
  visibility: z.enum(["public", "invitation_only"]),
}).strict().refine(input => new Date(input.endsAt) > new Date(input.startsAt), {
  message: "Event end must be after its start",
  path: ["endsAt"],
});

export type InterestEventCreateInput = z.infer<typeof interestEventCreateInput>;

export const interestEventRegistrationInput = z.object({
  requestId: uuid,
  eventId: uuid,
  accessToken: z.string().max(128).default(""),
  invitationBatchId: uuid.optional(),
  invitationRecipientKey: uuid.optional(),
  firstName: plainText(80, 1),
  lastName: plainText(80, 1),
  email: z.string().trim().toLowerCase().email().max(254),
  contactConsent: z.literal("yes"),
  website: z.string().max(150).default(""),
}).strict().refine(input => Boolean(input.invitationBatchId) === Boolean(input.invitationRecipientKey), {
  message: "Both family invitation identifiers are required",
  path: ["invitationRecipientKey"],
});

export type InterestEventRegistrationInput = z.infer<typeof interestEventRegistrationInput>;

export const interestEventAttendanceInput = z.object({
  registrationId: uuid,
  attendanceStatus: z.enum(["attended", "no_show"]),
}).strict();

export type InterestEventAttendanceInput = z.infer<typeof interestEventAttendanceInput>;

export function interestEventRegistrationMessage(title: string): string {
  return `Interest event RSVP: ${title}`;
}

export function interestEventRsvpLink(origin: string, eventId: string, accessToken?: string): string {
  const url = new URL("/interest-event", origin);
  url.searchParams.set("eventId", eventId);
  if (accessToken) url.searchParams.set("accessToken", accessToken);
  return url.toString();
}

export function interestEventInvitationRsvpLink(
  origin: string,
  eventId: string,
  invitationBatchId: string,
  invitationRecipientKey: string,
): string {
  const url = new URL("/interest-event", origin);
  url.searchParams.set("eventId", eventId);
  url.searchParams.set("invitationBatchId", invitationBatchId);
  url.searchParams.set("invitationRecipientKey", invitationRecipientKey);
  return url.toString();
}

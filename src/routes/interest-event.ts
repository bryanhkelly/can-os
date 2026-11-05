import { createFileRoute } from "@tanstack/react-router";
import { escapePublicHtml } from "@/domain/public-site-html";
import { hasConfiguredPublicOrigin, publicHtmlResponse } from "@/lib/public-html-response.server";
import { interestEventRegistrationInput } from "@/domain/interest-events";
import { readSmallUrlEncodedBody } from "@/domain/public-admissions-interest";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { z } from "zod";

function html(body: string, status = 200) {
  return publicHtmlResponse(body, {
    title: "School interest event · CAN", maxWidth: "42rem", status,
  });
}

function unavailable() {
  return html("<h1>Event unavailable</h1><p>Contact the school that shared this event link for help.</p>", 404);
}

function configuredOrigin(request: Request) {
  return hasConfiguredPublicOrigin(request);
}

function formatEventDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: timezone,
  }).format(new Date(value));
}

function eventPage(
  event: Awaited<ReturnType<typeof import("@/modules/enrollment/interest-events.server").readInterestEventForRsvp>>,
  accessToken: string,
  invitation?: { batchId: string; recipientKey: string },
) {
  const invitationFields = invitation
    ? `<input type="hidden" name="invitationBatchId" value="${escapePublicHtml(invitation.batchId)}">
      <input type="hidden" name="invitationRecipientKey" value="${escapePublicHtml(invitation.recipientKey)}">`
    : "";
  const invitedFamily = event.invitedFamily;
  const form = `<form method="post" action="/interest-event">
    <input type="hidden" name="requestId" value="${crypto.randomUUID()}">
    <input type="hidden" name="eventId" value="${escapePublicHtml(event.id)}">
    <input type="hidden" name="accessToken" value="${escapePublicHtml(accessToken)}">
    ${invitationFields}
    <label style="display:block;margin:1rem 0">First name
      <input name="firstName" value="${escapePublicHtml(invitedFamily?.firstName ?? "")}" required maxlength="80" autocomplete="given-name" style="display:block;width:100%;padding:.6rem"></label>
    <label style="display:block;margin:1rem 0">Last name
      <input name="lastName" value="${escapePublicHtml(invitedFamily?.lastName ?? "")}" required maxlength="80" autocomplete="family-name" style="display:block;width:100%;padding:.6rem"></label>
    <label style="display:block;margin:1rem 0">Email address
      <input name="email" type="email" value="${escapePublicHtml(invitedFamily?.email ?? "")}" ${invitedFamily ? "readonly" : ""} required maxlength="254" autocomplete="email" style="display:block;width:100%;padding:.6rem"></label>
    <div style="position:absolute;left:-9999px" aria-hidden="true">
      <label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
    <label style="display:block;margin:1rem 0"><input name="contactConsent" type="checkbox" value="yes" required>
      I am an adult and agree the school may contact me about this event.</label>
    <button type="submit" style="padding:.8rem 1rem">RSVP</button>
  </form>`;
  const location = event.location
    ? `<p><strong>Location:</strong> ${escapePublicHtml(event.location)}</p>` : "";
  const description = event.description
    ? `<p>${escapePublicHtml(event.description).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>")}</p>` : "";
  const timing = escapePublicHtml(formatEventDate(event.startsAt, event.timezone));
  const end = event.endsAt
    ? ` – ${escapePublicHtml(formatEventDate(event.endsAt, event.timezone))}` : "";
  return `<p style="font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapePublicHtml(event.siteName)}</p>
    <h1>${escapePublicHtml(event.title)}</h1>
    <p>${escapePublicHtml(event.programName)} · ${timing}${end} (${escapePublicHtml(event.timezone)})</p>
    ${description}${location}
    <p>This RSVP is for the event only. It is not an application, admission decision, or confirmation that the school is authorized to operate.</p>
    ${form}`;
}

export const Route = createFileRoute("/interest-event")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!configuredOrigin(request)) return unavailable();
        const params = new URL(request.url).searchParams;
        const eventId = params.get("eventId") ?? "";
        const accessToken = params.get("accessToken") ?? "";
        const invitationBatchId = params.get("invitationBatchId") ?? "";
        const invitationRecipientKey = params.get("invitationRecipientKey") ?? "";
        if (!z.string().uuid().safeParse(eventId).success) return unavailable();
        const invitation = z.object({ batchId: z.string().uuid(), recipientKey: z.string().uuid() })
          .safeParse({ batchId: invitationBatchId, recipientKey: invitationRecipientKey });
        try {
          const { readInterestEventForRsvp } = await import("@/modules/enrollment/interest-events.server");
          const event = await readInterestEventForRsvp(eventId, accessToken,
            invitation.success ? invitation.data : undefined);
          return html(eventPage(event, accessToken, invitation.success ? invitation.data : undefined));
        } catch (error) {
          if (error instanceof DomainError && error.code === "UNAVAILABLE") return unavailable();
          console.error("Interest event page failed", { kind: "unexpected" });
          return html("<h1>Event temporarily unavailable</h1><p>Please try again shortly.</p>", 503);
        }
      },
      POST: async ({ request }) => {
        if (!configuredOrigin(request) || request.headers.get("origin") !== new URL(request.url).origin) {
          return unavailable();
        }
        try {
          const params = await readSmallUrlEncodedBody(request);
          const data = interestEventRegistrationInput.parse(Object.fromEntries(params.entries()));
          const { readInterestEventForRsvp, registerInterestEvent } =
            await import("@/modules/enrollment/interest-events.server");
          const invitation = data.invitationBatchId && data.invitationRecipientKey
            ? { batchId: data.invitationBatchId, recipientKey: data.invitationRecipientKey }
            : undefined;
          const event = await readInterestEventForRsvp(data.eventId, data.accessToken, invitation);
          const { admitPublicAdmissionsInterest } =
            await import("@/modules/enrollment/public-admissions-interest.server");
          const budget = await admitPublicAdmissionsInterest(
            event.visibility === "public" ? "interest_event" : "invited_family_interest",
            event.visibility === "public" ? event.siteSlug : undefined,
          );
          if (!budget.allowed) {
            return html("<h1>Please try again shortly</h1><p>Too many RSVPs have been received.</p>", 429);
          }
          await registerInterestEvent(data);
          return html(`<h1>RSVP received</h1><p>Thank you for responding to ${escapePublicHtml(event.title)} at ${escapePublicHtml(event.siteName)}.</p>
            <p>A confirmation with calendar details and event reminders will be sent to the email address provided, when email delivery is enabled.</p>
            <p>This confirms your event RSVP only. It does not create an application or enroll a student.</p>`);
        } catch (error) {
          if (error instanceof z.ZodError) {
            return html("<h1>Unable to receive your RSVP</h1><p>Review your contact details and event link, then try again.</p>", 400);
          }
          if (error instanceof DomainError) {
            if (error.code === "UNAVAILABLE" || error.code === "FORBIDDEN") return unavailable();
            if (error.code === "VALIDATION_FAILED") {
              return html("<h1>Unable to receive your RSVP</h1><p>Review your contact details and event link, then try again.</p>", 400);
            }
            if (error.code === "CONFLICT") {
              return html("<h1>RSVP could not be saved</h1><p>Refresh the page and submit again.</p>", 409);
            }
          }
          if (error instanceof AuthorizationError) return unavailable();
          console.error("Interest event RSVP failed", { kind: "unexpected" });
          return html("<h1>RSVP temporarily unavailable</h1><p>Please try again shortly.</p>", 503);
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { invitedFamilyInterestInput } from "@/domain/family-recruitment-interest";
import { readSmallUrlEncodedBody } from "@/domain/public-admissions-interest";
import { isLocalPreviewHost } from "@/domain/public-site-host-routing";
import { escapePublicHtml } from "@/domain/public-site-html";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { z } from "zod";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function html(body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>School information request · CAN</title></head>
    <body style="font-family:system-ui;max-width:38rem;margin:3rem auto;padding:1rem;line-height:1.5">
    ${body}</body></html>`, {
    status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}
function unavailable() {
  return html("<h1>Information request unavailable</h1><p>Contact the church that invited you for help.</p>", 404);
}
function welcomePage(context: {
  siteName: string;
  programName: string;
  programStatus: string;
  introduction: string;
  events: { id: string; title: string; startsAt: string; timezone: string; rsvpUrl: string }[];
}, invitationBatchId: string, invitationRecipientKey: string) {
  const events = context.events.length
    ? `<section aria-labelledby="events-heading"><h2 id="events-heading">Upcoming information events</h2>
      <ul>${context.events.map(event => `<li style="margin:.75rem 0"><strong>${escapePublicHtml(event.title)}</strong>
        <span>${escapePublicHtml(new Intl.DateTimeFormat("en-US", {
          weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
          timeZone: event.timezone,
        }).format(new Date(event.startsAt)))} (${escapePublicHtml(event.timezone)})</span>
        <a href="${escapePublicHtml(event.rsvpUrl)}">RSVP</a></li>`).join("")}</ul></section>`
    : "";
  return html(`<p style="font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase">A personal invitation</p>
    <h1>Welcome to ${escapePublicHtml(context.siteName)}</h1>
    <p>${escapePublicHtml(context.programName)}</p>
    <p>${escapePublicHtml(context.introduction)}</p>
    <p>${context.programStatus === "active"
      ? "This invitation is for school information and event RSVPs. You can ask questions or request updates below."
      : "This school is preparing to open. You can ask questions or request updates below."}
    This is not a school application, admission decision, or confirmation that the school is authorized to operate.</p>
    ${events}
    <h2>Request school updates</h2>
    <form method="post" action="/family/interest">
      <input type="hidden" name="requestId" value="${crypto.randomUUID()}">
      <input type="hidden" name="invitationBatchId" value="${escapePublicHtml(invitationBatchId)}">
      <input type="hidden" name="invitationRecipientKey" value="${escapePublicHtml(invitationRecipientKey)}">
      <label style="display:block;margin:1rem 0">First name
        <input name="firstName" required maxlength="80" autocomplete="given-name" style="display:block;width:100%;padding:.6rem"></label>
      <label style="display:block;margin:1rem 0">Last name
        <input name="lastName" required maxlength="80" autocomplete="family-name" style="display:block;width:100%;padding:.6rem"></label>
      <label style="display:block;margin:1rem 0">Email address that received the invitation
        <input name="email" type="email" required maxlength="254" autocomplete="email" style="display:block;width:100%;padding:.6rem"></label>
      <label style="display:block;margin:1rem 0">Questions for the school (optional)
        <textarea name="message" maxlength="500" rows="3" style="display:block;width:100%;padding:.6rem"></textarea></label>
      <div style="position:absolute;left:-9999px" aria-hidden="true">
        <label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <label style="display:block;margin:1rem 0"><input name="contactConsent" type="checkbox" value="yes" required>
        I am an adult and agree that this school may contact me about its opening and admissions.</label>
      <button type="submit" style="padding:.8rem 1rem">Request school updates</button>
    </form>
    <p style="font-size:.85rem">Submitting this form does not create a student account or an application.
    You can ask the school to stop contacting you.</p>`);
}
function configuredOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host && host.toLowerCase().replace(/\.$/, "") !== url.host.toLowerCase()) return false;
  if (process.env.CAN_PUBLIC_SITE_LOCAL_PREVIEW_WRITES_ENABLED === "true" &&
      url.protocol === "http:" && url.pathname === "/family/interest" &&
      isLocalPreviewHost(url.hostname)) return true;
  const configured = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
  if (!configured) return false;
  try {
    const destination = new URL(configured);
    return destination.protocol === "https:" && destination.pathname === "/" &&
      !destination.search && !destination.hash &&
      url.origin === destination.origin;
  } catch { return false; }
}

/** Anonymous, adult-only opt-in. The invitation ids are opaque routing context,
 * not proof of guardian identity; no child records or login are created. */
export const Route = createFileRoute("/family/interest")({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!configuredOrigin(request)) return unavailable();
      const params = new URL(request.url).searchParams;
      const invitationBatchId = params.get("invitationBatchId") ?? "";
      const invitationRecipientKey = params.get("invitationRecipientKey") ?? "";
      if (!uuid.test(invitationBatchId) || !uuid.test(invitationRecipientKey)) return unavailable();
      try {
        const { readPreopeningFamilyWelcome } = await import("@/modules/enrollment/family-invitations.server");
        const context = await readPreopeningFamilyWelcome(invitationBatchId, invitationRecipientKey);
        return welcomePage(context, invitationBatchId, invitationRecipientKey);
      } catch (error) {
        if (error instanceof AuthorizationError || error instanceof z.ZodError ||
          (error instanceof DomainError && error.code === "UNAVAILABLE")) return unavailable();
        console.error("Family invitation welcome page failed", { kind: "unexpected" });
        return html("<h1>School information temporarily unavailable</h1><p>Please try again shortly.</p>", 503);
      }
    },
    POST: async ({ request }) => {
      if (!configuredOrigin(request) || request.headers.get("origin") !== new URL(request.url).origin)
        return unavailable();
      let data: z.infer<typeof invitedFamilyInterestInput>;
      try {
        data = invitedFamilyInterestInput.parse(
          Object.fromEntries((await readSmallUrlEncodedBody(request)).entries()));
      } catch {
        return html("<h1>Unable to receive your request</h1><p>Check your contact details and try again.</p>", 400);
      }
      try {
        const { admitPublicAdmissionsInterest, recordInvitedFamilyInterest } =
          await import("@/modules/enrollment/public-admissions-interest.server");
        const budget = await admitPublicAdmissionsInterest("invited_family_interest");
        if (!budget.allowed) return html("<h1>Please try again shortly</h1><p>Too many requests have been received.</p>", 429);
        await recordInvitedFamilyInterest(data);
        return html("<h1>Thank you for your interest.</h1><p>Your request for school updates was received. The school may follow up. This is not an application, school opening approval or an enrollment confirmation.</p>");
      } catch (error) {
        if (error instanceof AuthorizationError) return unavailable();
        if (error instanceof DomainError && error.code === "UNAVAILABLE") return unavailable();
        console.error("Family interest submission failed", { kind: "unexpected" });
        return html("<h1>Unable to receive your request</h1><p>Please try again shortly.</p>", 503);
      }
    },
  } },
});

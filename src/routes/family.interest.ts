import { createFileRoute } from "@tanstack/react-router";
import { invitedFamilyInterestInput } from "@/domain/family-recruitment-interest";
import { readSmallUrlEncodedBody } from "@/domain/public-admissions-interest";

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
function configuredOrigin(request: Request) {
  const configured = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
  if (!configured) return false;
  try {
    const destination = new URL(configured);
    return destination.protocol === "https:" && destination.pathname === "/" &&
      !destination.search && !destination.hash &&
      new URL(request.url).origin === destination.origin;
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
      return html(`<h1>Interested in learning more?</h1>
        <p>Your church has shared preliminary information about a school it is preparing to open.
        Request updates below. This is not a school application or enrollment offer.
        The school may not yet have authorization to operate.</p>
        <form method="post" action="/family/interest">
          <input type="hidden" name="requestId" value="${crypto.randomUUID()}">
          <input type="hidden" name="invitationBatchId" value="${invitationBatchId}">
          <input type="hidden" name="invitationRecipientKey" value="${invitationRecipientKey}">
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
    },
    POST: async ({ request }) => {
      if (!configuredOrigin(request) || request.headers.get("origin") !== new URL(request.url).origin)
        return unavailable();
      try {
        const { admitPublicAdmissionsInterest, recordInvitedFamilyInterest } =
          await import("@/modules/enrollment/public-admissions-interest.server");
        const budget = await admitPublicAdmissionsInterest("invited_family_interest");
        if (!budget.allowed) return html("<h1>Please try again shortly</h1><p>Too many requests have been received.</p>", 429);
        const data = invitedFamilyInterestInput.parse(
          Object.fromEntries((await readSmallUrlEncodedBody(request)).entries()));
        await recordInvitedFamilyInterest(data);
        return html("<h1>Thank you for your interest.</h1><p>Your request for school updates was received. The school may follow up. This is not an application, school opening approval or an enrollment confirmation.</p>");
      } catch {
        return html("<h1>Unable to receive your request</h1><p>Check that you entered the email address which received the invitation, then try again. You may also contact the inviting church.</p>", 400);
      }
    },
  } },
});

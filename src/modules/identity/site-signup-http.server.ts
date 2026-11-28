import {siteSignupSchema} from "@/domain/school-setup";
const noStore={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
/** Existing public admission and challenge issuance. This handler does not grant
 * Organization or Site authority: mailbox redemption owns verified provisioning. */
export async function handleSiteSignupRequest(request:Request):Promise<Response>{
      if (new URL(request.url).origin !== request.headers.get("origin")) {
        return Response.json({ error: "Invalid request origin" }, { status: 403, headers: noStore });
      }
      try {
        const gate = await import("@/modules/identity/anonymous-auth-admission.server");
        const denial = gate.anonymousAuthAdmissionResponse(await gate.admitAnonymousAuthRequest("school_setup"));
        if (denial) return denial;
      } catch {
        console.error("[site-signup] admission unavailable");
        return Response.json({ error: "Site setup is temporarily unavailable." },
          { status: 503, headers: { ...noStore, "Retry-After": "30" } });
      }
      let submitted: unknown;
      try {
        const text = await request.text();
        if (text.length > 4096) {
          return Response.json({ error: "Submission is too large." }, { status: 413, headers: noStore });
        }
        submitted = JSON.parse(text);
      } catch {
        return Response.json({ error: "Invalid submission." }, { status: 400, headers: noStore });
      }
      const parsed = siteSignupSchema.safeParse(submitted);
      if (!parsed.success) {
        return Response.json({ error: "Please check the Site and administrator details." },
          { status: 400, headers: noStore });
      }
      try {
        const { requestSiteSignup } = await import("@/modules/identity/passwordless-access.server");
        const outcome = await requestSiteSignup(parsed.data);
        return Response.json(outcome, { status: 202, headers: noStore });
      } catch {
        console.error("[site-signup] account setup unavailable");
        return Response.json({ error: "Site setup could not be completed. Check your details or sign in if you already have an account." },
          { status: 409, headers: noStore });
      }
}

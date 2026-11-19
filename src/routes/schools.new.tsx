import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";
import { realSchoolSetupSignupSchema, schoolSetupSchema } from "@/domain/school-setup";
import { DomainError } from "@/domain/errors";

export const Route = createFileRoute("/schools/new")({
  // Legacy URL no longer presents a competing school-creation experience.
  loader: () => { throw redirect({ to: "/site/new" }); },
  server: { handlers: {
    POST: createServerOnlyFn(async ({ request }) => {
      const headers = { "Cache-Control": "no-store" };
      if (new URL(request.url).origin !== request.headers.get("origin"))
        return Response.json({ error: "Invalid request origin" }, { status: 403, headers });
      try {
        const gate = await import("@/modules/identity/anonymous-auth-admission.server");
        const denial = gate.anonymousAuthAdmissionResponse(await gate.admitAnonymousAuthRequest("school_setup"));
        if (denial) return denial;
      } catch {
        console.error("[school-setup] admission unavailable");
        return Response.json({ error: "School setup is temporarily unavailable." },
          { status: 503, headers: { ...headers, "Retry-After": "30" } });
      }
      let payload: unknown;
      try {
        const text = await request.text();
        if (text.length > 4096) return Response.json({ error: "Submission is too large." }, { status: 413, headers });
        payload = JSON.parse(text);
      } catch {
        return Response.json({ error: "Invalid submission." }, { status: 400, headers });
      }
      const requestPayload = payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown> : null;
      if (requestPayload?.mode === "email") {
        const parsedSignup = realSchoolSetupSignupSchema.safeParse({
          name: requestPayload.name, email: requestPayload.email,
          firstName: requestPayload.firstName, lastName: requestPayload.lastName,
        });
        if (!parsedSignup.success) return Response.json({
          error: "Enter your school name and a valid email address and administrator name.",
        }, { status: 400, headers });
        try {
          const access = await import("@/modules/identity/passwordless-access.server");
          await access.requestSchoolSetupAccess(parsedSignup.data);
          return Response.json({ accepted: true }, { status: 202, headers });
        } catch {
          console.error("[school-setup] email signup unavailable");
          return Response.json({ accepted: true }, { status: 202, headers });
        }
      }
      const { mode: _mode, ...demoPayload } = requestPayload ?? {};
      const parsed = schoolSetupSchema.safeParse(demoPayload);
      if (!parsed.success) return Response.json({
        error: "Enter a school name, an available .demo domain and a valid timezone, and confirm synthetic-only use.",
      }, { status: 400, headers });
      try {
        const { setupSchool } = await import("@/modules/identity/school-setup.server");
        const result = await setupSchool(parsed.data);
        return Response.json(result, { status: result.created ? 201 : 200, headers });
      } catch (error) {
        if (error instanceof DomainError && error.code === "CONFLICT")
          return Response.json({ error: "This domain is already assigned or unavailable. Use its existing account or choose another domain." },
            { status: 409, headers });
        console.error("[school-setup] provisioning unavailable");
        return Response.json({ error: "School setup is temporarily unavailable. Retry with the same domain." },
          { status: 503, headers: { ...headers, "Retry-After": "30" } });
      }
    }),
  } },
  component: () => null,
});

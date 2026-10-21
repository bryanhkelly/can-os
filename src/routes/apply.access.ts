import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/apply/access")({
  server: { handlers: {
    POST: async ({ request }) => {
      const headers = { "Cache-Control": "no-store" };
      if (new URL(request.url).origin !== request.headers.get("origin"))
        return Response.json({ error: "Invalid request origin" }, { status: 403, headers });
      const { applicantRegistration, registerApplicant } = await import("@/modules/identity/applicant-access.server");
      let body: unknown;
      try { body = await request.json(); }
      catch { return Response.json({ error: "Invalid registration request" }, { status: 400, headers }); }
      const input = applicantRegistration.safeParse(body);
      if (!input.success) return Response.json({ error: "Enter a program, name and valid email address" }, { status: 400, headers });
      try {
        const session = await registerApplicant(input.data);
        return Response.json({ accepted: true, signedIn: Boolean(session) }, {
          headers: { ...headers, ...(session ? { "Set-Cookie": session.setCookie } : {}) },
        });
      } catch (error) {
        console.error("Applicant registration failed", error);
        return Response.json({ error: "Unable to establish applicant access. Check the program, email and demo code, or contact the school." },
          { status: 400, headers });
      }
    },
  } },
});

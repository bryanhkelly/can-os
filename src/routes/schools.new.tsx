import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { schoolSetupSchema, type SchoolSetupResult } from "@/domain/school-setup";
import { DomainError } from "@/domain/errors";
import { useMutationFeedback } from "@/lib/mutation-feedback";

export const Route = createFileRoute("/schools/new")({
  server: { handlers: {
    POST: async ({ request }) => {
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
      const parsed = schoolSetupSchema.safeParse(payload);
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
    },
  } },
  component: SchoolSetupPage,
});

function SchoolSetupPage() {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [syntheticOnly, setSyntheticOnly] = useState(false);
  const [result, setResult] = useState<SchoolSetupResult | null>(null);
  const mutation = useMutationFeedback(async () => {});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const outcome = await mutation.run(async () => {
      const response = await fetch("/schools/new", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain, timezone, syntheticOnly }),
      });
      if (!response.ok) {
        throw new DomainError(response.status === 409 ? "CONFLICT" :
          response.status === 400 ? "VALIDATION_FAILED" : "UNAVAILABLE");
      }
      const value: SchoolSetupResult = await response.json();
      return value;
    }, {
      successMessage: "Your demo school is ready for setup.",
      commandErrorMessage: "Unable to create the school. Retry with the same domain.",
    });
    if (outcome.status === "saved") setResult(outcome.value);
  }

  const field = "mt-1 block w-full rounded-lg border bg-background p-3";
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-12">
    <header>
      <p className="text-sm font-semibold text-muted-foreground">CAN OS school setup</p>
      <h1 className="mt-2 font-serif text-4xl">Create a school</h1>
      <p className="mt-3">Use a domain ending in .demo to create an isolated demonstration school and test setup from the beginning.</p>
    </header>
    {result ? <section role="status" className="space-y-4 rounded-xl border bg-card p-6">
      <h2 className="font-serif text-2xl">Your demo school is ready</h2>
      <p>Domain: <strong>{result.domain}</strong></p>
      <p>Site Admin: <strong>{result.adminEmail}</strong></p>
      <p>Shared sign-in code: <strong>000000</strong></p>
      <p>Sign in to configure programs, academics, staffing and enrollment through the normal school setup workflow.</p>
      <Link to="/access" search={{ email: result.adminEmail }} className="inline-block rounded-lg bg-foreground px-5 py-3 text-background">Sign in and continue setup</Link>
    </section> : <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-6">
      <label className="block">School name
        <input required minLength={2} maxLength={160} value={name} onChange={event => setName(event.target.value)} className={field} />
      </label>
      <label className="block">School domain
        <input required placeholder="newschool.demo" maxLength={48} autoCapitalize="none" spellCheck={false}
          value={domain} onChange={event => setDomain(event.target.value)} className={field} />
      </label>
      <label className="block">School timezone
        <input required maxLength={80} value={timezone} onChange={event => setTimezone(event.target.value)} className={field} />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input required type="checkbox" checked={syntheticOnly} onChange={event => setSyntheticOnly(event.target.checked)} className="mt-1" />
        <span>I will use synthetic data only. This school and its shared accounts are public demonstrations, not private records.</span>
      </label>
      <p className="text-sm text-muted-foreground">Each .demo domain creates a separate tenant. External email and SMS are suppressed. This domain is a demo identity, not a live website address; publishing and opening readiness remain separate.</p>
      {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error}</p>}
      <button disabled={mutation.pending} className="rounded-lg bg-foreground px-5 py-3 text-background disabled:opacity-50">
        {mutation.pending ? "Creating school..." : "Create demo school"}
      </button>
    </form>}
    <Link to="/access" className="text-sm underline">Already have a school? Sign in</Link>
  </main>;
}

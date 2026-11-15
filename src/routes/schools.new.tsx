import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { realSchoolSetupSignupSchema, schoolSetupSchema, type SchoolSetupResult } from "@/domain/school-setup";
import { DomainError } from "@/domain/errors";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { useHydrated } from "@/lib/use-hydrated";
import { DEFAULT_SITE_TIMEZONE } from "@/domain/site-timezone";
import { SiteTimezoneField } from "@/components/workspace/SiteTimezoneField";
import { WorkspaceShell } from "@/components/workspace";

export const Route = createFileRoute("/schools/new")({
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
  component: SchoolSetupPage,
});

function SchoolSetupPage() {
  const hydrated = useHydrated();
  const [mode, setMode] = useState<"email" | "demo">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [domain, setDomain] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_SITE_TIMEZONE);
  const [syntheticOnly, setSyntheticOnly] = useState(false);
  const [result, setResult] = useState<SchoolSetupResult | null>(null);
  const [signupRequested, setSignupRequested] = useState(false);
  const mutation = useMutationFeedback(async () => {});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const outcome = await mutation.run(async () => {
      const response = await fetch("/schools/new", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "demo"
          ? { mode, name, domain, timezone, syntheticOnly }
          : { mode, name, email, firstName, lastName }),
      });
      if (!response.ok) {
        throw new DomainError(response.status === 409 ? "CONFLICT" :
          response.status === 400 ? "VALIDATION_FAILED" : "UNAVAILABLE");
      }
      return mode === "demo" ? await response.json() as SchoolSetupResult : null;
    }, {
      successMessage: mode === "demo" ? "Your demo school is ready for setup." : "Check your email for a secure setup link.",
      commandErrorMessage: mode === "demo" ? "Unable to create the school. Retry with the same domain." : "Unable to start school setup. Please try again.",
    });
    if (outcome.status === "saved") {
      if (mode === "demo") setResult(outcome.value!);
      else setSignupRequested(true);
    }
  }

  const field = "mt-1 block min-h-11 w-full border border-border bg-background p-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  return <WorkspaceShell width="reading" eyebrow="CAN OS · School setup" title="Create a school"
    subtitle="Create a school profile and continue in its Launch Hub. Real schools use verified email; demo schools use a shared access code.">
    <div className="mt-6 max-w-xl space-y-6">
    {signupRequested ? <section role="status" className="space-y-4 border border-border bg-card p-6">
      <h2 className="font-serif text-2xl">Check your email</h2>
      <p>If this email can start school setup, a one-time link will arrive shortly. Open it to verify your address and continue to the Launch Hub.</p>
      <p className="text-sm text-muted-foreground">Already have a CAN OS account? Sign in with that account instead.</p>
      <Link to="/access" search={{ email }} className="inline-flex min-h-11 items-center border border-border px-5 py-3 font-semibold">Return to sign in</Link>
    </section> : result ? <section role="status" className="space-y-4 border border-border bg-card p-6">
      <h2 className="font-serif text-2xl">Your demo school is ready</h2>
      <p>Domain: <strong>{result.domain}</strong></p>
      <p>Site Admin: <strong>{result.adminEmail}</strong></p>
      <p>Shared sign-in code: <strong>000000</strong></p>
      <p>Your basic school profile is saved. Sign in to open its Launch Hub; academic Programs can be added later.</p>
      <Link to="/access" search={{ email: result.adminEmail, returnTo: `/launch/hub/school?siteId=${result.siteId}` }} className="inline-flex min-h-11 items-center bg-foreground px-5 py-3 font-semibold text-background">Sign in and continue setup</Link>
    </section> : <form onSubmit={submit} className="space-y-4 border border-border bg-card p-6">
      <label className="block">School name
        <input required minLength={2} maxLength={160} value={name} onChange={event => setName(event.target.value)} className={field} />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Account type</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="setup-mode" checked={mode === "email"} onChange={() => setMode("email")} />Real school</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="setup-mode" checked={mode === "demo"} onChange={() => setMode("demo")} />Demo school</label>
      </fieldset>
      {mode === "email" ? <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">Administrator first name
          <input required autoComplete="given-name" maxLength={80} value={firstName} onChange={event => setFirstName(event.target.value)} className={field} />
        </label>
        <label className="block">Administrator last name
          <input required autoComplete="family-name" maxLength={80} value={lastName} onChange={event => setLastName(event.target.value)} className={field} />
        </label>
        <label className="block sm:col-span-2">Administrator email
          <input required type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} className={field} />
        </label>
      </div> : <>
        <label className="block">School demo domain
          <input required placeholder="newschool.demo" maxLength={48} autoCapitalize="none" spellCheck={false}
            value={domain} onChange={event => setDomain(event.target.value)} className={field} />
        </label>
        <SiteTimezoneField value={timezone} onChange={setTimezone} />
        <label className="flex items-start gap-3 text-sm">
          <input required type="checkbox" checked={syntheticOnly} onChange={event => setSyntheticOnly(event.target.checked)} className="mt-1" />
          <span>I will use synthetic data only. This school and its shared accounts are public demonstrations, not private records.</span>
        </label>
        <p className="text-sm text-muted-foreground">Each .demo domain creates an isolated tenant. External email and SMS are suppressed. Publishing and opening readiness remain separate.</p>
      </>}
      {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error}</p>}
      <button disabled={!hydrated || mutation.pending} className="min-h-11 border border-primary bg-primary px-5 py-3 font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50">
        {mutation.pending ? mode === "demo" ? "Creating school..." : "Sending setup link..." : mode === "demo" ? "Create demo school" : "Continue with email"}
      </button>
    </form>}
    <Link to="/access" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">Already have a school? Sign in</Link>
    </div>
  </WorkspaceShell>;
}

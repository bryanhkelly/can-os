import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WorkspaceShell } from "@/components/workspace";
import { safeAccessReturnTo } from "@/domain/access-navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { logAuthenticationUnavailable } from "@/domain/access-errors";

export const Route = createFileRoute("/access/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: safeAccessReturnTo(search.returnTo),
  }),
  server: { handlers: { POST: createServerOnlyFn(async ({ request }) => {
    if (new URL(request.url).origin !== request.headers.get("origin"))
      return Response.json({ error: "Invalid request origin" }, { status: 403 });
    try {
      const gate = await import("@/modules/identity/anonymous-auth-admission.server");
      const denial = gate.anonymousAuthAdmissionResponse(
        await gate.admitAnonymousAuthRequest("account_signup"));
      if (denial) return denial;
    } catch {
      logAuthenticationUnavailable("admission");
      return Response.json({ error: "Registration temporarily unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    let data: unknown;
    try { data = await request.json(); }
    catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
    try {
      await (await import("@/modules/identity/personal-account-signup.server"))
        .requestPersonalCanAccount(data);
      return Response.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error && typeof error === "object" && "issues" in error)
        return Response.json({ error: "Check your registration details" }, { status: 400 });
      logAuthenticationUnavailable("personal_registration");
      return Response.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
    }
  }) } },
  component: RegisterPersonalAccount,
});

function RegisterPersonalAccount() {
  const { returnTo } = Route.useSearch();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const hydrated = useHydrated();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/access/register", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email,
          ...(returnTo ? { returnTo } : {}) }),
      });
      if (response.status === 429) setMessage("Too many requests. Please try again later.");
      else if (response.status === 503) setMessage("Account creation is temporarily unavailable.");
      else if (!response.ok) setMessage("Please check your name and email address.");
      else setMessage("If this address is eligible, we've sent a secure email link. Open it to complete account creation or sign in.");
    } catch { setMessage("Account creation is temporarily unavailable."); }
    finally { setBusy(false); }
  }
  return <WorkspaceShell width="reading" eyebrow="CAN account" title="Create your CAN account"
    subtitle="One account for learning, schools, organizations and programs. Joining a school or course is a separate step.">
    <section className="mt-6 max-w-xl border border-border bg-card p-6">
      <form onSubmit={submit} aria-busy={busy} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required><Input name="given-name" autoComplete="given-name" required
            maxLength={80} value={firstName} onChange={event => setFirstName(event.target.value)} /></Field>
          <Field label="Last name" required><Input name="family-name" autoComplete="family-name" required
            maxLength={80} value={lastName} onChange={event => setLastName(event.target.value)} /></Field>
        </div>
        <Field label="Email address" required><Input name="email" type="email" autoComplete="email"
          required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></Field>
        <p className="text-sm leading-6 text-muted-foreground">We'll email you a single-use link. Your details stay in CAN OS; joining a participating organization requires a separate registration or invitation.</p>
        <Button type="submit" disabled={!hydrated || busy} className="w-full">
          {busy ? "Sending verification…" : "Continue with email"}
        </Button>
        <p role="status" aria-live="polite" className="text-sm">{message}</p>
      </form>
      <div className="mt-6 border-t border-border pt-5 text-sm">
        Already have a CAN account? <Link to="/access" search={returnTo ? { returnTo } : {}}
          className="font-semibold text-primary underline underline-offset-4">Sign in</Link>
      </div>
    </section>
  </WorkspaceShell>;
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { WorkspaceShell, WorkspacePanel, WorkspaceNotice } from "@/components/workspace";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { safeAccessReturnTo } from "@/domain/access-navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { registerAccount } from "@/lib/api/browser-access";

export const Route = createFileRoute("/access/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: safeAccessReturnTo(search.returnTo),
  }),
  server: { handlers: { POST: createServerOnlyFn(async ({ request }) => {
   const {handlePersonalRegistration}=await import("@/modules/identity/access-http.server");
   return handlePersonalRegistration(request);
  }) } },
  component: RegisterPersonalAccount,
});

function RegisterPersonalAccount() {
  const { returnTo } = Route.useSearch();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [privateAccessCode, setPrivateAccessCode] = useState<string|null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "attention" | "danger">("info");
  const hydrated = useHydrated();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || privateAccessCode || !adultConfirmed) return;
    setBusy(true); setMessage(""); setMessageTone("info");
    try {
      const { response, data: result } = await registerAccount({
        firstName, lastName, email, adultConfirmed: true,
        ...(returnTo ? { returnTo } : {}),
      });
      if (response.status === 429) { setMessageTone("attention"); setMessage("Too many requests. Please try again later."); }
      else if (response.status === 503) { setMessageTone("danger"); setMessage("Account creation is temporarily unavailable."); }
      else if (!response.ok || !result?.accepted) { setMessageTone("attention"); setMessage("Please check your name and email address."); }
      else {
        setPrivateAccessCode(result.privateAccessCode??null);
        setMessage(result.privateAccessCode ? "Your demo account is ready. Sign in with 000000." : isDemoAccountEmail(email) ? "If you already have an eligible account, use your existing access credential to sign in." : "If this address is eligible, we have requested a secure email link. Open it to complete account creation or sign in.");
      }
    } catch { setMessageTone("danger"); setMessage("Account creation is temporarily unavailable."); }
    finally { setBusy(false); }
  }
  return <WorkspaceShell width="reading" eyebrow="CAN account" title="Create your CAN account"
    subtitle="One account for learning, schools, organizations and programs. Joining a school or course is a separate step.">
    <WorkspacePanel title="Account details" className="mt-6 max-w-xl">
      {privateAccessCode ? <div className="space-y-4"><WorkspaceNotice>Use this demo access code only with synthetic accounts.</WorkspaceNotice><Field label="Demo access code"><Input value={privateAccessCode} readOnly autoComplete="off" /></Field><Button asChild><Link to="/access" search={{email,returnTo}}>Sign in</Link></Button></div> : <form onSubmit={submit} aria-busy={busy} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required><Input name="given-name" autoComplete="given-name" required
            maxLength={80} value={firstName} onChange={event => setFirstName(event.target.value)} /></Field>
          <Field label="Last name" required><Input name="family-name" autoComplete="family-name" required
            maxLength={80} value={lastName} onChange={event => setLastName(event.target.value)} /></Field>
        </div>
        <Field label="Email address" required><Input name="email" type="email" autoComplete="email"
          required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></Field>
        <Label className="flex items-start gap-3 text-sm leading-6">
          <Checkbox required checked={adultConfirmed}
            onChange={event => setAdultConfirmed(event.target.checked)}
            className="mt-1"/>
          I am at least 18 years old. Student accounts for minors are set up through an authorized school or guardian.
        </Label>
        <p className="text-sm leading-6 text-muted-foreground">{isDemoAccountEmail(email) ? "New addresses in registered demo domains receive automatic account approval and the demo access code. Joining a program is a separate step." : "We will email you a single-use link. Your details stay in CAN OS; joining a participating organization requires a separate registration or invitation."}</p>
        <Button type="submit" disabled={!hydrated} loading={busy} loadingLabel="Creating account…" className="w-full">
          Continue
        </Button>
        {message && <WorkspaceNotice tone={messageTone}>{message}</WorkspaceNotice>}
      </form>}
      <div className="mt-6 border-t border-border pt-5 text-sm">
        Already have a CAN account? <Link to="/access" search={returnTo ? { returnTo } : {}}
          className="font-semibold text-primary underline underline-offset-4">Sign in</Link>
      </div>
    </WorkspacePanel>
  </WorkspaceShell>;
}

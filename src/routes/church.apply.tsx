import { Field } from "@/components/ui/field";
import { WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { ChurchApplicationConfirmation } from "@/components/church/ChurchApplicationConfirmation";
import { churchApplicationSchema as applicationSchema, churchApplicationLimits,
  type ChurchApplicationField } from "@/domain/church-application";
import { DEFAULT_SITE_TIMEZONE } from "@/domain/site-timezone";
import { SiteTimezoneField } from "@/components/workspace/SiteTimezoneField";

export const Route = createFileRoute("/church/apply")({
  server: { handlers: {
    POST: createServerOnlyFn(async ({ request }) => {
      if (new URL(request.url).origin !== request.headers.get("origin"))
        return Response.json({ error: "Invalid request origin" }, { status: 403 });
      try {
        const gate = await import("@/modules/identity/anonymous-auth-admission.server");
        const denial = gate.anonymousAuthAdmissionResponse(await gate.admitAnonymousAuthRequest("church_application"));
        if (denial) return denial;
      } catch {
        return Response.json({ error: "Service temporarily unavailable" }, {
          status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" },
        });
      }
      let payload: unknown;
      try { payload = await request.json(); }
      catch { return Response.json({ error: "Invalid submission" }, { status: 400 }); }
      const parsed = applicationSchema.safeParse(payload);
      if (!parsed.success) return Response.json({ error: "Check the information you entered." }, { status: 400 });
      try {
        const { submitChurchApplication } = await import("@/modules/networks/church-applications.server");
        await submitChurchApplication(parsed.data);
        // Never reveal whether the contact already has an application.
        return Response.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        return Response.json({ error: "Unable to submit your request right now." }, {
          status: 503, headers: { "Cache-Control": "no-store" },
        });
      }
    }),
  } },
  component: ChurchApplicationPage,
});

function ChurchApplicationPage() {
  const [form, setForm] = useState({
    churchName: "", siteName: "", timezone: DEFAULT_SITE_TIMEZONE,
    churchWebsite: "", leaderTitle: "", contactEmail: "", firstName: "", lastName: "",
  });
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<{churchName:string;siteName:string;contactEmail:string}|null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ChurchApplicationField, string[]>>>({});
  function change(key: keyof typeof form, value: string) {
    setForm(s => ({ ...s, [key]: value }));
    setFieldErrors(errors => ({ ...errors, [key]: undefined }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (busy) return;
    const parsed = applicationSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      setError("Check the highlighted fields.");
      const firstField = parsed.error.issues[0]?.path[0];
      if (typeof firstField === "string") document.getElementById(`church-${firstField}`)?.focus();
      return;
    }
    setFieldErrors({}); setBusy(true);
    try {
      const response = await fetch("/church/apply", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Applications are busy. Try again shortly." :
          response.status === 400 ? "Check your contact details, website and timezone." :
          "Unable to submit right now. Please try again.");
        return;
      }
      setSubmitted({churchName:parsed.data.churchName,siteName:parsed.data.siteName,contactEmail:parsed.data.contactEmail});
    } catch { setError("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <WorkspaceShell width="reading" eyebrow="Church partnership"
    title="Bring a school to your church"
    subtitle="Tell us about your church and proposed Site. CAN independently verifies your authority to represent the church before issuing access.">
    <div className="mt-6">
      {submitted ? <ChurchApplicationConfirmation {...submitted}/> :
      <WorkspacePanel title="Partnership information"
        description="Provide your church and contact details to request onboarding.">
        <form noValidate onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {([
            ["churchName","Church name"],["siteName","Proposed school site name"],
            ["firstName","Your first name"],["lastName","Your last name"],
            ["leaderTitle","Your role at the church"],["contactEmail","Your work email"],
          ] as const).map(([key,label]) => <Field key={key} label={label} required
              error={fieldErrors[key]?.[0]}>
              <Input id={`church-${key}`} required
                type={key==="contactEmail"?"email":"text"}
                maxLength={churchApplicationLimits[key]}
                value={form[key]} onChange={event=>change(key,event.target.value)} />
            </Field>)}
          <SiteTimezoneField value={form.timezone} onChange={value=>change("timezone",value)} />
          <Field label="Church website (optional)" error={fieldErrors.churchWebsite?.[0]}>
            <Input id="church-churchWebsite" type="url" placeholder="https://…"
              maxLength={churchApplicationLimits.churchWebsite}
              value={form.churchWebsite} onChange={event=>change("churchWebsite",event.target.value)}/>
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">CAN will verify church authorization outside this form. Email ownership is also checked by a one-time sign-in link after approval.</p>
          {error&&<p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
          <Button type="submit" disabled={busy} loading={busy}
            loadingLabel="Sending…" className="sm:col-span-2">Request church onboarding</Button>
        </form>
      </WorkspacePanel>}
    </div>
  </WorkspaceShell>;
}

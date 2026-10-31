import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";

const applicationSchema = z.object({
  churchName: z.string().trim().min(2).max(160),
  siteName: z.string().trim().min(2).max(160),
  timezone: z.string().trim().min(3).max(80),
  churchWebsite: z.union([z.literal(""), z.string().trim().url().max(500).refine(v => v.startsWith("https://"))]).optional(),
  leaderTitle: z.string().trim().min(2).max(100),
  contactEmail: z.string().trim().email().max(254).toLowerCase(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
}).strict();

export const Route = createFileRoute("/church/apply")({
  server: { handlers: {
    POST: async ({ request }) => {
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
    },
  } },
  component: ChurchApplicationPage,
});

const field = "mt-1 block w-full rounded-lg border bg-background p-3 text-sm";
function ChurchApplicationPage() {
  const [form, setForm] = useState({
    churchName: "", siteName: "", timezone: "America/Los_Angeles",
    churchWebsite: "", leaderTitle: "", contactEmail: "", firstName: "", lastName: "",
  });
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  function change(key: keyof typeof form, value: string) { setForm(s => ({ ...s, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/church/apply", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Applications are busy. Try again shortly." :
          response.status === 400 ? "Check your contact details, website and timezone." :
          "Unable to submit right now. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch { setError("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-2xl space-y-6 px-5 py-12">
    <div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Church partnership</p>
      <h1 className="mt-2 font-serif text-4xl">Bring a school to your church</h1>
      <p className="mt-3 text-muted-foreground">Tell us about your church and your proposed school location. CAN will independently verify that you are authorized to represent the church before issuing access.</p>
    </div>
    {submitted ? <section role="status" className="rounded-xl border bg-card p-6">
      <h2 className="font-serif text-2xl">Request received</h2>
      <p className="mt-2">CAN will review the information and verify church authority. If approved, the authorized church leader will receive a secure email invitation to start school setup.</p>
      <p className="mt-2 text-sm text-muted-foreground">Submitting an application does not approve the church, authorize operation, or open enrollment.</p>
      <Link to="/access" className="mt-4 inline-block underline">Already invited? Sign in</Link>
    </section> : <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-card p-6 sm:grid-cols-2">
      {([
        ["churchName","Church name"],["siteName","Proposed school site name"],
        ["firstName","Your first name"],["lastName","Your last name"],
        ["leaderTitle","Your role at the church"],["contactEmail","Your work email"],
      ] as const).map(([key,label]) => <label key={key} className="text-sm font-semibold">{label}
        <input required type={key==="contactEmail"?"email":"text"} maxLength={key==="contactEmail"?254:160}
          className={field} value={form[key]} onChange={event=>change(key,event.target.value)} /></label>)}
      <label className="text-sm font-semibold">School timezone
        <select className={field} value={form.timezone} onChange={event=>change("timezone",event.target.value)}>
          {["America/Los_Angeles","America/Denver","America/Chicago","America/New_York","America/Phoenix","America/Anchorage","Pacific/Honolulu","UTC"].map(tz=><option value={tz} key={tz}>{tz.replaceAll("_"," ")}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">Church website (optional)
        <input type="url" placeholder="https://…" maxLength={500} className={field}
          value={form.churchWebsite} onChange={event=>change("churchWebsite",event.target.value)}/></label>
      <p className="text-xs text-muted-foreground sm:col-span-2">CAN will verify church authorization outside this form. Email ownership is also checked by a one-time sign-in link after approval.</p>
      {error&&<p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-lg bg-foreground px-4 py-3 font-semibold text-background disabled:opacity-50 sm:col-span-2">{busy?"Sending…":"Request church onboarding"}</button>
    </form>}
  </main>;
}

import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { prepareChurchOnboarding } from "@/modules/networks/network-steward.functions";

const field = "mt-1 block w-full rounded-lg border bg-background p-2 text-sm";
const defaults = {
  churchName: "", churchSlug: "", siteName: "", siteSlug: "",
  timezone: "America/Los_Angeles", contactEmail: "",
  firstName: "", lastName: "", authorityDocumentId: "",
};
type Draft = typeof defaults;

export function ChurchBootstrapPanel() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await prepareChurchOnboarding({ data: draft });
      setSuccess(`Church ${result.churchId} and Site ${result.siteId} prepared. ` +
        (result.invitationPending
          ? result.emailSent
            ? "A launch administrator access email was requested. The grant activates only on email-link acceptance."
            : "Invitation recorded, but email was not accepted for delivery. Retry the existing invitation after checking email configuration."
          : "An existing verified launch administrator already has access.") +
        " School opening still requires independent CAN approval.");
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to prepare church onboarding");
    } finally { setBusy(false); }
  }
  return <section className="mt-6 rounded-xl border bg-card p-5" aria-label="Church onboarding">
    <h2 className="font-serif text-2xl">Prepare a church for school launch</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      A verified CAN steward can create the church organization, its first Site and a
      pending site-scoped registrar invitation. This requires independent, current
      church-onboarding authority evidence recorded under the CAN organization:
      the verified document must have category <code>church_onboarding_authority</code>
      and metadata matching the church slug and authorized contact email.
      It does not authorize the church to open a school.
    </p>
    {error && <p role="alert" className="mt-3 rounded-lg border border-destructive p-3 text-sm">{error}</p>}
    {success && <p role="status" className="mt-3 rounded-lg border p-3 text-sm">{success}</p>}
    <form onSubmit={prepare} className="mt-4 grid gap-3 sm:grid-cols-2">
      {([
        ["churchName", "Church name"], ["churchSlug", "Church identifier"],
        ["siteName", "First school site name"], ["siteSlug", "Site identifier"],
        ["timezone", "School timezone"], ["contactEmail", "Authorized lead email"],
        ["firstName", "Lead first name"], ["lastName", "Lead last name"],
        ["authorityDocumentId", "Independently verified authority document ID"],
      ] as const).map(([key, label]) =>
        <label key={key} className="text-sm font-medium">{label}
          <input required type={key === "contactEmail" ? "email" : "text"}
            className={field} value={draft[key]}
            maxLength={key === "authorityDocumentId" ? 36 : 160}
            pattern={key === "churchSlug" || key === "siteSlug"
              ? "[a-z0-9]+(-[a-z0-9]+)*" : undefined}
            onChange={e => set(key, e.target.value)}/>
        </label>)}
      <button type="submit" disabled={busy}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50 sm:col-span-2">
        {busy ? "Preparing…" : "Prepare church and invite launch administrator"}
      </button>
    </form>
  </section>;
}

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import {
  addEnrichmentChild, getEnrichmentFamily, listEnrichmentCatalog, registerEnrichmentChild,
} from "@/modules/activities/enrichment-family.functions";

export const Route = createFileRoute("/guardian/enrichment")({
  loader: safeLoader(async () => {
    const [catalog, family] = await Promise.all([listEnrichmentCatalog(), getEnrichmentFamily()]);
    return { catalog, family };
  }, { authMessage: "Sign in as a guardian to register for summer and after-school programs." }),
  component: FamilyEnrichment,
});

const usd = (amount: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
}).format(amount / 100);

function FamilyEnrichment() {
  const result = Route.useLoaderData();
  if (!result.ok) return <LoaderFailure eyebrow="CAN OS · Family"
    title="Summer and enrichment programs" outcome={result} />;
  return <EnrichmentFamilyView data={result.data} />;
}

function EnrichmentFamilyView({ data }: {
  data: { catalog: Awaited<ReturnType<typeof listEnrichmentCatalog>>;
    family: Awaited<ReturnType<typeof getEnrichmentFamily>> };
}) {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState(data.family.households[0]?.id ?? "");
  const [studentSelections, setStudentSelections] = useState<Record<string,string>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [childFormOpen, setChildFormOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");

  async function addChild(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const created = await addEnrichmentChild({ data: {
        firstName, lastName, gradeLevel,
        ...(householdId ? { householdId } : {}),
      } });
      if (!householdId) setHouseholdId(created.householdId);
      setChildFormOpen(false); setFirstName(""); setLastName(""); setGradeLevel("");
      setNotice("Child added to your family. This does not enroll them in CAN Academy.");
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add child.");
    } finally { setBusy(false); }
  }

  async function register(seasonId: string, permissionVersion: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const studentProfileId = studentSelections[seasonId] ?? data.family.children[0]?.studentProfileId;
      if (!householdId || !studentProfileId)
        throw new Error("Choose a child and family household to register.");
      if (acknowledged[seasonId] !== true)
        throw new Error("Read and acknowledge the published permission statement.");
      const registered = await registerEnrichmentChild({ data: {
        seasonId, studentProfileId, householdId, permissionVersion, acknowledged: true,
      } });
      setNotice(registered.status === "waitlisted"
        ? "Your child is on the waitlist. No activity fee was charged."
        : "Registration submitted. Review the status and any fee due below.");
      setAcknowledged(prev => ({ ...prev, [seasonId]: false }));
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to register for this offering.");
    } finally { setBusy(false); }
  }

  return <WorkspaceShell eyebrow="CAN OS · Family"
    title="Summer and enrichment programs"
    subtitle="Explore available programs and register your children, whether or not they attend CAN Academy."
    actions={<Link to="/guardian" className="rounded-lg border px-3 py-2 text-sm">Family home</Link>}>
    {notice && <p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
    <section className="mt-6 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Your family</h2>
        <button type="button" onClick={() => setChildFormOpen(!childFormOpen)}
          className="rounded-lg border px-3 py-2 text-sm">
          {childFormOpen ? "Cancel" : "Add a child for enrichment"}
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Children listed here do not need an active CAN school enrollment. Select an existing child
        instead of adding the same child twice.
      </p>
      <p className="mt-2 text-sm">
        {data.family.children.length ? data.family.children.map(c =>
          [c.name, c.lastName].join(" ")).join(", ") : "No children connected yet."}
      </p>
      {data.family.households.length > 1 && <label className="mt-3 block text-sm">
        Household for registration
        <select value={householdId} onChange={e => setHouseholdId(e.target.value)}
          className="mt-1 w-full rounded-lg border bg-background p-2">
          {data.family.households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>}
      {childFormOpen && <form onSubmit={addChild} className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">First name
          <input required value={firstName} maxLength={80} onChange={e => setFirstName(e.target.value)}
            className="mt-1 w-full rounded-lg border bg-background p-2"/>
        </label>
        <label className="text-sm">Last name
          <input required value={lastName} maxLength={80} onChange={e => setLastName(e.target.value)}
            className="mt-1 w-full rounded-lg border bg-background p-2"/>
        </label>
        <label className="text-sm">Grade (optional)
          <input value={gradeLevel} maxLength={20} onChange={e => setGradeLevel(e.target.value)}
            className="mt-1 w-full rounded-lg border bg-background p-2"/>
        </label>
        <div className="sm:col-span-3">
          <button type="submit" disabled={busy} className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50">
            Add child
          </button>
        </div>
      </form>}
    </section>
    <section className="mt-8" aria-label="Your enrichment registrations">
      <h2 className="text-xl font-semibold">Your registrations</h2>
      {data.family.registrations.length === 0
        ? <p className="mt-2 text-sm text-muted-foreground">No summer or enrichment registrations recorded yet.</p>
        : <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.family.registrations.map(registration => {
            const child = data.family.children.find(c => c.studentProfileId === registration.studentProfileId);
            return <li key={registration.id} className="rounded-xl border bg-card p-4">
              <p className="font-semibold">{registration.offeringName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {child?.name} {child?.lastName} · {registration.seasonName}
              </p>
              <p className="mt-1 text-xs">
                {registration.startsOn} to {registration.endsOn} ·
                {" "}{registration.status.replaceAll("_", " ")}
              </p>
              {registration.amountCents != null && <p className="mt-2 text-sm">
                {usd(registration.amountCents)} · {registration.paymentStatus ?? "payment pending"}
              </p>}
            </li>;
          })}
        </ul>}
    </section>
    <section className="mt-8 space-y-4" aria-label="Available enrichment programs">
      <h2 className="text-xl font-semibold">Open registration</h2>
      {data.catalog.length === 0 && <p className="rounded-lg border p-5 text-sm text-muted-foreground">
        No programs are currently published for registration. Check back as sites release their summer and after-school schedules.
      </p>}
      {data.catalog.map(offer => {
        const selected = studentSelections[offer.seasonId] ?? data.family.children[0]?.studentProfileId ?? "";
        const prior = data.family.registrations.find(r =>
          r.seasonId === offer.seasonId && r.studentProfileId === selected);
        return <article key={offer.seasonId} className="rounded-xl border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{offer.siteName} · {offer.programName}</p>
          <h3 className="mt-1 text-xl font-semibold">{offer.name}</h3>
          <p className="mt-1 text-sm">{offer.seasonName} · {offer.startsOn} to {offer.endsOn}</p>
          {offer.firstMeeting && offer.meetingTimezone && <p className="mt-1 text-sm text-muted-foreground">
            First session: {new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",
              timeZone:offer.meetingTimezone}).format(new Date(offer.firstMeeting))}
          </p>}
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span>{usd(offer.feeAmountCents)}</span>
            <span>{offer.seatsRemaining === 0 ? "Waitlist available" :
              offer.seatsRemaining === null ? "Capacity not specified" :
              `${offer.seatsRemaining} seats remaining`}</span>
          </div>
          <label className="mt-4 block text-sm">Register child
            <select value={selected}
              onChange={e => setStudentSelections(prev => ({
                ...prev, [offer.seasonId]: e.target.value,
              }))} className="mt-1 w-full rounded-lg border bg-background p-2">
              {data.family.children.length === 0 && <option value="">Add a child above first</option>}
              {data.family.children.map(c => <option key={c.studentProfileId}
                value={c.studentProfileId}>{c.name} {c.lastName}</option>)}
            </select>
          </label>
          {prior ? <p className="mt-3 text-sm font-semibold">
            Existing registration: {prior.status.replaceAll("_", " ")}
          </p> : <>
            <div className="mt-4 rounded-lg border p-3 text-sm">
              <p className="mb-2 font-semibold">Participation consent · version {offer.permissionVersion}</p>
              <p className="whitespace-pre-wrap">{offer.permissionText}</p>
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={acknowledged[offer.seasonId] ?? false}
                onChange={e => setAcknowledged(prev => ({
                  ...prev, [offer.seasonId]: e.target.checked,
                }))}/>
              I have read and agree to this participation permission for the selected child.
            </label>
            <button type="button" onClick={() => register(offer.seasonId, offer.permissionVersion)}
              disabled={busy || !selected || !householdId || !offer.registrationOpen ||
                !acknowledged[offer.seasonId]}
              className="mt-4 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50">
              {offer.registrationOpen ? "Submit registration" : "Registration window is closed"}
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              Submitting a registration is not a payment or a final eligibility decision.
              Any applicable activity fee is recorded as a household obligation.
            </p>
          </>}
        </article>;
      })}
    </section>
  </WorkspaceShell>;
}

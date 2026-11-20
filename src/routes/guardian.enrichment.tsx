import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { enrichmentConsentContext } from "@/domain/enrichment-consent";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import {
  addEnrichmentChild, getEnrichmentFamily, listEnrichmentCatalog, registerEnrichmentChild,
} from "@/modules/activities/enrichment-family.functions";

export const Route = createFileRoute("/guardian/enrichment")({
  validateSearch: search => z.object({ seasonId: z.string().uuid().optional() }).parse(search),
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
  const { seasonId } = Route.useSearch();
  if (!result.ok) return <LoaderFailure eyebrow="Family"
    title="Summer and enrichment programs" outcome={result} />;
  return <EnrichmentFamilyView data={result.data} seasonId={seasonId} />;
}

function EnrichmentFamilyView({ data, seasonId }: {
  seasonId?: string;
  data: { catalog: Awaited<ReturnType<typeof listEnrichmentCatalog>>;
    family: Awaited<ReturnType<typeof getEnrichmentFamily>> };
}) {
  const router = useRouter();
  const offerings = seasonId ? data.catalog.filter(offer => offer.seasonId === seasonId) : data.catalog;
  const [householdId, setHouseholdId] = useState(data.family.households[0]?.id ?? "");
  const [studentSelections, setStudentSelections] = useState<Record<string,string>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, string>>({});
  const [packageSelections, setPackageSelections] = useState<Record<string,string[]>>({});
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const [error, setError] = useState("");
  const [childFormOpen, setChildFormOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [childAttempted,setChildAttempted]=useState(false);

  async function addChild(event: FormEvent) {
    event.preventDefault(); setError("");setChildAttempted(true);
    if(!firstName.trim()||!lastName.trim())return;
    await mutation.run(async () => {
      const created = await addEnrichmentChild({ data: {
        firstName, lastName, gradeLevel,
        ...(householdId ? { householdId } : {}),
      } });
      if (!householdId) setHouseholdId(created.householdId);
      setChildFormOpen(false); setFirstName(""); setLastName(""); setGradeLevel("");setChildAttempted(false);
    }, { successMessage: "Child added to your family. This does not enroll them in CAN Academy.",
      commandErrorMessage: "Could not add child." });
  }

  async function register(seasonId: string, permissionVersion: string) {
    setError("");
      const studentProfileId = studentSelections[seasonId] ?? data.family.children[0]?.studentProfileId;
      if (!householdId || !studentProfileId)
        return setError("Choose a child and family household to register.");
      const offer = data.catalog.find(item => item.seasonId === seasonId);
      if (!offer) return setError("Offering no longer available");
      if (permissionVersion !== offer.permissionVersion ||
          acknowledged[seasonId] !== enrichmentConsentContext(studentProfileId, householdId, offer.permissionVersion))
        return setError("Read and acknowledge the published permission statement for this child and household.");
      const selectedPackageIds = packageSelections[seasonId] ?? [];
      if (offer.packages.some(item => selectedPackageIds.includes(item.id) && !item.available))
        return setError("A selected package has canceled or unavailable sessions");
      if (offer.packages.length && !selectedPackageIds.length)
        return setError("Select at least one camp package or weekly option");
      const selectedPackages = offer.packages.filter(item => selectedPackageIds.includes(item.id));
      const count = selectedPackages.flatMap(item => item.sessionIds);
      if (new Set(count).size !== count.length)
        return setError("Selected package options contain overlapping days");
    await mutation.run(async () => {
      const registered = await registerEnrichmentChild({ data: {
        seasonId, studentProfileId, householdId, permissionVersion, acknowledged: true,
        ...(offer.packages.length ? { selectedPackageIds } : {}),
      } });
      setAcknowledged(prev => ({ ...prev, [seasonId]: "" }));
      return registered;
    }, { successMessage: registered => registered.status === "waitlisted"
        ? "Your child is on the waitlist. No activity fee was charged."
        : "Registration submitted. Review the status and any fee due below.",
      commandErrorMessage: "Unable to register for this offering." });
  }

  return <WorkspaceShell eyebrow="Family"
    title="Summer and enrichment programs"
    subtitle="Explore available programs and register your children, whether or not they attend CAN Academy."
    actions={<Link to="/home" >Family home</Link>}>
    <MutationFeedback state={mutation} className="mt-5" pendingMessage="Saving family registration..."/>
    {error && <p role="alert" className="mt-5  border border-danger/40 p-3 text-sm">{error}</p>}
    <section className="mt-6  border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Your family</h2>
        <Button variant="outline" type="button" onClick={() => setChildFormOpen(!childFormOpen)}
          >
          {childFormOpen ? "Cancel" : "Add a child for enrichment"}
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Children listed here do not need an active CAN school enrollment. Select an existing child
        instead of adding the same child twice.
      </p>
      <p className="mt-2 text-sm">
        {data.family.children.length ? data.family.children.map(c =>
          [c.name, c.lastName].join(" ")).join(", ") : "No children connected yet."}
      </p>
      {data.family.households.length > 1 && <Label className="mt-3 block text-sm">
        Household for registration
        <Select value={householdId} onChange={e => setHouseholdId(e.target.value)}
          className="mt-1 min-h-11">
          {data.family.households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </Select>
      </Label>}
      {childFormOpen && <form noValidate onSubmit={addChild} className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="First name" className="text-sm" required error={childAttempted&&!firstName.trim()?"Enter the child's first name.":undefined}>
          <Input value={firstName} maxLength={80} onChange={e => setFirstName(e.target.value)}/>
        </Field>
        <Field label="Last name" className="text-sm" required error={childAttempted&&!lastName.trim()?"Enter the child's last name.":undefined}>
          <Input value={lastName} maxLength={80} onChange={e => setLastName(e.target.value)}/>
        </Field>
        <Field label="Grade (optional)" className="text-sm"><Input value={gradeLevel} maxLength={20} onChange={e => setGradeLevel(e.target.value)}/></Field>
        <div className="sm:col-span-3">
          <Button type="submit" variant="outline" disabled={busy}>
            Add child
          </Button>
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
            return <li key={registration.id} className=" border bg-card p-4">
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
      {seasonId && <Link to="/guardian/enrichment" className="text-sm font-semibold underline">Browse all enrichment programs</Link>}
      {offerings.length === 0 && <p className=" border p-5 text-sm text-muted-foreground">
        {seasonId ? "This season is no longer available for registration." : "No programs are currently published for registration. Check back as sites release their summer and after-school schedules."}
      </p>}
      {offerings.map(offer => {
        const selected = studentSelections[offer.seasonId] ?? data.family.children[0]?.studentProfileId ?? "";
        const prior = data.family.registrations.find(r =>
          r.seasonId === offer.seasonId && r.studentProfileId === selected);
        const chosenIds = packageSelections[offer.seasonId] ?? [];
        const selectedPackages = offer.packages.filter(option=>chosenIds.includes(option.id));
        const packageSessions = selectedPackages.flatMap(option=>option.sessionIds);
        const packageConflict = new Set(packageSessions).size !== packageSessions.length;
        const quotedPrice = selectedPackages.reduce((sum,item)=>sum+item.priceCents,0);
        const requestedWaitlist = selectedPackages.some(option=>option.seatsRemaining === 0);
        const unavailableSelection = selectedPackages.some(option=>!option.available);
        return <article key={offer.seasonId} className=" border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{offer.siteName} · {offer.programName}</p>
          <h3 className="mt-1 text-xl font-semibold">{offer.name}</h3>
          <p className="mt-1 text-sm">{offer.seasonName} · {offer.startsOn} to {offer.endsOn}</p>
          {offer.firstMeeting && offer.meetingTimezone && <p className="mt-1 text-sm text-muted-foreground">
            First session: {new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",
              timeZone:offer.meetingTimezone}).format(new Date(offer.firstMeeting))}
          </p>}
          {offer.packages.length === 0 && <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span>Full season: {usd(offer.feeAmountCents)}</span>
            <span>{offer.seatsRemaining === 0 ? "Waitlist available" :
              offer.seatsRemaining === null ? "Capacity not specified" :
              `${offer.seatsRemaining} seats remaining`}</span>
          </div>}
          <Label className="mt-4 block text-sm">Register child
            <Select value={selected}
              onChange={e => setStudentSelections(prev => ({
                ...prev, [offer.seasonId]: e.target.value,
              }))} className="mt-1 min-h-11">
              {data.family.children.length === 0 && <option value="">Add a child above first</option>}
              {data.family.children.map(c => <option key={c.studentProfileId}
                value={c.studentProfileId}>{c.name} {c.lastName}</option>)}
            </Select>
          </Label>
          {prior ? <p className="mt-3 text-sm font-semibold">
            Existing registration: {prior.status.replaceAll("_", " ")}
          </p> : <>
            {!!offer.packages.length && <fieldset className="mt-4  border p-3">
              <legend className="px-2 text-sm font-semibold">Choose enrollment weeks or days</legend>
              <div className="grid gap-2">
                {offer.packages.map(option=><Label key={option.id}
                  className="flex flex-wrap items-center justify-between gap-3  border p-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Checkbox checked={chosenIds.includes(option.id)}
                      disabled={!option.available}
                      onChange={event=>setPackageSelections(current=>{
                        const ids=current[offer.seasonId] ?? [];
                        return {...current, [offer.seasonId]: event.target.checked
                          ? [...ids,option.id] : ids.filter(id=>id!==option.id)};
                      })}/>
                    {option.title} <span className="text-xs text-muted-foreground">
                      ({option.sessionIds.length} sessions)
                    </span>
                  </span>
                  <span>{usd(option.priceCents)}
                    {" · "}{!option.available ? "Unavailable" :
                      option.seatsRemaining === 0 ? "Waitlist" :
                      option.seatsRemaining === null ? "Capacity not specified" :
                      `${option.seatsRemaining} seats`}
                  </span>
                </Label>)}
              </div>
              <p className="mt-2 text-sm font-semibold">
                Selected total: {usd(quotedPrice)}
                {requestedWaitlist && " · At least one selection is waitlisted"}
              </p>
              {packageConflict && <p role="alert" className="mt-2 text-xs text-danger">
                These packages have overlapping days. Choose non-overlapping options.
              </p>}
            </fieldset>}
            <div className="mt-4  border p-3 text-sm">
              <p className="mb-2 font-semibold">Participation consent · version {offer.permissionVersion}</p>
              <p className="whitespace-pre-wrap">{offer.permissionText}</p>
            </div>
            <Label className="mt-3 flex items-start gap-2 text-sm">
              <Checkbox className="mt-1"
                checked={acknowledged[offer.seasonId] === enrichmentConsentContext(selected, householdId, offer.permissionVersion)}
                onChange={e => setAcknowledged(prev => ({
                  ...prev, [offer.seasonId]: e.target.checked
                    ? enrichmentConsentContext(selected, householdId, offer.permissionVersion) : "",
                }))}/>
              I have read and agree to this participation permission for the selected child.
            </Label>
            <Button variant="outline" type="button" onClick={() => register(offer.seasonId, offer.permissionVersion)}
              disabled={busy || !selected || !householdId || !offer.registrationOpen ||
                acknowledged[offer.seasonId] !== enrichmentConsentContext(selected, householdId, offer.permissionVersion) || packageConflict || unavailableSelection ||
                (offer.packages.length > 0 && !chosenIds.length)}
              className="mt-4">
              {!offer.registrationOpen ? "Registration unavailable" :
                (offer.packages.length === 0 ? offer.seatsRemaining === 0 : requestedWaitlist)
                  ? "Join waitlist" : "Submit registration"}
            </Button>
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

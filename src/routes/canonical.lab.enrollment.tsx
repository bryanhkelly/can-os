import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import { getCanonicalCapabilityLab } from "@/modules/operations/canonical-capability-lab.functions";

export const Route = createFileRoute("/canonical/lab/enrollment")({
  loader: () => safeLoader(() => getCanonicalCapabilityLab())(),
  component: EnrollmentLabPage,
});

type Audience = "adult" | "guardian" | "group";
const audienceOptions: { id: Audience; title: string; description: string }[] = [
  { id: "adult", title: "Enroll myself", description: "Adult training, digital skills, workforce, certifications and other independent learning." },
  { id: "group", title: "Register a group", description: "Facilitated classes at a church, community center, employer or partner location." },
  { id: "guardian", title: "Enroll a child", description: "School, youth enrichment, after-school and summer experiences with verified guardian authority." },
];

function EnrollmentLabPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError title="Enrollment" message={result.message}/>;
  return <EnrollmentLabContent trainings={result.data.trainings}/>;
}

function EnrollmentLabContent({ trainings }: {
  trainings: Awaited<ReturnType<typeof getCanonicalCapabilityLab>>["trainings"];
}) {
  const [audience, setAudience] = useState<Audience>("adult");
  const [selected, setSelected] = useState("");
  const [delivery, setDelivery] = useState<"individual" | "facilitated">("individual");
  const current = trainings.find(item => item.id === selected);
  const published = trainings.filter(item => item.state === "published");

  return <WorkspaceShell width="wide" eyebrow="Internal · Enrollment experience"
    title="Enrollment" subtitle="One registration experience for noncredit training, adult education, community programs and youth learning. School admission remains a separate verified family journey.">
    <CapabilityLabNav current="noncredit"/>
    <section className="mt-6 border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Experience design · Not live registration</p>
      <h2 className="mt-2 font-serif text-2xl">Who is learning?</h2>
      <p className="mt-2 text-sm text-muted-foreground">A single entry point adapts the questions and authorization to the person enrolling. Enrollment is not submitted from this internal preview.</p>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {audienceOptions.map(option => <button type="button" key={option.id}
          aria-pressed={audience === option.id} onClick={() => setAudience(option.id)}
          className={"border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary " +
            (audience === option.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
          <span className="block text-base font-semibold">{option.title}</span>
          <span className="mt-2 block text-sm leading-6 text-muted-foreground">{option.description}</span>
        </button>)}
      </div>
    </section>
    {audience === "guardian" ? <section className="mt-5 border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">Family and youth enrollment</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Minor enrollment requires a verified guardian relationship and the applicable permissions. It must not inherit adult self-registration or expose student records.</p>
      <Link to="/guardian/students" className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">Open the existing family experience</Link>
    </section> : <>
      <section className="mt-5 border border-border bg-card p-5">
        <h2 className="font-serif text-2xl">Select an offering</h2>
        <p className="mt-2 text-sm text-muted-foreground">Only published training versions can be presented as candidates. A public registration launch also requires an approved deployment, capacity policy and registration command.</p>
        <label htmlFor="training" className="mt-5 block text-sm font-semibold">Published training</label>
        <select id="training" value={selected} onChange={event => setSelected(event.target.value)}
          className="mt-2 min-h-11 w-full max-w-xl border border-border bg-background px-3 text-sm">
          <option value="">Choose a published training</option>
          {published.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        {current && <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="border border-border p-3"><span className="block text-muted-foreground">Training</span><strong>{current.title}</strong></div>
          <div className="border border-border p-3"><span className="block text-muted-foreground">Instruction</span><strong>{current.requiredMinutes} minutes</strong></div>
          <div className="border border-border p-3"><span className="block text-muted-foreground">Knowledge check</span><strong>{current.assessmentVersionId ? "Configured" : "Not attached"}</strong></div>
        </div>}
        {published.length === 0 && <p role="status" className="mt-4 text-sm text-muted-foreground">No published training is available in the current provider scope.</p>}
      </section>
      <section className="mt-5 border border-border bg-card p-5">
        <h2 className="font-serif text-2xl">{audience === "group" ? "Group delivery" : "Participation preference"}</h2>
        <div className="mt-4 flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="delivery" checked={delivery === "individual"} onChange={() => setDelivery("individual")}/>Learn on my own device</label>
          <label className="flex items-center gap-2"><input type="radio" name="delivery" checked={delivery === "facilitated"} onChange={() => setDelivery("facilitated")}/>Join a facilitated group</label>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{delivery === "facilitated"
          ? "A facilitator can host a shared-screen session, but each participant must have their own identity and participation record. Group creation does not impersonate learners."
          : "An adult uses their own verified identity, registrations, activity history, assessment and completion record."}</p>
      </section>
    </>}
    <section className="mt-5 border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">Registration launch checks</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
        <li>Use one configurable experience, with separate offerings for the one-hour and four-week pilots.</li>
        <li>Authenticate or verify the participant before creating an enrollment. Never accept a client-supplied person ID as authority.</li>
        <li>Resolve a published offering to an authorized deployment, adoption, training version and available cohort before creating a noncredit registration and course attempt.</li>
        <li>Enforce duplicate enrollment, capacity, age/guardian, consent, privacy and idempotency rules on the server.</li>
        <li>Capture referral network, organization, site, invitation and campaign attribution without granting implicit organizational access.</li>
        <li>Track invitation, started, submitted, accepted, active, attended, assessed and completed events for pilot reporting.</li>
      </ul>
      <p className="mt-4 text-sm font-medium">This preview does not collect personal information or write enrollment records.</p>
      <Link to="/canonical/lab/noncredit" className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">Inspect existing noncredit registrations and attempts</Link>
    </section>
  </WorkspaceShell>;
}

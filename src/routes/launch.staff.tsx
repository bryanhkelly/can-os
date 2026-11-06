import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { staffLaunchSearch } from "@/domain/launch-studio";
import { LaunchStudioShell, JourneyWelcome, LaunchStudioStepContent } from "@/components/launch-studio/LaunchStudioShell";
import { LaunchDraftButton } from "@/components/launch-studio/LaunchDraftButton";
import { Qualifications } from "@/components/profiles/Qualifications";
import { getLaunchStudioDraft, getStaffLaunchWorkspace } from "@/modules/programs/launch-drafts.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { LaunchFieldHelp } from "@/components/launch-studio/LaunchFieldHelp";
import { useLaunchDraftChanges, useLaunchUnsavedChanges } from "@/components/launch-studio/useLaunchUnsavedChanges";

const steps = [
  { id: "welcome", title: "Welcome" }, { id: "details", title: "Your details" },
  { id: "qualifications", title: "Qualifications" }, { id: "next", title: "What's next" },
] as const;
async function loadStaffLaunch() {
  const workspace = await getStaffLaunchWorkspace();
  const draft = await getLaunchStudioDraft({ data: { audience: "staff", context: "" } });
  return { workspace, draft };
}
export const Route = createFileRoute("/launch/staff")({
  staleTime: Infinity,
  validateSearch: (search: Record<string, unknown>) => staffLaunchSearch.parse(search),
  loader: safeLoader(loadStaffLaunch),
  component: StaffLaunch,
});
function StaffLaunch() {
  const result = Route.useLoaderData();
  return result.ok ? <StaffJourney data={result.data} /> : <LoaderFailure title="Staff launch" outcome={result} />;
}
function StaffJourney({ data }: { data: Awaited<ReturnType<typeof loadStaffLaunch>> }) {
  const router = useRouter();
  const search = Route.useSearch();
  const step = search.step ?? "welcome";
  const [notes, setNotes] = useState(data.draft?.value.audience === "staff" ? data.draft.value.fields.notes : "");
  const [qualificationDirty, setQualificationDirty] = useState(false);
  const changes = useLaunchDraftChanges(notes);
  useLaunchUnsavedChanges(changes.dirty || qualificationDirty);
  function changeStep(id: string) {
    const next = steps.find(item => item.id === id);
    if (next) void router.navigate({ to: "/launch/staff", search: { step: next.id } });
  }
  return <LaunchStudioShell role="Staff setup" subject={data.workspace.name}
    title={{ welcome: "Begin with confidence.", details: "Your school identity.",
      qualifications: "Prepare your qualifications.", next: "Your next step with your school." }[step]}
    steps={steps} currentId={step} onStepChange={changeStep}
    exit={<Link to="/home" className="underline">Skip to dashboard</Link>}
    status={<p>Save draft saves preparation notes only. Qualification fields and selected files stay on this page when you change steps, but aren't saved in the notes draft. Submit them for review before leaving.</p>}
    saveAction={
      <LaunchDraftButton selection={{ audience: "staff", context: "" }} initial={data.draft}
        successMessage="Preparation notes saved. Qualification entries and files are not included."
        onSaved={value => { if (value.audience === "staff") changes.markSaved(value.fields.notes); }}
        value={() => ({ audience: "staff", fields: { notes } })} />}
    actions={<>
      <Button variant="outline" disabled={step === "welcome"}
        onClick={() => changeStep(steps[steps.findIndex(item => item.id === step) - 1]!.id)}>Back</Button>
      {step !== "next" && <Button onClick={() => changeStep(steps[steps.findIndex(item => item.id === step) + 1]!.id)}>Continue</Button>}
    </>}>
    {step === "welcome" && <JourneyWelcome summary="Check your school details and prepare the qualifications requested for your role."
      requirements={["Check the school role assigned to your account", "Prepare only the qualification evidence requested for your role", "Ask your school about its policies and orientation"]}
      outcome="Invitation acceptance does not verify qualifications, approve supervision or assign classes." />}
    {step === "details" && <>
      <section className="border bg-card p-6">
        <h2 className="font-serif text-2xl">{data.workspace.name}</h2>
        <p className="mt-3 text-sm text-muted-foreground">Your school role</p>
        <p className="mt-1 text-base font-semibold">{data.workspace.role.replaceAll("_", " ")}</p>
        <p className="mt-3 text-sm">Ask your administrator if your name or role needs correcting.</p>
      </section>
      <section className="border bg-card p-5">
        <Field label="Private preparation notes" description="Save draft keeps these notes for later.">
          <Textarea id="staff-launch-notes" value={notes} maxLength={4000}
            onChange={event => setNotes(event.target.value)} rows={5} />
        </Field>
        <LaunchFieldHelp label="What belongs in preparation notes?">Keep questions and reminders here, not student records, medical information or credential documents. Submit qualification evidence in Qualifications.</LaunchFieldHelp>
      </section>
    </>}
    <LaunchStudioStepContent active={step === "qualifications"}>{data.workspace.canSubmitQualifications ?
      <Qualifications embedded onDirtyChange={setQualificationDirty} /> :
      <p role="status" className="border bg-card p-5 text-sm">This role does not use the staff qualification submission workspace. Ask your administrator what to prepare.</p>}</LaunchStudioStepContent>
    {step === "next" && <><JourneyWelcome summary="Your school confirms required policies, orientation and role-specific readiness."
      requirements={["Follow up on independently reviewed evidence", "Confirm the school's orientation and required policy process"]}
      outcome="No policy acknowledgment or compliance approval is recorded by visiting these pages. Work assignments and onsite authority remain separately verified." />
      <div className="border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">For general teaching opportunity questions, separate from verified qualifications and assignments:</p>
        <Link to="/next/$journeyId" params={{journeyId:"teach-with-can"}} className="mt-3 inline-block min-h-11 text-sm font-semibold text-primary underline">Explore teaching next steps</Link>
      </div></>}
  </LaunchStudioShell>;
}

import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { staffLaunchSearch } from "@/domain/launch-studio";
import { LaunchStudioShell, JourneyWelcome } from "@/components/launch-studio/LaunchStudioShell";
import { LaunchDraftButton } from "@/components/launch-studio/LaunchDraftButton";
import { Qualifications } from "@/components/profiles/Qualifications";
import { getLaunchStudioDraft, getStaffLaunchWorkspace } from "@/modules/programs/launch-drafts.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { Button } from "@/components/ui/button";

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
  function changeStep(id: string) {
    const next = steps.find(item => item.id === id);
    if (next) void router.navigate({ to: "/launch/staff", search: { step: next.id } });
  }
  return <LaunchStudioShell role="Staff setup" subject={data.workspace.name}
    title={{ welcome: "Begin with confidence.", details: "Your school identity.",
      qualifications: "Prepare your qualifications.", next: "Your next step with your school." }[step]}
    steps={steps} currentId={step} onStepChange={changeStep}
    exit={<Link to="/home" className="underline">Skip to dashboard</Link>}
    actions={<>
      <LaunchDraftButton selection={{ audience: "staff", context: "" }} initial={data.draft}
        value={() => ({ audience: "staff", fields: { notes } })} />
      {step !== "next" && <Button onClick={() => changeStep(steps[steps.findIndex(item => item.id === step) + 1]!.id)}>Continue</Button>}
    </>}>
    {step === "welcome" && <JourneyWelcome summary="Prepare for your role using your verified school identity and the ordinary staff evidence workflow."
      requirements={["Check the school role assigned to your account", "Prepare only the qualification evidence requested for your role", "Ask your school about its policies and orientation"]}
      outcome="Invitation acceptance does not verify qualifications, approve supervision or assign classes." />}
    {step === "details" && <section className="border bg-card p-6">
      <h2 className="font-serif text-2xl">{data.workspace.name}</h2>
      <p className="mt-3 text-sm">Verified account role: {data.workspace.role.replaceAll("_", " ")}. Contact your administrator for corrections; this page cannot change your legal identity or grants.</p>
    </section>}
    {step === "qualifications" && (data.workspace.canSubmitQualifications ? <Qualifications /> :
      <p role="status" className="border bg-card p-5 text-sm">This role does not use the staff qualification submission workspace. Your administrator can explain its required preparation.</p>)}
    {step === "next" && <><JourneyWelcome summary="Your school confirms required policies, orientation and role-specific readiness."
      requirements={["Follow up on independently reviewed evidence", "Confirm the school's orientation and required policy process"]}
      outcome="No policy acknowledgment or compliance approval is recorded by visiting these pages. Work assignments and onsite authority remain separately verified." />
      <div className="border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">For general teaching opportunity questions, separate from verified qualifications and assignments:</p>
        <Link to="/next/$journeyId" params={{journeyId:"teach-with-can"}} className="mt-3 inline-block min-h-11 text-sm font-semibold text-primary underline">Explore teaching next steps</Link>
      </div></>}
    <section className="border bg-card p-5">
      <label htmlFor="staff-launch-notes" className="text-sm font-semibold">Private preparation notes</label>
      <p id="staff-notes-help" className="mt-2 text-xs text-muted-foreground">Save draft preserves these notes only. Do not include student records, medical information or credential documents. Submit evidence through Qualifications.</p>
      <textarea id="staff-launch-notes" aria-describedby="staff-notes-help" value={notes} maxLength={4000}
        onChange={event => setNotes(event.target.value)} rows={5} className="mt-3 w-full border bg-background p-3 text-sm" />
    </section>
  </LaunchStudioShell>;
}

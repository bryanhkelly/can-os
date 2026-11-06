import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { familyLaunchSearch } from "@/domain/launch-studio";
import { LaunchStudioShell, JourneyWelcome, LaunchStudioStepContent } from "@/components/launch-studio/LaunchStudioShell";
import { GuardianApplicationForm } from "@/components/enrollment/GuardianApplicationForm";
import { GuardianEnrollmentChecklist } from "@/components/enrollment/GuardianEnrollmentChecklist";
import { getGuardianFamilyApplicationWorkspace, startGuardianFamilyApplication } from "@/modules/enrollment/guardian-family-applications.functions";
import { getLaunchStudioDraft } from "@/modules/programs/launch-drafts.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { Button } from "@/components/ui/button";

const steps = [
  { id: "welcome", title: "Welcome" }, { id: "application", title: "Student application" },
  { id: "documents", title: "Forms & documents" }, { id: "next", title: "What's next" },
] as const;
export const Route = createFileRoute("/launch/family")({
  staleTime: Infinity,
  validateSearch: (search: Record<string, unknown>) => familyLaunchSearch.parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId, familyStart: search.familyStart }),
  loader: ({ deps }) => safeLoader(async () => {
    const workspace = await getGuardianFamilyApplicationWorkspace();
    const draftContext = `${deps.programId ?? ""}:${deps.familyStart ?? ""}`;
    const draft = await getLaunchStudioDraft({ data: { audience: "family", context: draftContext } });
    return { workspace, draft, draftContext };
  })(),
  component: FamilyLaunch,
});

function FamilyLaunch() {
  const result = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  if (!result.ok) return <LoaderFailure title="Family launch" outcome={result} />;
  const { workspace, draft, draftContext } = result.data;
  const draftRequestId = draft?.value.audience === "family" ? draft.value.fields.requestId : undefined;
  const submittedDraft = Boolean(draftRequestId && workspace.applications.some(item =>
    item.submissionRequestId === draftRequestId));
  const application = workspace.applications.find(item => item.applicationId === search.application);
  const mismatch = Boolean(search.application && (!application ||
    search.programId && application.programId !== search.programId));
  const step = search.step ?? (search.application ? "documents" : "welcome");
  function changeStep(id: string) {
    const next = steps.find(item => item.id === id);
    if (next) void router.navigate({ to: "/launch/family", search: { ...search, step: next.id } });
  }
  return <LaunchStudioShell role="Family setup" subject={application?.programName ?? "Your family"}
    title={{ welcome: "A new chapter begins.", application: "Tell us about your student.",
      documents: "Your school's requested documents.", next: "What happens next." }[step]}
    description="Prepare your application, then let your school guide the next steps."
    steps={steps} currentId={step} onStepChange={changeStep}
    status={<p>{application ? "Your application is saved. Your school reviews your relationship, documents and admission separately." :
      "Save draft on Student application to keep your entries. Continue does not submit an application."}</p>}
    exit={<Link to="/home" className="underline">Skip to dashboard</Link>}
    actions={<><Button variant="outline" disabled={step === "welcome"} onClick={() => changeStep(steps[steps.findIndex(item => item.id === step) - 1]!.id)}>Back</Button>
      {step !== "next" && <Button onClick={() => changeStep(steps[steps.findIndex(item => item.id === step) + 1]!.id)}>Continue</Button>}</>}>
    {mismatch ? <p role="alert" className="border border-destructive p-5">This application is unavailable in the requested school context. No other child's application was selected.</p> : <>
      {step === "welcome" && <JourneyWelcome summary="Start or resume your family's real school application."
        requirements={["Your student's legal name and entering grade", "Your household and the school you are applying to", "Only the forms and documents your school requests"]}
        outcome="Admissions verifies your relationship independently. Receiving documents is not the same as approving them." />}
      {(step === "welcome" || step === "documents") && <section className="space-y-3">
        <h2 className="font-serif text-2xl">Your saved applications</h2>
        {!workspace.applications.length && <p className="text-sm">No submitted applications yet. Start in Student application.</p>}
        {workspace.applications.filter(item => !search.programId || item.programId === search.programId).map(item =>
          <article key={item.applicationId} className="border bg-card p-4 text-sm">
            <Link to="/launch/family" search={{ ...search, programId: item.programId, application: item.applicationId, step: "documents" }}
              className="underline">{item.studentFirstName} {item.studentLastName} · {item.programName} · {item.stage.replaceAll("_", " ")}</Link>
            <p className="mt-2">{item.guardianVerified ? "Guardian verified" : "Guardian verification pending"}</p>
            <p className="mt-2 text-xs text-muted-foreground">{item.schoolYearName} · {item.source === "published_site" ? "Published school website" : "Family account"} · Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
            {item.originTransferActionId && <p className="mt-2">Linked to your verified prior-school transfer request.</p>}
          </article>)}
      </section>}
      <div hidden={step !== "application"}>{application ? <p className="border bg-card p-5 text-sm">This student's application is already saved. Continue to Forms &amp; documents rather than submitting it again.</p> :
        <GuardianApplicationForm key={draftContext} embedded draft={draft} draftContext={draftContext} restoreDraft={!submittedDraft}
          programs={workspace.programs} households={workspace.households} students={workspace.students}
          transferRequests={workspace.transferRequests} requestedProgramId={search.programId} familyStartRequestId={search.familyStart}
          onSubmit={input => startGuardianFamilyApplication({ data: input })}
          onSubmitted={async applicationId => {
            await router.navigate({ to: "/launch/family", search: { ...search, application: applicationId, step: "documents" } });
            await router.invalidate();
          }} />}
        {workspace.applications.some(item => item.programId === search.programId) &&
          <p role="status" className="mt-3 border p-4 text-sm">You already have an application for this school. Resume it in Forms &amp; documents. Use a new application only for a different child.</p>}
      </div>
      <LaunchStudioStepContent key={application?.applicationId ?? "none"} active={step === "documents"}>{application ? application.guardianVerified
        ? <GuardianEnrollmentChecklist protectUnsaved key={application.applicationId} applicationId={application.applicationId} />
        : <p role="status" className="border bg-card p-5 text-sm">Guardian verification is pending. Admissions must verify your relationship before private forms and documents become available.</p>
        : <p role="status" className="border bg-card p-5 text-sm">Choose a saved application above. Required documents come from that school's checklist, not a generic list.</p>}</LaunchStudioStepContent>
      {step === "next" && <section className="border bg-card p-6 text-sm leading-7">
        <h2 className="font-serif text-2xl">Your school will guide the next step</h2>
        <p className="mt-3">Application submission, guardian verification, document review, an admission offer, enrollment activation and class placement are separate decisions.</p>
        <Link to="/guardian/admission-offers" search={{ application: application?.applicationId }} className="mt-4 inline-block underline">Review your verified offers and enrollment status</Link>
        <p className="mt-4 text-xs text-muted-foreground">For general CAN questions, separate from your application status:</p>
        <Link to="/next/$journeyId" params={{journeyId:"family-admissions"}} className="mt-2 inline-block text-primary underline">Explore family information and conversation options</Link>
      </section>}
    </>}
  </LaunchStudioShell>;
}

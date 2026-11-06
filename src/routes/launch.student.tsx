import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { studentLaunchSearch } from "@/domain/launch-studio";
import { LaunchStudioShell, JourneyWelcome, LaunchStudioStepContent } from "@/components/launch-studio/LaunchStudioShell";
import { LaunchDraftButton } from "@/components/launch-studio/LaunchDraftButton";
import { StudentProfileEditor } from "@/components/profiles/StudentProfileSetup";
import { getStudentSelfProfile } from "@/modules/profiles/student-self-profile.functions";
import { getCourseRegistration, requestCourseChange } from "@/modules/learning/course-registration.functions";
import { getLaunchStudioDraft } from "@/modules/programs/launch-drafts.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { Button } from "@/components/ui/button";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { studentDraftMatchesProfile } from "@/domain/launch-draft";
import { useLaunchDraftChanges, useLaunchUnsavedChanges } from "@/components/launch-studio/useLaunchUnsavedChanges";
import { Checkbox } from "@/components/ui/choice";

const steps = [
  { id: "welcome", title: "Welcome" }, { id: "profile", title: "Your profile" },
  { id: "courses", title: "Course choices" }, { id: "next", title: "What's next" },
] as const;
async function loadStudentLaunch() {
  const profile = await getStudentSelfProfile();
  const [registration, draft] = await Promise.all([
    getCourseRegistration(), getLaunchStudioDraft({ data: { audience: "student", context: "" } }),
  ]);
  return { profile, registration, draft };
}
export const Route = createFileRoute("/launch/student")({
  staleTime: Infinity,
  validateSearch: (search: Record<string, unknown>) => studentLaunchSearch.parse(search),
  loader: safeLoader(loadStudentLaunch),
  component: StudentLaunch,
});
function StudentLaunch() {
  const result = Route.useLoaderData();
  return result.ok ? <StudentJourney data={result.data} /> : <LoaderFailure title="Student launch" outcome={result} />;
}
function StudentJourney({ data }: { data: Awaited<ReturnType<typeof loadStudentLaunch>> }) {
  const router = useRouter();
  const search = Route.useSearch();
  const step = search.step ?? "welcome";
  const saved = data.draft?.value.audience === "student" ? data.draft.value.fields : undefined;
  const restoreProfile = saved && studentDraftMatchesProfile(saved, data.profile);
  const [baseline, setBaseline] = useState({ preferredName: data.profile.preferredName,
    pronouns: data.profile.preferredPronouns, interests: data.profile.interests.join(", ") });
  const [fields, setFields] = useState({ preferredName: restoreProfile ? saved.preferredName : baseline.preferredName,
    pronouns: restoreProfile ? saved.pronouns : baseline.pronouns,
    interests: restoreProfile ? saved.interests : baseline.interests });
  const [showOldDraft, setShowOldDraft] = useState(Boolean(saved && !restoreProfile));
  const [profileBusy, setProfileBusy] = useState(false);
  const [courseIds, setCourseIds] = useState(saved?.courseIds ?? []);
  const buffer = { ...fields, courseIds, profileBaseline: baseline };
  const profileChanges = useLaunchDraftChanges(fields);
  const courseChanges = useLaunchDraftChanges(courseIds);
  const mutation = useMutationFeedback(() => router.invalidate());
  useLaunchUnsavedChanges(profileChanges.dirty || courseChanges.dirty || profileBusy || mutation.pending || mutation.refreshFailed);
  function changeStep(id: string) {
    const next = steps.find(item => item.id === id);
    if (next) void router.navigate({ to: "/launch/student", search: { step: next.id } });
  }
  return <LaunchStudioShell role="Student setup" subject="Your school journey"
    title={{ welcome: "Make this beginning yours.", profile: "Tell us a little about you.",
      courses: "Explore your course choices.", next: "Find your next step." }[step]}
    steps={steps} currentId={step} onStepChange={changeStep}
    exit={<Link to="/home" className="underline">Skip to dashboard</Link>}
    status={<p>Your profile is optional. Course requests need school review; draft choices don't reserve a seat.</p>}
    saveAction={
      <LaunchDraftButton selection={{ audience: "student", context: "" }} initial={data.draft}
        disabled={profileBusy || mutation.pending || mutation.refreshFailed}
        onSaved={value => { if (value.audience === "student") {
          profileChanges.markSaved({ preferredName: value.fields.preferredName, pronouns: value.fields.pronouns, interests: value.fields.interests });
          courseChanges.markSaved(value.fields.courseIds); setShowOldDraft(false);
        } }}
        value={() => ({ audience: "student", fields: buffer })} />}
    actions={<>
      <Button variant="outline" disabled={step === "welcome" || profileBusy || mutation.pending || mutation.refreshFailed}
        onClick={() => changeStep(steps[steps.findIndex(item => item.id === step) - 1]!.id)}>Back</Button>
      {step !== "next" && <Button disabled={profileBusy || mutation.pending || mutation.refreshFailed}
        onClick={() => changeStep(steps[steps.findIndex(item => item.id === step) + 1]!.id)}>Continue</Button>}
    </>}>
    {step === "welcome" && <JourneyWelcome summary="Set up your optional profile and explore the classes your school makes available."
      requirements={["Your preferred name, if you use one", "Interests you want to keep in your private profile", "Questions about classes for your school"]}
      outcome="Draft choices are not registration requests. Your school reviews submitted requests and any required guardian permission before enrollment changes." />}
    <LaunchStudioStepContent active={step === "profile"}><section className="border bg-card p-6">
      {showOldDraft && saved && <div role="status" className="mb-4 border p-4 text-sm">
        Your current profile is shown because this draft may be older. Your course choices are still saved.
        <Button variant="outline" className="mt-3" onClick={() => {
          setFields({ preferredName: saved.preferredName, pronouns: saved.pronouns, interests: saved.interests });
          setShowOldDraft(false);
        }}>Use the older draft profile instead</Button>
      </div>}
      <p className="text-sm">Preferred name may appear to your school. Pronouns and interests remain private to you here. Legal identity and grade are school-managed.</p>
      <StudentProfileEditor embedded snapshot={data.profile} fields={fields} onFieldsChange={setFields}
        onBusyChange={setProfileBusy} onSaved={profile => {
          setBaseline(profile); setFields(profile); profileChanges.markSaved(profile); setShowOldDraft(false);
        }}
        changed={() => router.invalidate()} />
    </section></LaunchStudioStepContent>
    {step === "courses" && <section className="space-y-4">
      <p className="text-sm">Save choices to your draft, or submit a course request. Requests do not reserve seats or enroll you.</p>
      <MutationFeedback state={mutation} pendingMessage="Submitting course request..." />
      {!data.registration.sections.length && <p role="status" className="border bg-card p-5">Your school has no available courses here yet. Ask your registrar about your academic plan.</p>}
      {courseIds.some(id => !data.registration.sections.some(item => item.id === id)) &&
        <p role="status" className="border p-4 text-sm">Some draft choices are no longer available. They cannot be requested here.</p>}
      {data.registration.sections.map(course => {
        const enrolled = course.enrollmentStatus === "active";
        const pending = data.registration.requests.some(request => request.sectionId === course.id && ["open", "in_progress", "waiting"].includes(request.status));
        return <article key={course.id} className="border bg-card p-5">
          <p className="text-xs text-muted-foreground">{course.code} · {course.subject} · {course.credits} credits</p>
          <h2 className="mt-2 font-serif text-2xl">{course.title}</h2>
          <p className="mt-2 text-sm">{course.description}</p>
          <p className="mt-2 text-sm">{enrolled ? "Enrolled" : pending ? "Request pending school review" : "Not enrolled"}</p>
          {!course.contentReady && <p className="mt-2 text-sm">School content preparation is pending.</p>}
          {course.policy.guardianApprovalRequired && <p className="mt-2 text-sm">Guardian permission is required.</p>}
          {!enrolled && !pending && <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox
              checked={courseIds.includes(course.id)} disabled={mutation.pending || mutation.refreshFailed}
              onChange={event => setCourseIds(ids => event.target.checked ? [...ids, course.id] : ids.filter(id => id !== course.id))} />Keep in draft choices</label>
            <Button variant="outline" disabled={mutation.pending || mutation.refreshFailed} onClick={() => void mutation.run(async () => {
              const receipt = await requestCourseChange({ data: { sectionId: course.id, operation: "add" } });
              setCourseIds(ids => ids.filter(id => id !== course.id));
              return receipt;
            }, { successMessage: "Course request submitted for review.", commandErrorMessage: "Unable to submit course request." })}>Request this course</Button>
          </div>}
        </article>;
      })}
    </section>}
    {step === "next" && <JourneyWelcome summary="Your learning workspace is where your enrolled classes, assignments and school updates come together."
      requirements={["Check pending course requests with your registrar", "Ask your guardian to review any required course permissions"]}
      outcome="Saving a draft or finishing these pages does not activate enrollment or confirm a schedule.">
      <Button asChild className="mt-5"><Link to="/student/courses">Open my classes</Link></Button>
    </JourneyWelcome>}
  </LaunchStudioShell>;
}

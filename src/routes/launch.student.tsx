import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { studentLaunchSearch } from "@/domain/launch-studio";
import { LaunchStudioShell, JourneyWelcome } from "@/components/launch-studio/LaunchStudioShell";
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
  const [fields, setFields] = useState({ preferredName: saved?.preferredName ?? data.profile.preferredName,
    pronouns: saved?.pronouns ?? data.profile.preferredPronouns,
    interests: saved?.interests ?? data.profile.interests.join(", ") });
  const [courseIds, setCourseIds] = useState(saved?.courseIds ?? []);
  const mutation = useMutationFeedback(() => router.invalidate());
  function changeStep(id: string) {
    const next = steps.find(item => item.id === id);
    if (next) void router.navigate({ to: "/launch/student", search: { step: next.id } });
  }
  return <LaunchStudioShell role="Student setup" subject="Your school journey"
    title={{ welcome: "Make this beginning yours.", profile: "Tell us a little about you.",
      courses: "Explore your course choices.", next: "You're ready for your next step." }[step]}
    steps={steps} currentId={step} onStepChange={changeStep}
    exit={<Link to="/home" className="underline">Skip to dashboard</Link>}
    actions={<>
      <LaunchDraftButton selection={{ audience: "student", context: "" }} initial={data.draft}
        disabled={mutation.pending || mutation.refreshFailed}
        value={() => ({ audience: "student", fields: { ...fields, courseIds } })} />
      {step !== "next" && <Button onClick={() => changeStep(steps[steps.findIndex(item => item.id === step) + 1]!.id)}>Continue</Button>}
    </>}>
    {step === "welcome" && <JourneyWelcome summary="Set up your optional profile and explore the classes your school makes available."
      requirements={["Your preferred name, if you use one", "Interests you want to keep in your private profile", "Questions about classes for your school"]}
      outcome="Draft choices are not registration requests. Your school reviews submitted requests and any required guardian permission before enrollment changes." />}
    {step === "profile" && <section className="border bg-card p-6">
      <p className="text-sm">Preferred name may appear to your school. Pronouns and interests remain private to you here. Legal identity and grade are school-managed.</p>
      <StudentProfileEditor snapshot={data.profile} fields={fields} onFieldsChange={setFields} changed={() => router.invalidate()} />
    </section>}
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
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox"
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

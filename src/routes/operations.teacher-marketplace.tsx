import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { uuidProgramSelectionSchema } from "@/lib/route-search";
import { getCurriculumAdopterPrograms } from "@/modules/learning/curriculum-marketplace.functions";
import { getTeacherMarketplace } from "@/modules/staffing/teacher-marketplace.functions";
import { listTeacherStaffingRequests, requestTeacherStaffing } from "@/modules/staffing/teacher-staffing-requests.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/operations/teacher-marketplace")({
  validateSearch: (search: Record<string, unknown>) => uuidProgramSelectionSchema.parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => safeLoader(async () => ({
    programs: await getCurriculumAdopterPrograms(),
    market: deps.programId ? await getTeacherMarketplace({ data: { programId: deps.programId } }) : null,
    staffingRequests: deps.programId ? await listTeacherStaffingRequests({ data: { programId: deps.programId } }) : null,
  }), { authMessage: "An authorized school registrar is required." })(),
  component: TeacherMarketplacePage,
});

function TeacherMarketplacePage() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [targetSection, setTargetSection] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (!result.ok) return <LoaderFailure title="CAN teacher marketplace" outcome={result}/>;
  const { programs, market, staffingRequests } = result.data;
  async function selectTeacher(courseVersionId: string, teacherPersonId: string) {
    if (!market || submitting) return;
    setError(""); setNotice("");
    const selectionKey = `${courseVersionId}:${teacherPersonId}`;
    setSubmitting(selectionKey);
    try {
      const outcome = await requestTeacherStaffing({ data: {
        requestId: crypto.randomUUID(),
        programId: market.program.id, courseVersionId, teacherPersonId,
        ...(targetSection[courseVersionId] ? { sectionId: targetSection[courseVersionId] } : {}),
      } });
      await router.invalidate();
      setNotice(outcome.replayed ? "Your existing CAN staffing request is recorded." :
        "CAN staffing request recorded. Teacher assignment is not yet authorized.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The teacher request could not be saved.");
    } finally { setSubmitting(null); }
  }
  const search = query.trim().toLowerCase();
  const courses = market?.courses.filter(course =>
    !search || [course.code, course.title, course.subject, ...course.teacherOptions.map(t => t.name)]
      .some(value => value.toLowerCase().includes(search))) ?? [];
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN Academy · Academic staffing</p>
    <h1 className="font-serif text-4xl">Choose your teachers</h1>
    <p className="max-w-3xl text-sm text-muted-foreground">
      After selecting your school curriculum, review CAN-managed instructor options by course.
      A course recommendation can be carried into class staffing, with individual section overrides.
    </p>
    {error && <p role="alert" className="rounded-lg border border-destructive px-4 py-3 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-lg border px-4 py-3 text-sm">{notice}</p>}
    <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
      CAN Academy manages teacher onboarding and staffing. Course matches are recommendations;
      assignment requires current qualifications, availability, capacity and CAN authorization.
    </p>
    <nav aria-label="Choose school program" className="flex flex-wrap gap-2">
      {programs.map(program => <Link key={program.id} to="/operations/teacher-marketplace"
        search={{ programId: program.id }} aria-current={market?.program.id === program.id ? "page" : undefined}
        className="rounded-lg border px-3 py-2 text-sm underline">{program.name}</Link>)}
    </nav>
    {!market ? <p className="rounded-lg border p-4 text-sm">Select a school to see teachers mapped to its curriculum.</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">{market.program.name}</h2>
          <p className="text-sm text-muted-foreground">
            {market.courses.length} adopted courses · {market.matchedTeachers} teacher candidates
          </p>
        </div>
        <Link to="/operations/launch/$programId" params={{ programId: market.program.id }}
          className="rounded-lg border px-4 py-2 text-sm underline">Open class staffing</Link>
      </div>
      {market.courses.length > 0 && <label className="block max-w-md space-y-1 text-sm">
        <span className="font-medium">Search courses and teachers</span>
        <input className="w-full rounded-lg border bg-background px-3 py-2" type="search"
          value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Course, subject, or teacher" />
      </label>}
      {market.courses.length === 0 && <section className="rounded-xl border p-5">
        <p className="font-medium">No adopted curriculum is ready for teacher matching.</p>
        <p className="mt-1 text-sm text-muted-foreground">Finish selecting and adopting a published curriculum first.</p>
        <Link to="/operations/curriculum-marketplace" search={{ programId: market.program.id }}
          className="mt-3 inline-block text-sm underline">Select curriculum</Link>
      </section>}
      {courses.map(course => <section key={course.versionId} className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{course.subject} · {course.code}</p>
            <h3 className="font-serif text-xl">{course.title}</h3>
           </div>
          <p className="text-xs text-muted-foreground">{course.sectionCount} current classes</p>
        </div>
        {course.sections.length > 0 && <label className="block max-w-sm space-y-1 text-sm">
          <span className="font-medium">Apply selection to</span>
          <select value={targetSection[course.versionId] ?? ""}
            onChange={event => setTargetSection(previous => ({ ...previous, [course.versionId]: event.target.value }))}
            className="w-full rounded-lg border bg-background px-3 py-2">
            <option value="">Course-wide staffing request</option>
            {course.sections.map(section => <option key={section.id} value={section.id}>
              {section.code} · {section.title}
            </option>)}
          </select>
        </label>}
        {course.teacherOptions.length ? <div className="grid gap-3 md:grid-cols-2">
          {course.teacherOptions.map(teacher => <article key={teacher.personId}
            className="space-y-1 rounded-lg border p-3">
            <p className="font-semibold">{teacher.name}{teacher.isSynthetic && <span className="text-xs font-normal text-muted-foreground"> · Sample profile</span>}</p>
            <p className="text-sm text-muted-foreground">{teacher.modality.replaceAll("_", " ")} · Offered capacity: {teacher.indicativeSeatCapacity} seats (subject to confirmation)</p>
            <p className="text-xs text-muted-foreground">Teacher qualification, scheduling and assignment require CAN approval.</p>
            {(() => {
              const sectionId = targetSection[course.versionId] || null;
              const pendingRequest = staffingRequests?.requests.find(request =>
                request.status === "open" && request.courseVersionId === course.versionId &&
                request.teacherPersonId === teacher.personId && request.sectionId === sectionId);
              const recentDecline = staffingRequests?.requests.find(request =>
                request.status === "cancelled" && request.reviewState === "declined" &&
                request.courseVersionId === course.versionId &&
                request.teacherPersonId === teacher.personId && request.sectionId === sectionId);
              return <div className="mt-2 space-y-2">
                {recentDecline && <p className="text-xs text-muted-foreground">
                  Previous request declined{recentDecline.declineReason ? `: ${recentDecline.declineReason}` : "."}
                </p>}
                <Button type="button" size="sm" variant="outline"
                  disabled={Boolean(pendingRequest) || submitting !== null}
                  onClick={() => void selectTeacher(course.versionId, teacher.personId)}>
                  {pendingRequest ? pendingRequest.reviewState === "in_review"
                    ? "Under CAN review" : "CAN review requested"
                    : submitting === `${course.versionId}:${teacher.personId}`
                      ? "Submitting…" : "Request CAN staffing review"}
                </Button>
              </div>;
            })()}
          </article>)}
        </div> : <p className="text-sm text-muted-foreground">No CAN teacher currently matches this course. CAN staffing review may be required.</p>}
      </section>)}
      {market.courses.length > 0 && courses.length === 0 &&
        <p className="rounded-lg border p-4 text-sm">No matches for this search.</p>}
    </>}
  </main>;
}

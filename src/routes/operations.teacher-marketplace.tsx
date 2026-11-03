import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { uuidProgramSelectionSchema } from "@/lib/route-search";
import { getCurriculumAdopterPrograms } from "@/modules/learning/curriculum-marketplace.functions";
import {
  engageMarketplaceTeacher, getTeacherMarketplace,
} from "@/modules/staffing/teacher-marketplace.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/operations/teacher-marketplace")({
  validateSearch: (search: Record<string, unknown>) => uuidProgramSelectionSchema.parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => safeLoader(async () => ({
    programs: await getCurriculumAdopterPrograms(),
    market: deps.programId ? await getTeacherMarketplace({ data: { programId: deps.programId } }) : null,
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
  const { programs, market } = result.data;
  async function engageTeacher(courseVersionId: string, teacherPersonId: string, sectionId?: string) {
    if (!market || submitting) return;
    setError(""); setNotice("");
    const selectionKey = `${courseVersionId}:${teacherPersonId}:${sectionId ?? "course"}`;
    setSubmitting(selectionKey);
    try {
      const outcome = await engageMarketplaceTeacher({ data: {
        programId: market.program.id, courseVersionId, teacherPersonId,
        ...(sectionId ? { sectionId } : {}),
      } });
      await router.invalidate();
      if (sectionId) {
        setNotice(outcome.engaged
          ? "Teacher engaged for the selected class."
          : "Teacher was already engaged for the selected class.");
      } else {
        setNotice(`${outcome.engaged} compatible classes newly engaged; ${outcome.alreadyEngaged} already engaged.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The teacher could not be engaged.");
    } finally { setSubmitting(null); }
  }
  const search = query.trim().toLowerCase();
  const courses = market?.courses.filter(course =>
    !search || [course.code, course.title, course.subject, ...course.teacherOptions.map(t => t.name)]
      .some(value => value.toLowerCase().includes(search))) ?? [];
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Academic staffing</p>
    <h1 className="font-serif text-4xl">Choose your teachers</h1>
    <p className="max-w-3xl text-sm text-muted-foreground">
      After adopting curriculum, your school can directly engage an onboarded instructor across a course
      or for an individual class. Each class assignment uses the existing school launch checks.
    </p>
    {error && <p role="alert" className="rounded-lg border border-destructive px-4 py-3 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-lg border px-4 py-3 text-sm">{notice}</p>}
    <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
      Real candidates are shown only for classes where published qualifications, schedule availability,
      and reserved capacity currently match. Your school decides whom to engage.
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
        {course.teacherOptions.length ? <div className="grid gap-3 md:grid-cols-2">
          {course.teacherOptions.map(teacher => {
            const eligibleSections = course.sections.filter(section =>
              teacher.eligibleSectionIds.includes(section.id));
            const selectionKey = `${course.versionId}:${teacher.personId}`;
            const selection = targetSection[selectionKey] ?? "";
            const selectedIsEligible = selection
              ? teacher.eligibleSectionIds.includes(selection)
              : eligibleSections.length > 0;
            return <article key={teacher.personId} className="space-y-2 rounded-lg border p-3">
            <p className="font-semibold">{teacher.name}{teacher.isSynthetic && <span className="text-xs font-normal text-muted-foreground"> · Sample profile</span>}</p>
            <p className="text-sm text-muted-foreground">{teacher.modality.replaceAll("_", " ")} · Offered capacity: {teacher.indicativeSeatCapacity} seats</p>
            {teacher.isSynthetic && <p className="text-xs text-muted-foreground">
              Sample profiles are preview data and cannot be engaged as instructors.
            </p>}
            {!teacher.isSynthetic && <p className="text-xs text-muted-foreground">
              Currently eligible and reservable for {eligibleSections.length} of {course.sectionCount} classes.
            </p>}
            {!teacher.isSynthetic && eligibleSections.length > 0 && <label className="block space-y-1 text-sm">
              <span className="font-medium">Apply selection to</span>
              <select value={selection}
                onChange={event => setTargetSection(previous => ({ ...previous, [selectionKey]: event.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2">
                <option value="">All compatible classes ({eligibleSections.length})</option>
                {eligibleSections.map(section => <option key={section.id} value={section.id}>
                  {section.code} · {section.title}
                </option>)}
              </select>
            </label>}
            <Button type="button" size="sm" variant="outline"
              disabled={teacher.isSynthetic || !selectedIsEligible || submitting !== null}
              onClick={() => void engageTeacher(course.versionId, teacher.personId, selection || undefined)}>
              {submitting === `${course.versionId}:${teacher.personId}:${selection || "course"}`
                ? "Engaging…" : selection ? "Engage for this class" : "Engage across compatible classes"}
            </Button>
          </article>;
          })}
        </div> : <p className="text-sm text-muted-foreground">
          No eligible instructor has reservable capacity for these classes. Confirm each class has an open instructional capacity demand.
        </p>}
      </section>)}
      {market.courses.length > 0 && courses.length === 0 &&
        <p className="rounded-lg border p-4 text-sm">No matches for this search.</p>}
    </>}
  </main>;
}

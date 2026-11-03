import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { uuidProgramSelectionSchema } from "@/lib/route-search";
import { getCurriculumAdopterPrograms } from "@/modules/learning/curriculum-marketplace.functions";
import {
  engageMarketplaceTeacher, getTeacherMarketplace, getDemoTeacherPreviews,
} from "@/modules/staffing/teacher-marketplace.functions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState, MutationFeedback, WorkspaceShell } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";

export const Route = createFileRoute("/operations/teacher-marketplace")({
  validateSearch: (search: Record<string, unknown>) => uuidProgramSelectionSchema.parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => safeLoader(async () => ({
    programs: await getCurriculumAdopterPrograms(),
    market: deps.programId ? await getTeacherMarketplace({ data: { programId: deps.programId } }) : null,
    previews: deps.programId ? await getDemoTeacherPreviews({data:{programId:deps.programId}}) : null,
  }), { authMessage: "An authorized school registrar is required." })(),
  component: TeacherMarketplacePage,
});

function TeacherMarketplacePage() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [targetSection, setTargetSection] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const mutation = useMutationFeedback(() => router.invalidate());
  if (!result.ok) return <LoaderFailure title="CAN teacher marketplace" outcome={result}/>;
  const { programs, market, previews } = result.data;
  async function engageTeacher(courseVersionId: string, teacherPersonId: string, sectionId?: string) {
    if (!market || submitting || mutation.pending || mutation.refreshFailed) return;
    const selectionKey = `${courseVersionId}:${teacherPersonId}:${sectionId ?? "course"}`;
    setSubmitting(selectionKey);
    try {
      await mutation.run(() => engageMarketplaceTeacher({ data: {
        programId: market.program.id, courseVersionId, teacherPersonId,
        ...(sectionId ? { sectionId } : {}),
      } }), {
        successMessage: outcome => sectionId
          ? outcome.engaged
            ? "Teacher engaged for the selected class."
            : "Teacher was already engaged for the selected class."
          : `${outcome.engaged} compatible classes newly engaged; ${outcome.alreadyEngaged} already engaged.`,
        commandErrorMessage: "The teacher could not be engaged.",
        refreshErrorMessage: "Teacher engagement was saved, but marketplace data could not be refreshed. Retry refresh before engaging again.",
      });
    } finally { setSubmitting(null); }
  }
  const search = query.trim().toLowerCase();
  const courses = market?.courses.filter(course =>
    !search || [course.code, course.title, course.subject, ...course.teacherOptions.map(t => t.name)]
      .some(value => value.toLowerCase().includes(search))) ?? [];
  return <WorkspaceShell width="wide" eyebrow="Academic staffing" title="Choose your teachers"
    subtitle={<>
      After adopting curriculum, your school can directly engage an onboarded instructor across a course
      or for an individual class. Each class assignment uses the existing school launch checks.
    </>}>
    <MutationFeedback state={mutation} pendingMessage="Engaging teacher for the selected course or class."/>
    <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
      Real candidates are shown only for classes where published qualifications, schedule availability,
      and reserved capacity currently match. Your school decides whom to engage.
    </p>
    <nav aria-label="Choose school program" className="flex flex-wrap gap-2">
      {programs.map(program => <Button key={program.id} asChild
        variant={market?.program.id===program.id?"default":"outline"} size="sm">
        <Link to="/operations/teacher-marketplace" search={{ programId: program.id }}
          aria-current={market?.program.id === program.id ? "page" : undefined}>{program.name}</Link>
      </Button>)}
    </nav>
    {!market ? <EmptyState title={programs.length?"Choose a school program to view teacher matches.":"No school programs are available to this account."}
      description={programs.length?"Select one of your authorized programs above to see teachers mapped to its adopted curriculum.":"A school program must be available to your current access grant before marketplace results can be shown."}/> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">{market.program.name}</h2>
          <p className="text-sm text-muted-foreground">
            {market.courses.length} adopted courses · {market.matchedTeachers} teacher candidates
          </p>
        </div>
        <Button asChild variant="outline"><Link to="/operations/launch/$programId" params={{ programId: market.program.id }}>
          Open class staffing
        </Link></Button>
      </div>
      {market.courses.length > 0 && <Field label="Search courses and teachers" className="max-w-md">
        <Input type="search"
          value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Course, subject, or teacher" />
      </Field>}
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
            {!teacher.isSynthetic && eligibleSections.length > 0 && <Field label="Apply selection to">
              <Select value={selection} disabled={mutation.pending||mutation.refreshFailed}
                onChange={event => setTargetSection(previous => ({ ...previous, [selectionKey]: event.target.value }))}
                >
                <option value="">All compatible classes ({eligibleSections.length})</option>
                {eligibleSections.map(section => <option key={section.id} value={section.id}>
                  {section.code} · {section.title}
                </option>)}
              </Select>
            </Field>}
            <Button type="button" size="sm" variant="outline"
              disabled={teacher.isSynthetic || !selectedIsEligible || submitting !== null || mutation.pending || mutation.refreshFailed}
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
      <section className="space-y-3 rounded-xl border p-5" aria-label="Sample teacher previews">
        <h2 className="font-serif text-2xl">Explore sample teachers</h2>
        <p className="text-sm text-muted-foreground">Synthetic profiles for planning only. No verified credentials or permission to engage these teachers is implied.</p>
        <p className="text-sm">{previews?.teachers.length ?? 0} sample teachers available to preview</p>
        <div className="grid gap-3 md:grid-cols-2">
          {previews?.teachers.filter(teacher=>!search || [teacher.name,...teacher.courses.map(course=>course.title),...teacher.courses.map(course=>course.subject)].some(value=>value.toLowerCase().includes(search))).map(teacher=><article key={teacher.personId} className="rounded-lg border p-3">
            <p className="font-semibold">{teacher.name} · Sample profile</p>
            <p className="text-sm text-muted-foreground">{teacher.courses.length} illustrative course matches</p>
            <p className="text-sm">{[...new Set(teacher.courses.map(course=>course.subject))].join(", ")}</p>
          </article>)}
        </div>
      </section>
      {market.courses.length > 0 && courses.length === 0 &&
        <EmptyState title="No courses or teachers match this search."
          description="Try a different course code, subject, course title, or teacher name."/>}
    </>}
  </WorkspaceShell>;
}

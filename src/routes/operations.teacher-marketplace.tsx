import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { uuidProgramSelectionSchema } from "@/lib/route-search";
import { getCurriculumAdopterPrograms } from "@/modules/learning/curriculum-marketplace.functions";
import { getDemoTeacherMarketplace } from "@/modules/staffing/demo-teacher-marketplace.functions";

export const Route = createFileRoute("/operations/teacher-marketplace")({
  validateSearch: (search: Record<string, unknown>) => uuidProgramSelectionSchema.parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => safeLoader(async () => ({
    programs: await getCurriculumAdopterPrograms(),
    market: deps.programId ? await getDemoTeacherMarketplace({ data: { programId: deps.programId } }) : null,
  }), { authMessage: "An authorized school registrar in an isolated CAN demonstration environment is required." })(),
  component: DemoTeacherMarketplacePage,
});

function DemoTeacherMarketplacePage() {
  const result = Route.useLoaderData();
  const [query, setQuery] = useState("");
  if (!result.ok) return <LoaderFailure title="CAN teacher marketplace" outcome={result}/>;
  const { programs, market } = result.data;
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
    <p role="status" className="rounded-lg border px-4 py-3 text-sm">
      Demonstration marketplace. All profiles, experience, availability and seat counts are synthetic.
      No teacher listed here is credential-verified or approved for real-world assignment.
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
            {market.courses.length} adopted courses · {market.matchedTeachers} illustrative teacher profiles
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
          {course.teacherOptions.map(teacher => <article key={teacher.personId}
            className="space-y-1 rounded-lg border p-3">
            <p className="font-semibold">{teacher.name} <span className="text-xs font-normal text-muted-foreground">· Demo</span></p>
            <p className="text-sm text-muted-foreground">Live online · Illustrative capacity: {teacher.illustrativeSeatCapacity} seats</p>
            <p className="text-xs text-muted-foreground">Teaching eligibility not verified. Assignment requires CAN approval.</p>
          </article>)}
        </div> : <p className="text-sm text-muted-foreground">No demo teacher matches this course. CAN staffing review required.</p>}
      </section>)}
      {market.courses.length > 0 && courses.length === 0 &&
        <p className="rounded-lg border p-4 text-sm">No matches for this search.</p>}
    </>}
  </main>;
}

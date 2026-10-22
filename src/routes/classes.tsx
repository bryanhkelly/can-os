import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { classResources, type ClassContent } from "@/domain/class-content";
import { getClassDirectory, getClassWorkspace, getClassResourceDownload, getClassSupplementDownload, setLessonCompletion } from "@/modules/learning/class-workspace.functions";
import { addClassSupplement } from "@/modules/learning/class-supplements.functions";
import { publishClassAnnouncement } from "@/modules/learning/class-communication.functions";
import { WorkspaceShell, WorkspacePanel, DetailNavigation, StatusBadge } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const tabs = ["overview", "lessons", "planning", "files", "syllabus", "announcements", "people", "teacher-guide"] as const;
const searchSchema = z.object({
  section: z.string().uuid().optional(), student: z.string().uuid().optional(),
  tab: z.enum(tabs).optional(), lesson: z.string().max(100).optional(),
});
export const Route = createFileRoute("/classes")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ section: search.section, student: search.student }),
  loader: ({ deps }) => safeLoader(async () => {
    const directory = await getClassDirectory();
    const workspace = deps.section ? await getClassWorkspace({ data: { sectionId: deps.section, studentPersonId: deps.student } }) : null;
    return { directory, workspace };
  }, { authMessage: "Sign in with an authorized student, parent or teacher account to open classes." })(),
  component: ClassesPage,
});

function ClassesPage() {
  const outcome = Route.useLoaderData();
  const search = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Classes" title="Classes" outcome={outcome}/>;
  const { directory, workspace } = outcome.data;
  if (workspace) return <ClassWorkspace key={`${workspace.section.id}:${workspace.studentPersonId}`} data={workspace} tab={search.tab} lessonId={search.lesson}/>;
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Learning" title={directory.role === "guardian" ? "Your family's classes" : "My classes"}
    subtitle="Published learning, class updates and the teaching team, backed by your current relationships and enrollment.">
    <div className="mt-7 grid gap-4 md:grid-cols-2">{directory.classes.map(section => <WorkspacePanel
      key={`${section.id}:${section.studentPersonId}`} title={section.title} description={directory.role === "guardian" ? section.studentName ?? section.code : section.code}>
      <Link to="/classes" search={{ section: section.id, student: directory.role === "guardian" ? section.studentPersonId ?? undefined : undefined }}
        className="inline-block rounded-lg bg-foreground px-4 py-2 text-sm text-background">Open class</Link>
    </WorkspacePanel>)}</div>
    {!directory.classes.length && <p role="status" className="mt-7 rounded-xl border p-5 text-sm">No active classes are available in this membership.</p>}
  </WorkspaceShell>;
}

type Workspace = Awaited<ReturnType<typeof getClassWorkspace>>;
export function ClassWorkspace({ data, tab = "overview", lessonId }: { data: Workspace; tab?: (typeof tabs)[number]; lessonId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [resourceTitle,setResourceTitle]=useState("");
  const [resourceUrl,setResourceUrl]=useState("");
  const [resourceKind,setResourceKind]=useState<"link"|"video"|"pdf"|"image"|"audio"|"document">("link");
  const [resourceLesson,setResourceLesson]=useState("");
  const announcementId = useRef<string | null>(null);
  const search = { section: data.section.id, student: data.role === "guardian" ? data.studentPersonId ?? undefined : undefined };
  const supplements = data.supplements ?? [];
  const teacherGuides = data.role === "teacher" ? data.teacherGuides : null;
  const assessmentEvidence = data.assessmentEvidence ?? [];
  const assessmentSummary = data.assessmentEvidenceSummary;
  const lessons = data.content?.modules.flatMap(module => module.lessons) ?? [];
  const lesson = lessons.find(item => item.id === lessonId);
  const lessonIndex=lesson?lessons.findIndex(item=>item.id===lesson.id):-1;
  const previousLesson=lessonIndex>0?lessons[lessonIndex-1]:null;
  const nextLesson=lessonIndex>=0&&lessonIndex<lessons.length-1?lessons[lessonIndex+1]:null;
  const relatedWork = lesson ? assessmentEvidence.filter(item => item.curriculumLessonId === lesson.id) : [];

  const completed = new Set(data.progress.filter(item => item.completedAt).map(item => item.lessonId));
  async function run(command: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await command(); await router.invalidate(); setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete this class operation."); }
    finally { setBusy(false); }
  }
  async function download(resourceId: string) {
    await run(async () => {
      const result = await getClassResourceDownload({ data: { sectionId: data.section.id, studentPersonId: search.student, resourceId } });
      window.location.assign(result.downloadUrl);
    }, "");
  }
  async function downloadSupplement(supplementId:string) {
    await run(async()=>{
      const result=await getClassSupplementDownload({data:{
        sectionId:data.section.id,studentPersonId:search.student,supplementId,
      }});
      window.location.assign(result.downloadUrl);
    },"");
  }
  function resources(items: ClassContent["resources"]) {
    return <ul className="space-y-3">{items.map(item => <li key={item.id} className="rounded-lg border p-3 text-sm">
      {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline">{item.title} (external)</a> :
        <button type="button" disabled={busy} onClick={() => void download(item.id)} className="underline disabled:opacity-50">{item.title}</button>}
    </li>)}</ul>;
  }
  const classwork = data.role === "teacher" ? <Link to="/teacher/gradebook" search={{ section: data.section.id }} className="underline">Gradebook and submission review</Link> :
    data.role === "guardian" ? <Link to="/guardian/academics" search={{ student: search.student, section: data.section.id }} className="underline">Assignments and released feedback</Link> :
      <Link to="/student/assignments" search={{ section: data.section.id }} className="underline">Class assignments and feedback</Link>;
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Classes" title={data.section.title}
    subtitle={`${data.section.code} · ${data.section.subject}`}
    breadcrumbs={<><Link to="/classes" className="underline">Classes</Link><span>/</span><span>{data.section.title}</span></>}
    rail={<WorkspacePanel title="Class connections"><nav className="grid gap-4 text-sm" aria-label="Class connections">
      {classwork}
      {data.role !== "guardian" && <Link to={data.role === "teacher" ? "/teacher/discussions" : "/student/discussions"} search={{ section: data.section.id }} className="underline">Class discussions</Link>}
      {data.role !== "guardian" && <Link to="/calendar" search={{ section: data.section.id }} className="underline">Class calendar</Link>}
      {data.role === "guardian" && <Link to="/guardian/report-cards" search={{ student: search.student }} className="underline">Published report cards</Link>}
    </nav></WorkspacePanel>}>
    <DetailNavigation label="Class sections">{tabs.filter(value => !["people","teacher-guide","planning"].includes(value) || data.role === "teacher").map(value =>
      <Link key={value} to="/classes" search={{ ...search, tab: value }} aria-current={tab === value ? "page" : undefined} className="capitalize">{value === "people" ? "Roster" : value === "teacher-guide" ? "Teacher guide" : value}</Link>)}</DetailNavigation>
    {error && <p role="alert" className="mb-5 rounded-lg border p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mb-5 rounded-lg border p-3 text-sm">{notice}</p>}
    {tab === "overview" && <div className="grid gap-5">
      <WorkspacePanel title="About this class"><p className="whitespace-pre-wrap text-sm leading-7">{data.section.description || "No class description has been published."}</p></WorkspacePanel>
      <WorkspacePanel title="Learning progress" description="Student-reported lesson completion is not a grade, mastery score or attendance record.">
        <p className="text-sm">{data.role === "teacher" ? `${lessons.length} published lessons · ${data.roster.length} enrolled students` : `${completed.size} / ${lessons.length} published lessons marked complete`}</p>
        <Link to="/classes" search={{ ...search, tab: "lessons" }} className="mt-3 inline-block text-sm underline">Open lessons</Link>
      </WorkspacePanel>
      <WorkspacePanel title="Assessment evidence" description="Teacher-reviewed submissions are different from lesson completion. Scores shown here are not a mastery decision or course credit.">
        <p className="text-sm">{assessmentEvidence.length} published class assessments
          {data.role !== "teacher" && assessmentSummary ? ` · ${assessmentSummary.graded} graded · ${assessmentSummary.awaitingFeedback} awaiting feedback` : ""}</p>
        {data.role !== "teacher" && assessmentEvidence.length>0 && <ul className="mt-3 divide-y text-sm">
          {assessmentEvidence.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span>{item.title}</span>
            <span className="text-muted-foreground">{item.score !== null && item.pointsPossible !== null
              ? `Reviewed: ${item.score} / ${item.pointsPossible} points`
              : item.status==="submitted"?"Submitted · awaiting teacher review"
              : item.status==="draft"?"Response in progress"
              : item.status==="returned"?"Returned for revision"
              : "Not graded"}</span>
          </li>)}
        </ul>}
        <div className="mt-3 text-sm">{classwork}</div>
      </WorkspacePanel>
      {data.content?.blueprint && <WorkspacePanel title="Yearlong course roadmap"
        description="Curriculum planning progress, not a list of completed lessons or a credit-award decision. Planned weeks are not yet available for instruction.">
        <p className="text-sm">{data.content.blueprint.weeks.filter(week=>week.status!=="planned").length} of {data.content.blueprint.targetInstructionalWeeks} weeks authored · School review: {data.content.blueprint.reviewStatus.replaceAll("_"," ")}</p>
        {data.content.blueprint.creditStatus!=="credit_ready" && <p className="mt-2 text-sm text-muted-foreground">This course remains in curriculum development and is not certified as credit-ready.</p>}
        <details className="mt-3"><summary className="cursor-pointer text-sm underline">Explore the proposed weekly sequence</summary>
          <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">{data.content.blueprint.weeks.map(week=><li key={week.week} className="flex flex-wrap justify-between gap-2 border-b py-2">
            <span>Week {week.week}: {week.title}</span>
            <span className="text-muted-foreground">{week.status==="planned"?"Planning only":week.status==="authored"?"Authored; teacher review pending":week.status}</span>
          </li>)}</ol>
        </details>
      </WorkspacePanel>}
      <WorkspacePanel title="Teaching team"><ul className="space-y-2 text-sm">{data.teachers.map(teacher => <li key={teacher.personId}><Link to="/profiles" search={{person:teacher.personId}} className="underline">{teacher.name}</Link></li>)}</ul>
        {!data.teachers.length && <p className="text-sm text-muted-foreground">No teaching team is assigned.</p>}
      </WorkspacePanel>
    </div>}
    {tab === "lessons" && <div className="grid gap-5">
      {!data.content && <p role="status" className="rounded-xl border p-5 text-sm">No published learning content is configured for this class.</p>}
      {lessonId && !lesson && <p role="alert" className="rounded-xl border p-4 text-sm">This lesson is unavailable in the published course version.</p>}
      {lesson ? <WorkspacePanel title={lesson.title} actions={<Link to="/classes" search={{ ...search, tab: "lessons" }} className="text-sm underline">All lessons</Link>}>
        <nav aria-label="Course lesson navigation" className="mb-5 space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Lesson {lessonIndex+1} of {lessons.length}</span>
            {data.role==="student"&&<span>{completed.size} of {lessons.length} lessons self-reported complete</span>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            {previousLesson?<Link to="/classes" search={{...search,tab:"lessons",lesson:previousLesson.id}} className="underline">← Previous: {previousLesson.title}</Link>:
             <span className="text-muted-foreground">Beginning of course</span>}
            {nextLesson?<Link to="/classes" search={{...search,tab:"lessons",lesson:nextLesson.id}} className="underline">Next: {nextLesson.title} →</Link>:
             <span className="text-muted-foreground">End of published course</span>}
          </div>
          <p className="text-xs text-muted-foreground">Navigation never marks lessons complete or awards grades or academic credit.</p>
        </nav>
        {lesson.estimatedMinutes && <p className="mb-3 text-xs text-muted-foreground">Estimated lesson time: {lesson.estimatedMinutes} minutes</p>}
        {lesson.learningTargets?.length ? <section className="mb-5 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Learning targets</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{lesson.learningTargets.map(target=><li key={target}>{target}</li>)}</ul>
        </section> : null}
        {lesson.body.trim() && <section className="mb-5" aria-label="Publisher lesson reading">
          <h3 className="mb-3 text-sm font-semibold">Lesson reading</h3>
          <div className="whitespace-pre-wrap text-sm leading-8">{lesson.body}</div>
        </section>}
        {lesson.activities?.length ? <section aria-label="Lesson activities" className="mb-5">
          <h3 className="mb-3 text-sm font-semibold">Learning activities</h3>
          <ol className="space-y-5">
          {lesson.activities.map((activity,index)=><li key={activity.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{index+1}. {activity.title}</h3>
              <span className="text-xs text-muted-foreground">{activity.estimatedMinutes ? `${activity.estimatedMinutes} min · ` : ""}{activity.kind.replaceAll("_"," ")}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{activity.instructions}</p>
            {activity.evidence==="teacher_review" && <p className="mt-3 text-xs text-muted-foreground">Discuss or submit this evidence for teacher review. Opening this step does not grant a grade.</p>}
          </li>)}
          </ol>
        </section> : null}
        {!lesson.body.trim() && !lesson.activities?.length && <p className="text-sm text-muted-foreground">No lesson text or activities provided.</p>}
        {lesson.standards?.length ? <p className="mt-4 text-xs text-muted-foreground">Learning standards: {lesson.standards.join(", ")}</p> : null}
        {lesson.resources.length > 0 && <div className="mt-5">{resources(lesson.resources)}</div>}
        {supplements.some(item=>item.lessonId===lesson.id) && <div className="mt-5 space-y-2">
          <h3 className="font-semibold">Publisher, school and teacher resources</h3>
          <ul className="space-y-2">{supplements.filter(item=>item.lessonId===lesson.id).map(item=>
            <li key={item.id} className="rounded border p-3 text-sm">{item.url?
              <a href={item.url} rel="noopener noreferrer" target="_blank" className="underline">{item.title} ({item.kind})</a>
              :item.kind==="pdf"?<button type="button" disabled={busy}
                onClick={()=>void downloadSupplement(item.id)} className="underline disabled:opacity-50">
                {item.title} (private PDF)</button>:<span>{item.title} (unavailable document)</span>} <span className="text-xs text-muted-foreground">· {item.source}</span></li>)}</ul>
        </div>}
        {relatedWork.length > 0 && <section className="mt-6 space-y-3 rounded-lg border p-4" aria-label="Assignments for this lesson">
          <h3 className="text-sm font-semibold">Assignments for this lesson</h3>
          <ul className="divide-y">{relatedWork.map(work => <li key={work.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium text-sm">{work.title}</p>
              {data.role !== "teacher" && <p className="text-xs text-muted-foreground">
                {work.status === "graded" && work.score !== null ? `Graded: ${work.score} / ${work.pointsPossible ?? "—"}` :
                work.status === "submitted" ? "Submitted · awaiting teacher feedback" :
                work.status === "returned" ? "Returned for revision" :
                work.status === "draft" ? "Response in progress" : "Not submitted"}
              </p>}
            </div>
            {data.role === "teacher" ?
              <Link to="/teacher/gradebook" search={{section:data.section.id,assessment:work.id}} className="text-sm underline">Review in gradebook</Link> :
              data.role === "student" ?
              <Link to="/student/assignments" search={{section:data.section.id,assessment:work.id}} className="text-sm underline">Open assignment</Link> : null}
          </li>)}</ul>
        </section>}
        {data.role === "teacher" && <section className="mt-6 rounded-lg border p-4" aria-label="Assign from this lesson">
          <h3 className="text-sm font-semibold">Assign work from this lesson</h3>
          <p className="mt-1 text-xs text-muted-foreground">Create teacher-owned work linked to this published lesson. Publisher content remains unchanged.</p>
          <div className="mt-3 flex flex-wrap gap-3">{(["homework","classwork","quiz","test","project"] as const).map(kind=>
            <Link key={kind} to="/teacher/gradebook" search={{section:data.section.id,lesson:lesson.id,kind}}
              className="rounded border px-3 py-2 text-sm capitalize">Create {kind}</Link>
          )}
            <Link to="/teacher/discussions" search={{section:data.section.id,lesson:lesson.id}}
              className="rounded border px-3 py-2 text-sm">Start discussion</Link>
          </div>
        </section>}
        {data.role === "student" && <button type="button" disabled={busy} onClick={() => void run(() => setLessonCompletion({ data: {
          sectionId: data.section.id, versionId: data.section.versionId, lessonId: lesson.id, completed: !completed.has(lesson.id),
        } }), completed.has(lesson.id) ? "Lesson marked incomplete." : "Lesson completion saved.")}
          className="mt-5 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{completed.has(lesson.id) ? "Mark incomplete" : "Mark lesson complete"}</button>}
      </WorkspacePanel> : data.content?.modules.map(module => <WorkspacePanel key={module.id} title={module.title}>
        <ul className="divide-y">{module.lessons.map(item => <li key={item.id} className="flex items-center justify-between gap-3 py-3">
          <Link to="/classes" search={{ ...search, tab: "lessons", lesson: item.id }} className="text-sm underline">{item.title}</Link>
          {data.role !== "teacher" && <StatusBadge tone={completed.has(item.id) ? "success" : "neutral"}>{completed.has(item.id) ? "Complete" : "Not completed"}</StatusBadge>}
        </li>)}</ul>
      </WorkspacePanel>)}
      {data.content && !lessons.length && <p className="text-sm text-muted-foreground">No lessons have been published.</p>}
    </div>}
    {tab === "planning" && (data.role === "teacher" ? <div className="space-y-5" aria-label="Teacher course implementation plan">
      <WorkspacePanel title="Teacher course implementation plan"
        description="Plan classroom work from the publisher's pinned course sequence. Class assignments and supplements are separate teacher-owned records; completion is self-reported, not mastery or credit.">
        <p className="text-sm">{lessons.length} published lessons · {data.roster.length} enrolled learners · {assessmentEvidence.length} released assessments</p>
        {data.content?.blueprint&&<p className="mt-2 text-xs text-muted-foreground">
          Publisher's proposed {data.content.blueprint.targetInstructionalWeeks}-week sequence:
          {data.content.blueprint.weeks.filter(week=>week.status!=="planned").length} weeks with authored planning status.
          Planned weeks without published lessons are not assigned automatically.
        </p>}
      </WorkspacePanel>
      {data.content?.modules.map(module=><WorkspacePanel key={module.id} title={module.title}>
        {data.content?.blueprint&&<p className="mb-3 text-xs text-muted-foreground">
          {data.content.blueprint.weeks.filter(week=>week.unitId===module.id).map(week=>`Week ${week.week}: ${week.title} (${week.status})`).join(" · ")||"No matching weeks in publisher roadmap"}
        </p>}
        <ol className="divide-y">{module.lessons.map(item=>{
          const assigned=assessmentEvidence.filter(work=>work.curriculumLessonId===item.id);
          const marked=data.lessonCompletionCounts.find(count=>count.lessonId===item.id)?.studentCount??0;
          return <li key={item.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{assigned.length} linked released assignments · {marked}/{data.roster.length} learners self-reported complete</p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <Link to="/classes" search={{...search,tab:"lessons",lesson:item.id}} className="underline">View lesson</Link>
                <Link to="/teacher/gradebook" search={{section:data.section.id,lesson:item.id,kind:"classwork"}} className="underline">Create classwork</Link>
              </div>
            </div>
            {assigned.length>0&&<div className="flex flex-wrap gap-2">{assigned.map(work=>
              <Link key={work.id} to="/teacher/gradebook" search={{section:data.section.id,assessment:work.id}}
               className="rounded border px-2 py-1 text-xs underline">{work.title}</Link>)}</div>}
          </li>;
        })}</ol>
        {!module.lessons.length&&<p className="text-sm text-muted-foreground">No published lessons in this unit.</p>}
      </WorkspacePanel>)}
      {!data.content&&<p className="rounded border p-4 text-sm">No published curriculum is available to plan this class.</p>}
    </div> : <p role="alert" className="rounded border p-4 text-sm">Teacher planning is available only to the assigned teaching team.</p>)}
    {tab === "files" && <WorkspacePanel title="Class files and resources" description="Links and verified private documents from the published course version.">
      {data.role==="teacher" && <form className="mb-5 grid gap-3 rounded-lg border p-4"
        onSubmit={event=>{event.preventDefault();void run(async()=>{
          await addClassSupplement({data:{
            sectionId:data.section.id,title:resourceTitle.trim(),url:resourceUrl.trim(),
            kind:resourceKind,...(resourceLesson?{lessonId:resourceLesson}:{})
          }});
          setResourceTitle("");setResourceUrl("");setResourceLesson("");
        },"Class resource added without changing the publisher's curriculum.");}}>
        <h3 className="text-sm font-semibold">Add a teacher supplement</h3>
        <p className="text-xs text-muted-foreground">Share an HTTPS resource with this class, or connect it to a particular published lesson. Publisher content stays unchanged.</p>
        <label className="text-sm">Title<input aria-label="Resource title" required minLength={3} maxLength={200} value={resourceTitle}
          onChange={event=>setResourceTitle(event.target.value)} className="mt-1 w-full rounded border p-2"/></label>
        <label className="text-sm">External HTTPS resource URL<input aria-label="Resource URL" required type="url" value={resourceUrl}
          onChange={event=>setResourceUrl(event.target.value)} className="mt-1 w-full rounded border p-2"/></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Resource type
            <select aria-label="Resource type" value={resourceKind}
              onChange={event=>setResourceKind(event.target.value as typeof resourceKind)}
              className="mt-1 w-full rounded border p-2">
              {(["link","video","pdf","image","audio","document"] as const).map(kind=><option key={kind} value={kind}>{kind}</option>)}
            </select>
          </label>
          <label className="text-sm">Publisher lesson (optional)
            <select aria-label="Publisher lesson" value={resourceLesson}
              onChange={event=>setResourceLesson(event.target.value)}
              className="mt-1 w-full rounded border p-2">
              <option value="">Classwide resource</option>
              {lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
            </select>
          </label>
        </div>
        <button type="submit" disabled={busy} className="justify-self-start rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50">Add resource</button>
      </form>}
      {data.content && resources(classResources(data.content))}
      {supplements.length>0 && <section className="mt-5 space-y-2"><h3 className="font-semibold">Publisher, school and teacher resources</h3>
        <ul className="space-y-2">{supplements.map(item=><li key={item.id} className="rounded border p-3 text-sm">
          {item.url?<a href={item.url} target="_blank" rel="noopener noreferrer" className="underline">{item.title} ({item.kind})</a>
           :item.kind==="pdf"?<button type="button" disabled={busy}
              onClick={()=>void downloadSupplement(item.id)} className="underline disabled:opacity-50">
              {item.title} (private PDF)</button>:<span>{item.title} (unavailable document)</span>}
          <span className="ml-2 text-xs text-muted-foreground">· {item.source}</span>
        </li>)}</ul>
      </section>}
      {(!data.content || !classResources(data.content).length) && !supplements.length && <p className="text-sm text-muted-foreground">No resources have been published.</p>}
    </WorkspacePanel>}
    {tab === "syllabus" && <WorkspacePanel title="Syllabus"><p className="whitespace-pre-wrap text-sm leading-8">{data.content?.syllabus || "No syllabus has been published."}</p></WorkspacePanel>}
    {tab === "people" && (data.role === "teacher" ? <WorkspacePanel title="Class roster" description="Only current section enrollments appear. Completion is student-reported, not mastery.">
      <ul className="divide-y">{data.roster.map(student => <li key={student.profileId} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <Link to="/staff/students/$personId" params={{ personId: student.personId }} className="text-sm font-semibold underline">{student.name}</Link>
        <span className="text-sm text-muted-foreground">{student.completedLessons} / {lessons.length} lessons marked complete</span>
        <Link to="/teacher/gradebook" search={{ section: data.section.id, student: student.profileId }} className="text-sm underline">Review classwork</Link>
      </li>)}</ul>
      {!data.roster.length && <p className="text-sm">No students are enrolled in this class.</p>}
    </WorkspacePanel> : <p role="alert" className="text-sm">Class rosters are available only to the assigned teaching team.</p>)}
    {tab === "teacher-guide" && (data.role === "teacher" ? (
      <div className="grid gap-5">
        {!teacherGuides && <WorkspacePanel title="Teacher guide not published">
          <p className="text-sm">There is no private teacher guide attached to this published course version.</p>
        </WorkspacePanel>}
        {teacherGuides?.units.map(unit=><WorkspacePanel key={unit.unitId} title={`Teacher guide · ${unit.unitId}`}
          description={`Teacher review: ${unit.reviewStatus.replaceAll("_"," ")}. These worked answers are not student-facing instructional content.`}>
          <p className="whitespace-pre-wrap text-sm leading-7">{unit.teacherOverview}</p>
          <div className="mt-4 grid gap-3">{unit.lessons.map(item=><details key={item.lessonId} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Lesson: {data.content?.modules.flatMap(module=>module.lessons).find(lesson=>lesson.id===item.lessonId)?.title ?? item.lessonId}</summary>
            <div className="mt-3 space-y-4 text-sm">
              <p className="whitespace-pre-wrap">{item.preparation}</p>
              <section><h3 className="font-semibold">Worked solutions</h3>
                <ul className="mt-2 space-y-2">{item.workedAnswers.map((a,i)=><li key={i} className="rounded border p-3"><p className="font-semibold">{a.prompt}</p><p className="mt-1 whitespace-pre-wrap">{a.answer}</p></li>)}</ul>
              </section>
              <section><h3 className="font-semibold">Common misconceptions</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5">{item.misconceptions.map((t,i)=><li key={i}>{t}</li>)}</ul>
              </section>
              <section><h3 className="font-semibold">Interventions</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5">{item.interventions.map((t,i)=><li key={i}>{t}</li>)}</ul>
              </section>
              {!!item.extensions.length && <section><h3 className="font-semibold">Extensions</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5">{item.extensions.map((t,i)=><li key={i}>{t}</li>)}</ul>
              </section>}
            </div>
          </details>)}</div>
          <h3 className="mt-5 text-sm font-semibold">Assessment answer guides</h3>
          <div className="mt-2 grid gap-3">{unit.assessments.map(item=><details key={item.assessmentKey} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">{item.title}</summary>
            <div className="mt-3 space-y-3 text-sm">
              {item.answerGuide.map(q=><div key={q.item} className="rounded border p-3">
                <p className="font-semibold">Item {q.item}</p>
                <p className="mt-1 whitespace-pre-wrap">{q.correctResponse}</p>
                <p className="mt-2 text-muted-foreground">{q.evidenceToLookFor}</p>
              </div>)}
              <p className="whitespace-pre-wrap">{item.scoringNotes}</p>
            </div>
          </details>)}</div>
        </WorkspacePanel>)}
      </div>
    ) : <p role="alert" className="rounded-lg border p-4 text-sm">Teacher-only materials are unavailable to this account.</p>)}
    {tab === "announcements" && <div className="grid gap-5">
      {data.role === "teacher" && <WorkspacePanel title="Post a class announcement" description="Visible to enrolled students and academically authorized guardians.">
        <form className="grid gap-3" onSubmit={event => { event.preventDefault(); announcementId.current ??= crypto.randomUUID();
          void run(async () => {
            await publishClassAnnouncement({ data: { id: announcementId.current!, sectionId: data.section.id, title, body } });
            setTitle(""); setBody(""); announcementId.current = null;
          }, "Class announcement published.");
        }}>
          <label className="text-sm">Title<input maxLength={160} disabled={busy} value={title} onChange={event => { setTitle(event.target.value); announcementId.current = null; }} className="mt-2 block w-full rounded-lg border bg-background p-3"/></label>
          <label className="text-sm">Announcement<textarea maxLength={5000} rows={4} disabled={busy} value={body} onChange={event => { setBody(event.target.value); announcementId.current = null; }} className="mt-2 block w-full rounded-lg border bg-background p-3"/></label>
          <button disabled={busy || title.trim().length < 3 || !body.trim()} className="justify-self-start rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">{busy ? "Publishing..." : "Publish announcement"}</button>
        </form>
      </WorkspacePanel>}
      {data.announcements.slice().reverse().map(item => <WorkspacePanel key={item.id} title={item.title} description={new Date(item.createdAt).toLocaleString()}>
        <p className="whitespace-pre-wrap text-sm leading-7">{item.body}</p>
      </WorkspacePanel>)}
      {!data.announcements.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">No class announcements yet.</p>}
    </div>}
  </WorkspaceShell>;
}

import { PublishedLessonContent } from "@/components/learning/PublishedLessonContent";
import { ClassSupplementForm } from "@/components/learning/ClassSupplementForm";
import { CommonCartridgeStaticLesson } from "@/components/learning/CommonCartridgeStaticLesson";
import { ClassAnnouncementFeed } from "@/components/learning/ClassAnnouncementFeed";
import { ClassAnnouncementComposer } from "@/components/learning/ClassAnnouncementComposer";
import { ClassCourseRoadmap } from "@/components/learning/ClassCourseRoadmap";
import { ClassRosterPanel } from "@/components/learning/ClassRosterPanel";
import { ClassAssessmentEvidence } from "@/components/learning/ClassAssessmentEvidence";
import { ClassLearningProgress } from "@/components/learning/ClassLearningProgress";
import { ClassTeachingTeam } from "@/components/learning/ClassTeachingTeam";
import { PublishedLessonNavigation } from "@/components/learning/PublishedLessonNavigation";
import { selectPublishedLesson } from "@/components/learning/lesson-navigation";
import { StudentNextStepsPanel } from "@/components/learning/StudentNextStepsPanel";
import { ClassDirectoryCards } from "@/components/learning/ClassDirectoryCards";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { classResources, type ClassContent } from "@/domain/class-content";
import { isLearnerFacingInstruction } from "@/domain/first-class-lesson";
import { getClassDirectory, getClassWorkspace, getClassResourceDownload, getClassSupplementDownload, setLessonCompletion } from "@/modules/learning/class-workspace.functions";
import { addClassSupplement, manageClassSupplement } from "@/modules/learning/class-supplements.functions";
import { publishClassAnnouncement } from "@/modules/learning/class-communication.functions";
import { WorkspaceShell, WorkspacePanel, DetailNavigation, StatusBadge } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { LearningActivityTracker } from "@/components/learning/LearningActivityTracker";
import { deriveClassNextSteps } from "@/domain/student-success";

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
    <ClassDirectoryCards classes={directory.classes} role={directory.role} />
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
  const [editingResource,setEditingResource]=useState<string|null>(null);
  const [resourceEditTitle,setResourceEditTitle]=useState("");
  const [resourceEditUrl,setResourceEditUrl]=useState("");
  const [resourceEditKind,setResourceEditKind]=useState<"link"|"video"|"pdf"|"image"|"audio"|"document">("link");
  const [retireCandidate,setRetireCandidate]=useState<string|null>(null);
  const announcementId = useRef<string | null>(null);
  const search = { section: data.section.id, student: data.role === "guardian" ? data.studentPersonId ?? undefined : undefined };
  const supplements = data.supplements ?? [];
  const teacherGuides = data.role === "teacher" ? data.teacherGuides : null;
  const assessmentEvidence = data.assessmentEvidence ?? [];
  const assessmentSummary = data.assessmentEvidenceSummary;
  const lessons = data.content?.modules.flatMap(module => module.lessons).filter(isLearnerFacingInstruction) ?? [];
  // The student home can link directly to a real published lesson without
  // predicting the publisher's IDs. Empty shell lessons are not first-day
  // instruction, even if they precede the first authored lesson.
  const { lesson, lessonIndex, previousLesson, nextLesson } = selectPublishedLesson(lessons, lessonId);
  const relatedWork = lesson ? assessmentEvidence.filter(item => item.curriculumLessonId === lesson.id) : [];

  const completed = new Set(data.progress.filter(item => item.completedAt && lessons.some(lesson=>lesson.id===item.lessonId)).map(item => item.lessonId));
  const nextSteps = deriveClassNextSteps({
    lessonIds: lessons.map(item => item.id),
    completedLessonIds: [...completed],
    assessments: assessmentEvidence,
  });
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
      {item.url ? <a href={item.url} data-learning-resource-id={item.id} target="_blank" rel="noopener noreferrer" className="underline">{item.title} (external)</a> :
        <button type="button" data-learning-resource-id={item.id} disabled={busy} onClick={() => void download(item.id)} className="underline disabled:opacity-50">{item.title}</button>}
    </li>)}</ul>;
  }
  function supplementActions(item:typeof supplements[number]){
    if(data.role!=="teacher"||!item.canManage)return null;
    return <div className="mt-3 space-y-2 border-t pt-3" aria-label={"Manage "+item.title}>
      {editingResource===item.id?<form className="grid gap-2" onSubmit={event=>{event.preventDefault();void run(async()=>{
        await manageClassSupplement({data:{action:"replace",sectionId:data.section.id,supplementId:item.id,
          title:resourceEditTitle,kind:resourceEditKind,url:resourceEditUrl}});
        setEditingResource(null);
      },"Teacher resource replaced. Publisher content remains unchanged.");}}>
        <label className="text-xs">Replacement title<input required minLength={3} maxLength={200} value={resourceEditTitle}
          onChange={e=>setResourceEditTitle(e.target.value)} className="mt-1 block w-full rounded border p-2"/></label>
        <label className="text-xs">Replacement HTTPS link<input required type="url" value={resourceEditUrl}
          onChange={e=>setResourceEditUrl(e.target.value)} className="mt-1 block w-full rounded border p-2"/></label>
        <label className="text-xs">Resource format<select value={resourceEditKind}
          onChange={e=>setResourceEditKind(e.target.value as typeof resourceEditKind)} className="mt-1 block w-full rounded border p-2">
          {(["link","video","pdf","image","audio","document"] as const).map(kind=><option key={kind} value={kind}>{kind}</option>)}
        </select></label>
        <div className="flex gap-3"><button type="submit" disabled={busy} className="text-xs underline">Save replacement</button>
          <button type="button" onClick={()=>setEditingResource(null)} className="text-xs underline">Cancel</button></div>
      </form>:<button type="button" disabled={busy} className="text-xs underline"
        onClick={()=>{setEditingResource(item.id);setRetireCandidate(null);
          setResourceEditTitle(item.title);setResourceEditUrl(item.url??"");
          setResourceEditKind(item.kind as typeof resourceEditKind);}}>Replace resource</button>}
      {retireCandidate===item.id?<div className="flex gap-3 text-xs">
        <span>Retire this teacher resource from the class?</span>
        <button type="button" disabled={busy} className="underline" onClick={()=>void run(async()=>{
          await manageClassSupplement({data:{action:"retire",sectionId:data.section.id,supplementId:item.id}});
          setRetireCandidate(null);
        },"Teacher resource retired from this class.")}>Confirm retirement</button>
        <button type="button" className="underline" onClick={()=>setRetireCandidate(null)}>Cancel</button>
      </div>:<button type="button" disabled={busy} className="text-xs underline" onClick={()=>{setRetireCandidate(item.id);setEditingResource(null);}}>Retire resource</button>}
    </div>;
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
      {data.role !== "teacher" && <StudentNextStepsPanel nextSteps={nextSteps} search={search} />}
      <WorkspacePanel title="About this class"><p className="whitespace-pre-wrap text-sm leading-7">{data.section.description || "No class description has been published."}</p></WorkspacePanel>
      <ClassLearningProgress search={search} isTeacher={data.role==="teacher"}
       lessonCount={lessons.length} completedCount={completed.size} studentCount={data.roster.length} />
      <ClassAssessmentEvidence items={assessmentEvidence} summary={assessmentSummary}
       isTeacher={data.role==="teacher"} classwork={classwork} />
      {data.content?.blueprint && <ClassCourseRoadmap blueprint={data.content.blueprint} />}
      <ClassTeachingTeam teachers={data.teachers} />
    </div>}
    {data.curriculumAccess?.available===false&&<p role="alert" className="mt-5 rounded-lg border p-4 text-sm">
      {data.curriculumAccess.reason} Your assignments and academic records remain available in their usual workspaces.
    </p>}
    {tab === "lessons" && <div className="grid gap-5">
      {!data.content && <p role="status" className="rounded-xl border p-5 text-sm">No published learning content is configured for this class.</p>}
      {lessonId && !lesson && <p role="alert" className="rounded-xl border p-4 text-sm">This lesson is unavailable in the published course version.</p>}
      {lesson ? <WorkspacePanel title={lesson.title} actions={<Link to="/classes" search={{ ...search, tab: "lessons" }} className="text-sm underline">All lessons</Link>}>
        {data.role === "student" && <LearningActivityTracker sectionId={data.section.id} lessonId={lesson.id} />}
        <PublishedLessonNavigation search={search} lessonIndex={lessonIndex} lessonCount={lessons.length} completedCount={completed.size} isStudent={data.role==="student"} previousLesson={previousLesson} nextLesson={nextLesson} />

        <PublishedLessonContent lesson={lesson} />
        {lesson.resources.length > 0 && <div className="mt-5" data-learning-content>{resources(lesson.resources)}</div>}
        {supplements.some(item=>item.lessonId===lesson.id) && <div className="mt-5 space-y-2">
          <h3 className="font-semibold">Publisher, school and teacher resources</h3>
          <ul className="space-y-2">{supplements.filter(item=>item.lessonId===lesson.id).map(item=>
            <li key={item.id} className="rounded border p-3 text-sm">{item.url?
              <a href={item.url} rel="noopener noreferrer" target="_blank" className="underline">{item.title} ({item.kind})</a>
              :item.kind==="html"&&item.resourceId?<CommonCartridgeStaticLesson programId={data.section.programId} sectionId={data.section.id} resourceId={item.resourceId}/>\n              :item.kind==="pdf"?<button type="button" disabled={busy}
                onClick={()=>void downloadSupplement(item.id)} className="underline disabled:opacity-50">
                {item.title} (private PDF)</button>:<span>{item.title} (unavailable document)</span>} <span className="text-xs text-muted-foreground">· {item.source}</span>{supplementActions(item)}</li>)}</ul>
        </div>}
        {data.role==="teacher"&&<form className="mt-5 grid gap-3 rounded-lg border p-4" aria-label="Add resource to this lesson"
          onSubmit={event=>{event.preventDefault();void run(async()=>{
            await addClassSupplement({data:{sectionId:data.section.id,lessonId:lesson.id,
              title:resourceTitle.trim(),url:resourceUrl.trim(),kind:resourceKind}});
            setResourceTitle("");setResourceUrl("");
          },"Teacher supplement attached to this lesson.");}}>
          <h3 className="font-semibold text-sm">Add resource to this lesson</h3>
          <label className="text-xs">Resource title<input required minLength={3} maxLength={200} value={resourceTitle}
           onChange={e=>setResourceTitle(e.target.value)} className="mt-1 block w-full rounded border p-2"/></label>
          <label className="text-xs">HTTPS resource link<input required type="url" value={resourceUrl}
           onChange={e=>setResourceUrl(e.target.value)} className="mt-1 block w-full rounded border p-2"/></label>
          <label className="text-xs">Resource format<select value={resourceKind}
           onChange={e=>setResourceKind(e.target.value as typeof resourceKind)} className="mt-1 block w-full rounded border p-2">
           {(["link","video","pdf","image","audio","document"] as const).map(kind=><option key={kind} value={kind}>{kind}</option>)}
          </select></label>
          <button disabled={busy} className="justify-self-start rounded border px-3 py-2 text-sm">Add lesson resource</button>
          <p className="text-xs text-muted-foreground">Only teacher-owned supplementary resources can be replaced or retired here. Publisher content is immutable.</p>
        </form>}
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
      </WorkspacePanel> : data.content?.modules.filter(module=>module.lessons.some(isLearnerFacingInstruction)).map(module => <WorkspacePanel key={module.id} title={module.title}>
        <ul className="divide-y">{module.lessons.filter(isLearnerFacingInstruction).map(item => <li key={item.id} className="flex items-center justify-between gap-3 py-3">
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
              {isLearnerFacingInstruction(item)?<div className="flex flex-wrap gap-3 text-sm">
                <Link to="/classes" search={{...search,tab:"lessons",lesson:item.id}} className="underline">View lesson</Link>
                <Link to="/teacher/gradebook" search={{section:data.section.id,lesson:item.id,kind:"classwork"}} className="underline">Create classwork</Link>
              </div>:<p className="text-xs text-muted-foreground">Outline only — publisher instruction is not available yet.</p>}
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
      {data.role==="teacher" && <ClassSupplementForm title={resourceTitle} url={resourceUrl}
        kind={resourceKind} lessonId={resourceLesson} lessons={lessons} busy={busy}
        onTitleChange={setResourceTitle} onUrlChange={setResourceUrl}
        onKindChange={setResourceKind} onLessonChange={setResourceLesson}
        onSubmit={()=>void run(async()=>{
          await addClassSupplement({data:{
            sectionId:data.section.id,title:resourceTitle.trim(),url:resourceUrl.trim(),
            kind:resourceKind,...(resourceLesson?{lessonId:resourceLesson}:{})
          }});
          setResourceTitle("");setResourceUrl("");setResourceLesson("");
        },"Class resource added without changing the publisher's curriculum.")} />}
      {data.content && resources(classResources(data.content))}
      {supplements.length>0 && <section className="mt-5 space-y-2"><h3 className="font-semibold">Publisher, school and teacher resources</h3>
        <ul className="space-y-2">{supplements.map(item=><li key={item.id} className="rounded border p-3 text-sm">
          {item.url?<a href={item.url} target="_blank" rel="noopener noreferrer" className="underline">{item.title} ({item.kind})</a>
           :item.kind==="html"&&item.resourceId?<CommonCartridgeStaticLesson programId={data.section.programId} sectionId={data.section.id} resourceId={item.resourceId}/>\n              :item.kind==="pdf"?<button type="button" disabled={busy}
              onClick={()=>void downloadSupplement(item.id)} className="underline disabled:opacity-50">
              {item.title} (private PDF)</button>:<span>{item.title} (unavailable document)</span>}
          <span className="ml-2 text-xs text-muted-foreground">· {item.source}</span>{supplementActions(item)}
        </li>)}</ul>
      </section>}
      {(!data.content || !classResources(data.content).length) && !supplements.length && <p className="text-sm text-muted-foreground">No resources have been published.</p>}
    </WorkspacePanel>}
    {tab === "syllabus" && <WorkspacePanel title="Syllabus"><p className="whitespace-pre-wrap text-sm leading-8">{data.content?.syllabus || "No syllabus has been published."}</p></WorkspacePanel>}
    {tab === "people" && (data.role === "teacher"
      ? <ClassRosterPanel students={data.roster} lessonCount={lessons.length} sectionId={data.section.id} />
      : <p role="alert" className="text-sm">Class rosters are available only to the assigned teaching team.</p>)}
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
      {data.role === "teacher" && <ClassAnnouncementComposer title={title} body={body} busy={busy}
        onTitleChange={value=>{setTitle(value);announcementId.current=null;}}
        onBodyChange={value=>{setBody(value);announcementId.current=null;}}
        onSubmit={()=>{announcementId.current??=crypto.randomUUID();
          void run(async()=>{
            await publishClassAnnouncement({data:{id:announcementId.current!,sectionId:data.section.id,title,body}});
            setTitle("");setBody("");announcementId.current=null;
          },"Class announcement published.");
        }} />}
      <ClassAnnouncementFeed announcements={data.announcements} />
    </div>}
  </WorkspaceShell>;
}

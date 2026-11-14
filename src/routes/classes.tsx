import { PublishedLessonContent } from "@/components/learning/PublishedLessonContent";
import { ClassroomWorkspace } from "@/components/learning/ClassroomWorkspace";
import { ClassLessonOutline } from "@/components/learning/ClassLessonOutline";
import { ClassroomLessonTabs } from "@/components/learning/ClassroomLessonTabs";
import { PrivateLessonNotes } from "@/components/learning/PrivateLessonNotes";
import { ClassroomMediaStage, type ClassroomMeetings } from "@/components/learning/ClassroomMediaStage";
import { ClassVideoPlayer, ClassVideoPlaceholder } from "@/components/learning/ClassVideoPlayer";
import { SafeClassExternalLink, safeClassExternalHref } from "@/components/learning/SafeClassExternalLink";
import { ClassVideoUploadForm } from "@/components/learning/ClassVideoUploadForm";
import { resolveClassVideo } from "@/domain/class-video";
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
import { ClassCreationRequestForm } from "@/components/learning/ClassCreationRequestForm";
import { ClassTeacherPlanningPanel } from "@/components/learning/ClassTeacherPlanningPanel";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { classResources, type ClassContent } from "@/domain/class-content";
import { isLearnerFacingInstruction } from "@/domain/first-class-lesson";
import { getClassDirectory, getClassWorkspace, getClassResourceDownload, getClassSupplementDownload, setLessonCompletion } from "@/modules/learning/class-workspace.functions";
import { getTeacherClassRequestOptions } from "@/modules/programs/section-creation-requests.functions";
import { getClassroomMeetings, scheduleClassroomMeeting, setClassroomMeetingLink } from "@/modules/learning/classroom-meetings.functions";
import { addClassSupplement, manageClassSupplement } from "@/modules/learning/class-supplements.functions";
import { publishClassAnnouncement } from "@/modules/learning/class-communication.functions";
import { WorkspaceShell, WorkspacePanel, DetailNavigation, SectionTab, StatusBadge } from "@/components/workspace";
import { safeLoader, type LoadOutcome } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { LearningActivityTracker } from "@/components/learning/LearningActivityTracker";
import { deriveClassNextSteps } from "@/domain/student-success";

const tabs = ["overview", "lessons", "planning", "files", "syllabus", "announcements", "people", "teacher-guide"] as const;
const meetingCommands = { get: getClassroomMeetings, schedule: scheduleClassroomMeeting, saveLink: setClassroomMeetingLink };
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
    const meetings = workspace ? await safeLoader(() => getClassroomMeetings({ data: {
      sectionId: workspace.section.id, studentPersonId: deps.student,
    } }))() : undefined;
    const classRequestOptions = !workspace && directory.role === "teacher"
      ? await getTeacherClassRequestOptions()
      : null;
    return { directory, workspace, classRequestOptions, meetings };
  }, { authMessage: "Sign in with an authorized student, parent or teacher account to open classes." })(),
  component: ClassesPage,
});

function ClassesPage() {
  const outcome = Route.useLoaderData();
  const search = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="Classes" title="Classes" outcome={outcome}/>;
  const { directory, workspace, classRequestOptions, meetings } = outcome.data;
  if (workspace) return <ClassWorkspace key={`${workspace.section.id}:${workspace.studentPersonId}`} data={workspace} tab={search.tab} lessonId={search.lesson} meetings={meetings}/>;
  return <WorkspaceShell width="wide" eyebrow="Learning" title={directory.role === "guardian" ? "Your family's classes" : "My classes"}
    subtitle="Published learning, class updates and the teaching team, backed by your current relationships and enrollment.">
    <ClassDirectoryCards classes={directory.classes} role={directory.role} />
    {classRequestOptions && <ClassCreationRequestForm options={classRequestOptions}/>}
  </WorkspaceShell>;
}

type Workspace = Awaited<ReturnType<typeof getClassWorkspace>>;
export function ClassWorkspace({ data, tab = data.role === "student" ? "lessons" : "overview", lessonId, meetings }: {
  data: Workspace; tab?: (typeof tabs)[number]; lessonId?: string; meetings?: LoadOutcome<ClassroomMeetings>;
}) {
  const router = useRouter();
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [resourceTitle,setResourceTitle]=useState("");
  const [resourceUrl,setResourceUrl]=useState("");
  const [resourceKind,setResourceKind]=useState<"link"|"video"|"pdf"|"image"|"audio"|"document">("link");
  const [resourceLesson,setResourceLesson]=useState("");
  const [editingResource,setEditingResource]=useState<string|null>(null);
  const [resourceEditTitle,setResourceEditTitle]=useState("");
  const [resourceEditUrl,setResourceEditUrl]=useState("");
  const [resourceEditAttempted,setResourceEditAttempted]=useState(false);
  const [resourceEditKind,setResourceEditKind]=useState<"link"|"video"|"pdf"|"image"|"audio"|"document">("link");
  const [retireCandidate,setRetireCandidate]=useState<string|null>(null);
  const announcementId = useRef<string | null>(null);
  const search = { section: data.section.id, student: data.role === "guardian" ? data.studentPersonId ?? undefined : undefined };
  const supplements = data.supplements ?? [];
  const teacherGuides = data.role === "teacher" ? data.teacherGuides : null;
  const assessmentEvidence = data.assessmentEvidence ?? [];
  const assessmentSummary = data.assessmentEvidenceSummary;
  const lessons = data.content?.modules.flatMap(module => module.lessons).filter(isLearnerFacingInstruction) ?? [];
  const completed = new Set(data.progress.filter(item => item.completedAt && lessons.some(lesson=>lesson.id===item.lessonId)).map(item => item.lessonId));
  // The student home can link directly to a real published lesson without
  // predicting the publisher's IDs. Empty shell lessons are not first-day
  // instruction, even if they precede the first authored lesson.
  const { lesson, lessonIndex, previousLesson, nextLesson } = selectPublishedLesson(lessons,
    lessonId ?? lessons.find(item => !completed.has(item.id))?.id ?? lessons[0]?.id);
  const relatedWork = lesson ? assessmentEvidence.filter(item => item.curriculumLessonId === lesson.id) : [];
  const lessonDiscussions = lesson ? (data.discussions ?? []).filter(item => item.lessonId === lesson.id || item.lessonId === null) : [];
  const videoResource = (item: ClassContent["resources"][number]) => Boolean(item.url && resolveClassVideo(item.url));
  const videoSupplement = (item: typeof supplements[number]) => item.kind === "video" || Boolean(item.url && resolveClassVideo(item.url));
  const mainVideoResource = lesson?.resources.find(videoResource) ?? data.content?.resources.find(videoResource);
  const mainVideoSupplement = mainVideoResource ? undefined :
    (lesson ? supplements.find(item => item.lessonId === lesson.id && videoSupplement(item)) : undefined) ??
    supplements.find(item => item.lessonId === null && videoSupplement(item));

  const nextSteps = deriveClassNextSteps({
    lessonIds: lessons.map(item => item.id),
    completedLessonIds: [...completed],
    assessments: assessmentEvidence,
  });
  async function run(command: () => Promise<unknown>, success: string) {
    await mutation.run(command, {
      successMessage: success,
      commandErrorMessage: "Unable to complete this class operation.",
    });
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
      {item.url && resolveClassVideo(item.url) ? <ClassVideoPlayer title={item.title} url={item.url} resourceId={item.id} declaredVideo={false}/> :
        item.url ? <SafeClassExternalLink url={item.url} title={item.title} kind="external" resourceId={item.id}/> :
        <button type="button" data-learning-resource-id={item.id} disabled={busy} onClick={() => void download(item.id)} className="underline disabled:opacity-50">{item.title}</button>}
    </li>)}</ul>;
  }
  function supplementContent(item: typeof supplements[number], presentation: "standard" | "classroom" = "standard") {
    if (item.kind === "video" || (item.url && resolveClassVideo(item.url))) {
      return <ClassVideoPlayer key={`${item.id}:${item.url ?? item.resourceId}`} title={item.title} presentation={presentation}
        url={item.url} loadUrl={!item.url ? async () => {
          const result = await getClassSupplementDownload({ data: {
            sectionId: data.section.id, studentPersonId: search.student, supplementId: item.id,
          } });
          return result.downloadUrl;
        } : undefined}/>;
    }
    if (item.url) return <SafeClassExternalLink url={item.url} title={item.title} kind={item.kind}/>;
    if (item.kind === "html" && item.resourceId) return <CommonCartridgeStaticLesson
      programId={data.section.programId} sectionId={data.section.id} resourceId={item.resourceId}/>;
    if (item.kind === "pdf") return <button type="button" disabled={busy}
      onClick={() => void downloadSupplement(item.id)} className="underline disabled:opacity-50">{item.title} (private PDF)</button>;
    return <span>{item.title} (unavailable document)</span>;
  }
  function supplementActions(item:typeof supplements[number]){
    if(data.role!=="teacher"||!item.canManage)return null;
    return <div className="mt-3 space-y-2 border-t pt-3" aria-label={"Manage "+item.title}>
      {editingResource===item.id?<form noValidate className="grid gap-2" onSubmit={event=>{
        event.preventDefault();setResourceEditAttempted(true);
        const validHttps=Boolean(safeClassExternalHref(resourceEditUrl.trim())) &&
          (resourceEditKind!=="video" || Boolean(resolveClassVideo(resourceEditUrl.trim())));
        if(resourceEditTitle.trim().length<3||!validHttps)return;
        void run(async()=>{
        await manageClassSupplement({data:{action:"replace",sectionId:data.section.id,supplementId:item.id,
          title:resourceEditTitle,kind:resourceEditKind,url:resourceEditUrl.trim()}});
        setEditingResource(null);setResourceEditAttempted(false);
      },"Teacher resource replaced. Publisher content remains unchanged.");}}>
        <Field label="Replacement title" className="text-xs" required error={resourceEditAttempted&&resourceEditTitle.trim().length<3?"Enter a title with at least 3 characters.":undefined}>
          <Input minLength={3} maxLength={200} value={resourceEditTitle} onChange={e=>setResourceEditTitle(e.target.value)}/>
        </Field>
        <Field label="Replacement HTTPS link" className="text-xs" required
          error={resourceEditAttempted&&(!safeClassExternalHref(resourceEditUrl.trim()) || (resourceEditKind==="video"&&!resolveClassVideo(resourceEditUrl.trim())))?"Enter a valid HTTPS resource link without credentials. Videos must use a supported video URL.":undefined}>
          <Input type="url" value={resourceEditUrl} onChange={e=>setResourceEditUrl(e.target.value)}/>
        </Field>
        <Field label="Resource format" className="text-xs"><Select value={resourceEditKind}
          onChange={e=>setResourceEditKind(e.target.value as typeof resourceEditKind)}>
          {(["link","video","pdf","image","audio","document"] as const).map(kind=><option key={kind} value={kind}>{kind}</option>)}
        </Select></Field>
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
    data.role === "guardian" ? <Link to="/guardian/students" search={{ student: search.student, section: data.section.id }} className="underline">Assignments and released feedback</Link> :
      <Link to="/student/assignments" search={{ section: data.section.id }} className="underline">Class assignments and feedback</Link>;
  const recorded = mainVideoResource?.url ? <ClassVideoPlayer key={mainVideoResource.id} title={mainVideoResource.title}
    url={mainVideoResource.url} resourceId={mainVideoResource.id} declaredVideo={false} presentation="classroom"/> :
    mainVideoSupplement ? supplementContent(mainVideoSupplement, "classroom") : <ClassVideoPlaceholder
      title={lesson ? "No lesson recording yet" : "No class recording yet"}
      message={lesson ? "Your teacher has not attached a recorded video. Use the published reading and activities below." :
        "Your school has not attached a recorded video to this class. Check Live classroom for scheduled meetings, or open your class assignments."}/>;
  const stepWork = lesson ? relatedWork : assessmentEvidence;
  const nextWork = stepWork.find(work => work.status === "returned") ??
    stepWork.find(work => work.status === "not_submitted" || work.status === "draft");
  const nextAction = data.role === "student" && nextWork ?
    <Link to="/student/assignments" search={{section:data.section.id,assessment:nextWork.id}}
      className="inline-flex justify-center border bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
      {nextWork.status === "returned" ? "Review revision request" : "Open assignment"} →
    </Link> : nextSteps.nextLessonId && data.role !== "teacher" ?
    <Link to="/classes" search={{...search,tab:"lessons",lesson:nextSteps.nextLessonId}}
      className="inline-flex justify-center border bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Continue lesson →</Link> : classwork;
  const stepTitle = data.role === "student" && nextWork ? nextWork.title : "Review your classwork";
  const stepDetail = data.role === "student" && nextWork ?
    nextWork.status === "returned" ? "Your teacher requested a revision. Review the released feedback before resubmitting." :
    nextWork.status === "draft" ? "Continue the saved response for this published assignment." :
    "This published assignment has no submitted response yet." :
    lessons.length > 0 ? "Continue published lessons or review your assignments. Video playback does not mark a lesson complete." :
    "Your teacher's assignments remain available while the published lesson sequence is being prepared.";
  return <ClassroomWorkspace title={data.section.title}
    lessonTitle={tab === "lessons" ? lesson?.title : undefined}
    lessonPosition={tab === "lessons" && lesson ? {current:lessonIndex+1,total:lessons.length} : undefined}
    subtitle={tab === "lessons" && lesson ? `Lesson ${lessonIndex+1} of ${lessons.length} · ${data.section.code} · ${data.section.subject}` :
      `${data.section.code} · ${data.section.subject}`}
    actions={<Link to="/classes" search={{...search,tab:"lessons"}} hash="published-lesson-outline"
      className="inline-flex items-center border bg-card px-3 py-2 text-xs font-semibold">All lessons</Link>}
    metadata={<>
      <span><strong>Teacher</strong> · {data.teachers.length ? data.teachers.map((teacher, index) => <span key={teacher.personId}>
        {index > 0 && ", "}<Link to="/profiles" search={{person:teacher.personId}} className="underline">{teacher.name}</Link>
      </span>) : "Not assigned"}</span>
      {tab === "lessons" && lesson?.estimatedMinutes && <span><strong>Estimated</strong> · {lesson.estimatedMinutes} min</span>}
      {data.role !== "teacher" && lessons.length > 0 && <span><strong>Self-reported progress</strong> · {Math.round(completed.size/lessons.length*100)}%</span>}
    </>}
    rail={<>
      <ClassLessonOutline content={data.content} search={search} currentLessonId={tab === "lessons" ? lesson?.id : undefined}
        completed={completed} showCompletion={data.role !== "teacher"}/>
      <WorkspacePanel title="Your next step">
        <p className="text-xs font-semibold">{stepTitle}</p>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{stepDetail}</p>
        <div className="mt-4 text-xs">{nextAction}</div>
      </WorkspacePanel>
      {data.role !== "teacher" && lessons.length > 0 && <details className="border bg-card p-4">
        <summary className="cursor-pointer text-xs font-semibold">Learning progress details</summary>
        <StudentNextStepsPanel nextSteps={nextSteps} search={search}/>
      </details>}
      <WorkspacePanel title="Class connections"><nav className="grid gap-4 text-sm" aria-label="Class connections">
      {classwork}
      {data.role === "student" && <Link to="/student/courses" search={{section:data.section.id,tab:"grades"}} className="underline">Grades and released feedback</Link>}
      {data.role === "student" && <Link to="/student/courses" search={{section:data.section.id,view:"catalog"}} className="underline">Registration and change deadlines</Link>}
      {data.role !== "guardian" && <Link to={data.role === "teacher" ? "/teacher/discussions" : "/student/discussions"} search={{ section: data.section.id }} className="underline">Class discussions</Link>}
      {data.role !== "guardian" && <Link to="/calendar" search={{ section: data.section.id }} className="underline">Class calendar</Link>}
      {data.role === "guardian" && <Link to="/guardian/report-cards" search={{ student: search.student }} className="underline">Published report cards</Link>}
    </nav></WorkspacePanel>
      <WorkspacePanel title="Need support?" description="Review the transcript, save your lesson notes, or ask your class a question.">
        {data.role !== "guardian" ? <Link to={data.role === "teacher" ? "/teacher/discussions" : "/student/discussions"}
          search={{section:data.section.id,lesson:lesson?.id}} className="inline-flex w-full justify-center border px-3 py-2 text-xs font-semibold">Open discussion →</Link> :
          <Link to="/messages" className="text-sm underline">Open school messages</Link>}
        {data.role === "student" && <p className="mt-3"><Link to="/student/support" className="text-sm underline">Open student support</Link></p>}
      </WorkspacePanel>
    </>}>
    <DetailNavigation label="Class sections">{tabs.filter(value => !["people","teacher-guide","planning"].includes(value) || data.role === "teacher").map(value =>
      <SectionTab key={value} current={tab === value} className="capitalize" link={{ to: "/classes", search: { ...search, tab: value } }}>{value === "people" ? "Roster" : value === "teacher-guide" ? "Teacher guide" : value}</SectionTab>)}</DetailNavigation>
    <MutationFeedback state={mutation} className="mb-5" pendingMessage="Saving class change..."/>
    {tab === "overview" && <div className="grid grid-cols-1 gap-5">
      <ClassroomMediaStage sectionId={data.section.id} timezone={data.section.timezone} role={data.role} meetings={meetings} studentPersonId={search.student} commands={meetingCommands}
        recorded={<section><h2 className="font-serif text-2xl font-semibold">About this class</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{data.section.description || "No class description has been published."}</p>
          {lessons.length > 0 && <p className="mt-4"><Link to="/classes" search={{ ...search, tab: "lessons", lesson: nextSteps.nextLessonId ?? lessons[0]!.id }}
            className="text-sm font-semibold underline">Open published lesson</Link></p>}
        </section>}/>
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
    {tab === "lessons" && <div className="grid grid-cols-1 gap-5">
      <ClassroomMediaStage key={`media:${lesson?.id ?? "class"}`} sectionId={data.section.id} timezone={data.section.timezone}
        role={data.role} meetings={meetings} studentPersonId={search.student} commands={meetingCommands} recorded={recorded}/>
      {!data.content && <p role="status" className="rounded-xl border p-5 text-sm">No published learning content is configured for this class.</p>}
      {lessonId && !lesson && <p role="alert" className="rounded-xl border p-4 text-sm">This lesson is unavailable in the published course version.</p>}
      {lesson ? <div>
        {data.role === "student" && <LearningActivityTracker sectionId={data.section.id} lessonId={lesson.id} />}

        <ClassroomLessonTabs key={`tabs:${lesson.id}`} materials={<>
          <PublishedLessonContent lesson={lesson} />
          {lesson.resources.length > 0 && <div className="mt-5" data-learning-content>{resources(lesson.resources.filter(item => item.id !== mainVideoResource?.id))}</div>}
          {supplements.some(item=>item.lessonId===lesson.id && item.id !== mainVideoSupplement?.id) && <div className="mt-5 space-y-2">
          <h3 className="font-semibold">Publisher, school and teacher resources</h3>
          <ul className="space-y-2">{supplements.filter(item=>item.lessonId===lesson.id && item.id !== mainVideoSupplement?.id).map(item=>
            <li key={item.id} className="rounded border p-3 text-sm">{supplementContent(item)} <span className="text-xs text-muted-foreground">· {item.source}</span>{supplementActions(item)}</li>)}</ul>
          </div>}
          {mainVideoSupplement && <div className="mt-3 text-xs text-muted-foreground">{mainVideoSupplement.title} · {mainVideoSupplement.source}{supplementActions(mainVideoSupplement)}</div>}
        </>} transcript={lesson.transcript?.trim() ? <section aria-label="Published lesson transcript" data-learning-content>
          <h3 className="mb-3 text-sm font-semibold">Recorded lesson transcript</h3>
          <div className="whitespace-pre-wrap text-sm leading-8">{lesson.transcript}</div>
        </section> : <p role="status" className="text-sm text-muted-foreground">No transcript has been published for this lesson.</p>}
          notes={data.role !== "guardian" ? <PrivateLessonNotes key={lesson.id} sectionId={data.section.id} versionId={data.section.versionId} lessonId={lesson.id}/> : undefined}
          discussion={data.role !== "guardian" ? <section className="space-y-4" aria-label="Lesson discussions">
            <p className="text-sm text-muted-foreground">Discuss this lesson with your class. Posts use the school’s shared discussion threads and teacher moderation.</p>
            {!lessonDiscussions.length && <p role="status" className="text-sm">No discussion has been opened for this lesson.</p>}
            <ul className="divide-y">{lessonDiscussions.map(thread => <li key={thread.id} className="py-3">
              <Link to={data.role === "teacher" ? "/teacher/discussions" : "/student/discussions"} search={{ section: data.section.id, thread: thread.id }}
                className="font-semibold underline">{thread.title}</Link>
              <p className="mt-1 text-xs text-muted-foreground">{thread.locked ? "Locked · read only" : "Open for class responses"}{thread.lessonId === null ? " · Class-wide discussion" : ""}</p>
            </li>)}</ul>
            {data.role === "teacher" && <Link to="/teacher/discussions" search={{ section: data.section.id, lesson: lesson.id }} className="text-sm underline">Start a discussion from this lesson</Link>}
          </section> : undefined}/>
        {data.role === "teacher" && <ClassSupplementForm key={lesson.id} title={resourceTitle} url={resourceUrl}
          kind={resourceKind} lessonId={lesson.id} lessons={lessons} busy={busy} fixedLesson
          sectionId={data.section.id} uploadsEnabled={data.videoUploadsEnabled}
          onTitleChange={setResourceTitle} onUrlChange={setResourceUrl}
          onKindChange={setResourceKind} onLessonChange={setResourceLesson}
          onSubmit={() => void run(async () => {
            await addClassSupplement({ data: {
              sectionId: data.section.id, lessonId: lesson.id,
              title: resourceTitle.trim(), url: resourceUrl.trim(), kind: resourceKind,
            } });
            setResourceTitle(""); setResourceUrl("");
          }, "Teacher resource attached to this lesson.")} />}
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
        <div className="mt-5"><PublishedLessonNavigation search={search} lessonIndex={lessonIndex} lessonCount={lessons.length} completedCount={completed.size} isStudent={data.role==="student"} previousLesson={previousLesson} nextLesson={nextLesson}/></div>
      </div> : data.content?.modules.filter(module=>module.lessons.some(isLearnerFacingInstruction)).map(module => <WorkspacePanel key={module.id} title={module.title}>
        <ul className="divide-y">{module.lessons.filter(isLearnerFacingInstruction).map(item => <li key={item.id} className="flex items-center justify-between gap-3 py-3">
          <Link to="/classes" search={{ ...search, tab: "lessons", lesson: item.id }} className="text-sm underline">{item.title}</Link>
          {data.role !== "teacher" && <StatusBadge tone={completed.has(item.id) ? "success" : "neutral"}>{completed.has(item.id) ? "Complete" : "Not completed"}</StatusBadge>}
        </li>)}</ul>
      </WorkspacePanel>)}
      {data.content && !lessons.length && <p className="text-sm text-muted-foreground">No lessons have been published.</p>}
      {!lesson && <ClassroomLessonTabs materials={<div className="space-y-4">
        <h3 className="font-serif text-2xl font-normal">About this class</h3>
        <p className="whitespace-pre-wrap text-sm leading-7">{data.section.description || "No class description has been published."}</p>
        <p className="text-sm text-muted-foreground">No published lesson is selected. Your class assignments and school resources remain separate from the course lesson sequence.</p>
        <div className="text-sm">{classwork}</div>
        {data.content?.resources.length ? resources(data.content.resources.filter(item => item.id !== mainVideoResource?.id)) : null}
        {supplements.some(item => item.lessonId === null && item.id !== mainVideoSupplement?.id) && <ul className="space-y-3">
          {supplements.filter(item => item.lessonId === null && item.id !== mainVideoSupplement?.id).map(item =>
            <li key={item.id} className="border p-3 text-sm">{supplementContent(item)}{supplementActions(item)}</li>)}
        </ul>}
      </div>} transcript={<p role="status" className="text-sm text-muted-foreground">No lesson transcript is available.</p>}
        notes={data.role !== "guardian" ? <section className="space-y-4" aria-label="Private lesson notes unavailable">
          <h3 className="font-serif text-2xl font-normal">Your notes</h3>
          <p role="status" className="text-sm text-muted-foreground">Private notes require a published lesson. This class has no lesson selected yet; no notes can be saved here.</p>
          <label className="block text-xs font-semibold">Lesson notes<textarea disabled rows={5}
            className="mt-2 w-full border bg-muted p-3" placeholder="Select a published lesson to take notes."/></label>
        </section> : undefined}
        discussion={data.role !== "guardian" ? <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Open your class discussion workspace for teacher-moderated conversations.</p>
          <Link to={data.role === "teacher" ? "/teacher/discussions" : "/student/discussions"}
            search={{section:data.section.id}} className="text-sm underline">Open class discussions</Link>
        </div> : undefined}/>}
      <section className="classroom-next-step" aria-label="Continue your learning">
        <div><h2 className="text-sm font-semibold">{stepTitle}</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">{stepDetail}</p></div>
        <div className="shrink-0 text-sm">{nextAction}</div>
      </section>
    </div>}
    {tab === "planning" && <ClassTeacherPlanningPanel data={data} lessons={lessons} search={search}/>}
    {tab === "files" && <WorkspacePanel title="Class files and resources" description="Links and verified private documents from the published course version.">
      {data.role==="teacher" && <ClassSupplementForm title={resourceTitle} url={resourceUrl}
        kind={resourceKind} lessonId={resourceLesson} lessons={lessons} busy={busy}
         sectionId={data.section.id} uploadsEnabled={data.videoUploadsEnabled}
        onTitleChange={setResourceTitle} onUrlChange={setResourceUrl}
        onKindChange={setResourceKind} onLessonChange={setResourceLesson}
        onSubmit={()=>void run(async()=>{
          await addClassSupplement({data:{
            sectionId:data.section.id,title:resourceTitle.trim(),url:resourceUrl.trim(),
            kind:resourceKind,...(resourceLesson?{lessonId:resourceLesson}:{})
          }});
          setResourceTitle("");setResourceUrl("");setResourceLesson("");
        },"Class resource added without changing the publisher's curriculum.")} />}
      {data.role === "teacher" && <ClassVideoUploadForm sectionId={data.section.id}
        lessons={lessons} enabled={data.videoUploadsEnabled}/>}
      {data.content && resources(classResources(data.content))}
      {supplements.length>0 && <section className="mt-5 space-y-2"><h3 className="font-semibold">Publisher, school and teacher resources</h3>
        <ul className="space-y-2">{supplements.map(item=><li key={item.id} className="rounded border p-3 text-sm">
          {supplementContent(item)}
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
      <ClassAnnouncementFeed announcements={data.announcements} timezone={data.section.timezone} />
    </div>}
  </ClassroomWorkspace>;
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";

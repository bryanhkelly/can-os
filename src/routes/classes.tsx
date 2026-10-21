import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { classResources, type ClassContent } from "@/domain/class-content";
import { getClassDirectory, getClassWorkspace, getClassResourceDownload, setLessonCompletion } from "@/modules/learning/class-workspace.functions";
import { publishClassAnnouncement } from "@/modules/learning/class-communication.functions";
import { WorkspaceShell, WorkspacePanel, DetailNavigation, StatusBadge } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const tabs = ["overview", "lessons", "files", "syllabus", "announcements", "people"] as const;
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
  const announcementId = useRef<string | null>(null);
  const search = { section: data.section.id, student: data.role === "guardian" ? data.studentPersonId ?? undefined : undefined };
  const supplements = data.supplements ?? [];
  const lessons = data.content?.modules.flatMap(module => module.lessons) ?? [];
  const lesson = lessons.find(item => item.id === lessonId);
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
    <DetailNavigation label="Class sections">{tabs.filter(value => value !== "people" || data.role === "teacher").map(value =>
      <Link key={value} to="/classes" search={{ ...search, tab: value }} aria-current={tab === value ? "page" : undefined} className="capitalize">{value === "people" ? "Roster" : value}</Link>)}</DetailNavigation>
    {error && <p role="alert" className="mb-5 rounded-lg border p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mb-5 rounded-lg border p-3 text-sm">{notice}</p>}
    {tab === "overview" && <div className="grid gap-5">
      <WorkspacePanel title="About this class"><p className="whitespace-pre-wrap text-sm leading-7">{data.section.description || "No class description has been published."}</p></WorkspacePanel>
      <WorkspacePanel title="Learning progress" description="Student-reported lesson completion is not a grade, mastery score or attendance record.">
        <p className="text-sm">{data.role === "teacher" ? `${lessons.length} published lessons · ${data.roster.length} enrolled students` : `${completed.size} / ${lessons.length} published lessons marked complete`}</p>
        <Link to="/classes" search={{ ...search, tab: "lessons" }} className="mt-3 inline-block text-sm underline">Open lessons</Link>
      </WorkspacePanel>
      <WorkspacePanel title="Teaching team"><ul className="space-y-2 text-sm">{data.teachers.map(teacher => <li key={teacher.personId}><Link to="/profiles" search={{person:teacher.personId}} className="underline">{teacher.name}</Link></li>)}</ul>
        {!data.teachers.length && <p className="text-sm text-muted-foreground">No teaching team is assigned.</p>}
      </WorkspacePanel>
    </div>}
    {tab === "lessons" && <div className="grid gap-5">
      {!data.content && <p role="status" className="rounded-xl border p-5 text-sm">No published learning content is configured for this class.</p>}
      {lessonId && !lesson && <p role="alert" className="rounded-xl border p-4 text-sm">This lesson is unavailable in the published course version.</p>}
      {lesson ? <WorkspacePanel title={lesson.title} actions={<Link to="/classes" search={{ ...search, tab: "lessons" }} className="text-sm underline">All lessons</Link>}>
        <div className="whitespace-pre-wrap text-sm leading-8">{lesson.body || "No lesson text provided."}</div>
        {lesson.resources.length > 0 && <div className="mt-5">{resources(lesson.resources)}</div>}
        {supplements.some(item=>item.lessonId===lesson.id) && <div className="mt-5 space-y-2">
          <h3 className="font-semibold">School and classroom supplements</h3>
          <ul className="space-y-2">{supplements.filter(item=>item.lessonId===lesson.id).map(item=>
            <li key={item.id} className="rounded border p-3 text-sm">{item.url?
              <a href={item.url} rel="noopener noreferrer" target="_blank" className="underline">{item.title} ({item.kind})</a>
              :<span>{item.title} (school document)</span>}</li>)}</ul>
        </div>}
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
    {tab === "files" && <WorkspacePanel title="Class files and resources" description="Links and verified private documents from the published course version.">
      {data.content && resources(classResources(data.content))}
      {supplements.length>0 && <section className="mt-5 space-y-2"><h3 className="font-semibold">School supplements</h3>
        <ul className="space-y-2">{supplements.map(item=><li key={item.id} className="rounded border p-3 text-sm">
          {item.url?<a href={item.url} target="_blank" rel="noopener noreferrer" className="underline">{item.title} ({item.kind})</a>
           :<span>{item.title} (verified school document)</span>}
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

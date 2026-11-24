import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getAssignments } from "@/modules/student-experience/assignments.functions";
import { loadNativeStudentHomework } from "@/modules/classes/native-student-homework-index";
import { NativeStudentHomeworkIndex } from "@/components/student/NativeStudentHomeworkIndex";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { EmptyState, StatCard, WorkspaceNotice, WorkspaceShell, StatusBadge, DetailNavigation, SectionTab } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { StudentAssignmentLink } from "@/components/student/StudentAssignmentLink";
import { useStudentDisplayPreferences } from "@/components/shell/WorkspaceSession";
import { formatTimestamp } from "@/modules/calendar/timezone";
import { assignmentSummaryForSection } from "@/domain/student-assignment-work";

const loadAssignments = async () => {
 const [legacy,native] = await Promise.all([safeLoader(getAssignments)(),safeLoader(loadNativeStudentHomework)()]);
 return {legacy,native};
};
export const Route = createFileRoute("/student/assignments")({
 validateSearch: (search: Record<string, unknown>): { filter?: "all" | "todo" | "missing" | "submitted" | "feedback"; assessment?: string; section?: string } => ({
  filter: search.filter === "all" || search.filter === "todo" || search.filter === "missing" || search.filter === "submitted" || search.filter === "feedback" ? search.filter : undefined,
  assessment: typeof search.assessment === "string" ? search.assessment : undefined,
  section: typeof search.section === "string" ? search.section : undefined,
 }),
 beforeLoad: ({ search }) => {
  // Legacy deep links selected an assignment inline; the detail page owns that now.
  if (search.assessment) throw redirect({
   to: "/student/assignments/$assessmentId",
   params: { assessmentId: search.assessment },
   search: { filter: search.filter, section: search.section },
  });
 },
 loader: safeLoader(loadAssignments, { authMessage: "Sign in with an authorized student account to view your assignments." }),
 component: StudentAssignments,
});

function formatDate(value: string | null, timeZone?: string) {
 return value ? formatTimestamp(value, timeZone ?? "UTC") : "No due date";
}
type AssignmentData = Awaited<ReturnType<typeof loadAssignments>>;
function StudentAssignments() {
 const result = Route.useLoaderData();
 const { filter = "all", section } = Route.useSearch();
 const preferences = useStudentDisplayPreferences();
 if (!result.ok) return <LoaderFailure eyebrow="Student" title="Your assignments" outcome={result} />;
 return <StudentAssignmentsView key={JSON.stringify([filter, section, preferences.showCompletedAssignments])} data={result.data} showCompleted={preferences.showCompletedAssignments} />;
}
function StudentAssignmentsView({ data, showCompleted }: { data: AssignmentData; showCompleted: boolean }) {
 const connected = data.legacy.ok && data.legacy.data.connected;
 const assignments = data.legacy.ok ? data.legacy.data.assignments : [];
 const { filter = "all", section } = Route.useSearch();
 const summary = assignmentSummaryForSection(assignments, section);
 const items = summary.assignments.filter(item =>
  (filter !== "all" || showCompleted || !["submitted", "graded"].includes(item.status ?? "")) && (
  filter === "all" ||
  (filter === "todo" && (!item.status || item.status === "assigned" || item.status === "returned")) ||
  (filter === "missing" && item.timeliness === "missing") ||
  (filter === "submitted" && item.status === "submitted") ||
  (filter === "feedback" && (["graded", "returned"].includes(item.status ?? "") ||
   Boolean(item.revisionFeedbackText)))));
 return <WorkspaceShell width="wide" eyebrow="Student learning" title="Your assignments"
  subtitle="Read instructions, open an assignment to work on it, and follow through on feedback."
  breadcrumbs={<><Link to="/home" className="underline">Student Today</Link><span>/</span><Link to="/class"  className="underline">{section ? "Class" : "My classes"}</Link><span>/</span><span>Assignments</span></>}
  actions={<Button asChild variant="outline" size="sm"><Link to="/calendar-export">Export deadlines (.ics)</Link></Button>}>
  {!section&&data.native.ok&&<NativeStudentHomeworkIndex data={data.native.data}/>}
  {!section&&!data.native.ok&&<WorkspaceNotice tone="attention" className="mt-5">Native Class assignments could not be loaded. Open My Classes to retry.</WorkspaceNotice>}
  {!section&&data.native.ok&&data.native.data.classes.length>0&&<h2 className="mt-8 font-serif text-xl">School Section assignments</h2>}
  {!connected && <WorkspaceNotice tone="attention" className="mt-5">School Section assignment records are currently unavailable. This does not mean your assignments have been cleared.</WorkspaceNotice>}
  {connected&&<>
  <div className="mt-6 grid gap-3 sm:grid-cols-3">
   <StatCard label="Assignments" value={summary.total}/>
   <StatCard label="Awaiting feedback" value={summary.awaitingFeedback}/>
   <StatCard label="Graded" value={summary.graded}/>
  </div>
  <DetailNavigation label="Assignment filters">
   {([["all", "All"], ["todo", "To do / revise"], ["missing", "Missing work"], ["submitted", "Submitted"], ["feedback", "Feedback"]] as const)
    .map(([key, label]) => <SectionTab key={key} current={filter===key}
     link={{to:"/student/assignments",search:{filter:key,section}}}>{label}</SectionTab>)}
  </DetailNavigation>
  {!showCompleted && filter === "all" && <p role="status" className="mt-4 text-sm text-muted-foreground">Completed assignments are hidden by your display preference. Use Submitted or Feedback to review them; direct assignment links remain available.</p>}
  <section aria-label="Assignments" className="mt-5 grid items-start gap-4 lg:grid-cols-2">
   {!items.length && <EmptyState kind="matches" title="No assignments in this view."/>}
   {items.map(item => <StudentAssignmentLink key={item.assessmentId} assessmentId={item.assessmentId}
    sectionId={section} filter={filter==="all"?undefined:filter}
    className="block w-full border border-border bg-card p-5 text-left hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
    <div className="flex items-start justify-between gap-3">
     <p className="text-xs text-muted-foreground">{item.course}</p>
     <StatusBadge tone={item.timeliness === "missing" ? "attention" : item.status === "graded" ? "success" : item.status === "submitted" ? "info" : "neutral"}>{item.status ?? "not started"}</StatusBadge>
    </div>
    <h2 className="mt-2 font-semibold">{item.title}</h2>
    {item.metadata.content?.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.metadata.content.description}</p>}
    <p className="mt-2 text-xs text-muted-foreground">{item.dueAt ? "Due " + formatDate(item.dueAt, item.timezone) : "No due date"}</p>
    {item.score !== null && item.score !== undefined && <p className="mt-2 text-sm">Score: {item.score} / {item.pointsPossible ?? 100}</p>}
    <p className="mt-3 text-sm font-semibold text-primary">Open assignment →</p>
   </StudentAssignmentLink>)}
  </section>
  </>}
 </WorkspaceShell>;
}

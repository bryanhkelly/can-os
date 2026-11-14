import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getAssignments } from "@/modules/student-experience/assignments.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell, StatusBadge } from "@/components/workspace";
import { useStudentDisplayPreferences } from "@/components/shell/WorkspaceSession";
import { formatTimestamp } from "@/modules/calendar/timezone";

const loadAssignments = () => getAssignments();
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
 const { connected, assignments } = data;
 const { filter = "all", section } = Route.useSearch();
 const items = assignments.filter(item => (!section || item.sectionId === section) &&
  (filter !== "all" || showCompleted || !["submitted", "graded"].includes(item.status ?? "")) && (
  filter === "all" ||
  (filter === "todo" && (!item.status || item.status === "assigned" || item.status === "returned")) ||
  (filter === "missing" && item.timeliness === "missing") ||
  (filter === "submitted" && item.status === "submitted") ||
  (filter === "feedback" && (["graded", "returned"].includes(item.status ?? "") ||
   Boolean(item.revisionFeedbackText)))));
 return <WorkspaceShell width="wide" eyebrow="Student learning" title="Your assignments"
  subtitle="Read instructions, open an assignment to work on it, and follow through on feedback."
  breadcrumbs={<><Link to="/home" className="underline">Student Today</Link><span>/</span><Link to="/classes" search={section ? { section } : {}} className="underline">{section ? "Class" : "My classes"}</Link><span>/</span><span>Assignments</span></>}
  actions={<Link to="/calendar-export" className="rounded-lg border bg-card px-4 py-2 text-sm font-semibold">Export deadlines (.ics)</Link>}>
  {!connected && <p role="status" className="mt-5 rounded-xl border p-4 text-sm">School records are currently unavailable.</p>}
  <div className="mt-6 grid gap-3 sm:grid-cols-3">
   <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Assignments</p><p className="mt-1 text-3xl font-semibold">{assignments.length}</p></div>
   <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Awaiting feedback</p><p className="mt-1 text-3xl font-semibold">{assignments.filter(item => item.status === "submitted").length}</p></div>
   <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Graded</p><p className="mt-1 text-3xl font-semibold">{assignments.filter(item => item.status === "graded").length}</p></div>
  </div>
  <nav aria-label="Assignment filters" className="mt-7 flex flex-wrap gap-2">
   {([["all", "All"], ["todo", "To do / revise"], ["missing", "Missing work"], ["submitted", "Submitted"], ["feedback", "Feedback"]] as const)
    .map(([key, label]) => <Link key={key} to="/student/assignments" search={{ filter: key, section }} aria-current={filter === key ? "page" : undefined}
     className={"rounded-full border px-4 py-2 text-xs font-semibold " + (filter === key ? "bg-foreground text-background" : "bg-card")}>{label}</Link>)}
  </nav>
  {!showCompleted && filter === "all" && <p role="status" className="mt-4 text-sm text-muted-foreground">Completed assignments are hidden by your display preference. Use Submitted or Feedback to review them; direct assignment links remain available.</p>}
  <section aria-label="Assignments" className="mt-5 grid items-start gap-4 lg:grid-cols-2">
   {!items.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">No assignments in this view.</p>}
   {items.map(item => <Link key={item.assessmentId} to="/student/assignments/$assessmentId"
    params={{ assessmentId: item.assessmentId }} search={{ filter, section }}
    className="block w-full rounded-xl border bg-card p-5 text-left">
    <div className="flex items-start justify-between gap-3">
     <p className="text-xs text-muted-foreground">{item.course}</p>
     <StatusBadge tone={item.timeliness === "missing" ? "attention" : item.status === "graded" ? "success" : item.status === "submitted" ? "info" : "neutral"}>{item.status ?? "not started"}</StatusBadge>
    </div>
    <h2 className="mt-2 font-semibold">{item.title}</h2>
    {item.metadata.content?.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.metadata.content.description}</p>}
    <p className="mt-2 text-xs text-muted-foreground">{item.dueAt ? "Due " + formatDate(item.dueAt, item.timezone) : "No due date"}</p>
    {item.score !== null && item.score !== undefined && <p className="mt-2 text-sm">Score: {item.score} / {item.pointsPossible ?? 100}</p>}
    <p className="mt-3 text-sm font-semibold text-primary">Open assignment →</p>
   </Link>)}
  </section>
 </WorkspaceShell>;
}

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { DashboardPanel } from "@/components/workspace/dashboard-layout";
import { StatusBadge } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { StudentAssignmentLink } from "./StudentAssignmentLink";
import { deriveStudentSuccessPriorities } from "@/domain/student-success";
import { formatCalendarDateTime } from "@/components/calendar/calendar-presentation";
import type { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import type { DashboardAssignment } from "./student-dashboard-data";

type Section = Awaited<ReturnType<typeof getMyStudentToday>>["sections"][number];
const assignmentState = (item: DashboardAssignment) => item.status === "returned" ? "Revision requested"
  : item.status === "submitted" ? "Submitted" : item.status === "graded" ? "Feedback available"
  : item.timeliness === "missing" ? "Missing" : item.timeliness === "late" ? "Late"
  : item.hasDraft ? "Draft" : "Not started";

export function StudentUpcomingAssignments({
  assignments, error, at, timezone, sections,
}: {
  assignments: readonly DashboardAssignment[];
  error: string | null;
  at: Date;
  timezone: string;
  sections: readonly Section[];
}) {
  const [filter, setFilter] = useState<"all" | "due" | "progress">("all");
  const dueIds = new Set(assignments.filter(item => {
    const priority = deriveStudentSuccessPriorities([item], at);
    return priority.dueSoon > 0 || priority.overdue > 0;
  }).map(item => item.assessmentId));
  const visible = assignments.filter(item => filter === "all" ||
    (filter === "due" ? dueIds.has(item.assessmentId) : item.hasDraft && (item.status === "assigned" || item.status === null)));
  const textLink = "student-dashboard-link";
  return <DashboardPanel id="student-assignments" title="Upcoming Assignments"
          action={<Link to="/student/assignments" className={textLink}>View all →</Link>}>
          <div className="student-assignment-filters" role="group" aria-label="Filter dashboard assignments">
            {(["all","due","progress"] as const).map(value => <Button key={value} type="button" size="sm" variant={filter === value ? "secondary" : "outline"} aria-pressed={filter === value}
              onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "due" ? "Due soon" : "In progress"}</Button>)}
          </div>
          {error ? <p role="alert" className="p-3 text-xs">{error} <Link to="/student/assignments" className="underline">Open assignments to retry.</Link></p>
            : <div>{visible.slice(0,5).map(item => <StudentAssignmentLink key={item.assessmentId} assessmentId={item.assessmentId}
              sectionId={item.sectionId} className="student-assignment-row">
              <FileText aria-hidden="true" className="size-4 text-muted-foreground" />
              <span className="min-w-0"><b className="block text-xs font-semibold">{item.title}</b><small className="text-muted-foreground">{item.course}</small></span>
              <span className="text-3xs text-muted-foreground">{item.dueAt ? `Due ${formatCalendarDateTime(item.dueAt,sections.find(section => section.sectionId === item.sectionId)?.timezone ?? timezone)}` : "No due date"}</span>
              <StatusBadge tone={item.timeliness === "missing" || item.status === "returned" || item.timeliness === "late" ? "attention" : "neutral"}>{assignmentState(item)}</StatusBadge>
              <strong className="text-xs text-primary">{item.canEdit ? "Continue →" : "View →"}</strong>
            </StudentAssignmentLink>)}
            {!visible.length && <p role="status" className="p-3 text-xs text-muted-foreground">{assignments.length
              ? "No assignments match this filter." : "No published coursework in your current classes."}</p>}
            {visible.length > 5 && <p className="p-3 text-xs text-muted-foreground">Showing 5 of {visible.length}. Open all assignments for the complete list.</p>}
          </div>}
        </DashboardPanel>;
}

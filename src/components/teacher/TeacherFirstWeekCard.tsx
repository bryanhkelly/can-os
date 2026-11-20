import { WorkspaceLinkNavigation } from "@/components/workspace/workspace-link-navigation";
import { Link } from "@tanstack/react-router";
import type { FirstClassroom } from "@/domain/first-classroom";
import { DashboardPanel } from "@/components/workspace/dashboard-layout";
import { StatusBadge } from "@/components/workspace";

/** Uses the authoritative first-week projection and the teacher's exact Section links. */
export function TeacherFirstWeekCard({ id, title, studentCount, classroom }: {
  id: string;
  title: string;
  studentCount: number | null;
  classroom: FirstClassroom | null;
}) {
  const readiness = classroom === null ? "readiness unavailable"
    : classroom.ready ? "ready to teach" : "needs attention";
  return <DashboardPanel title={title}
    description={studentCount === null ? "Student roster temporarily unavailable"
      : `${studentCount} enrolled ${studentCount === 1 ? "student" : "students"}`}
    action={<Link to="/classes" search={{ section: id }} className="font-semibold underline underline-offset-4">
      Open class
    </Link>}>
    <div className="space-y-3">
      <StatusBadge tone={classroom === null ? "neutral" : classroom.ready ? "success" : "attention"}>
        First week: {readiness}
      </StatusBadge>
      {classroom === null
        ? <p role="status" className="text-sm text-muted-foreground">
            Classroom setup could not be verified. Open the class to review its current status.
          </p>
        : classroom.ready
          ? <p className="text-sm">Teach “{classroom.firstWeek.lesson!.title}” and review
              “{classroom.firstWeek.assessment!.title}”.</p>
          : <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {classroom.blockers.map(item => <li key={item.key}>{item.message}</li>)}
            </ul>}
      <WorkspaceLinkNavigation label={`Teaching actions for ${title}`}
        surface="plain" className="gap-x-4 gap-y-2 border-t border-border pt-3">
        {classroom?.firstWeek.lesson && <Link to="/classes"
          search={{ section: id, tab: "lessons", lesson: classroom.firstWeek.lesson.id }}
          className="font-medium underline underline-offset-4">Open first lesson</Link>}
        {classroom?.firstWeek.assessment
          ? <Link to="/teacher/gradebook" search={{ section: id, assessment: classroom.firstWeek.assessment.id }}
              className="font-medium underline underline-offset-4">Open first assessment</Link>
          : classroom?.firstWeek.lesson && <Link to="/teacher/gradebook"
              search={{ section: id, lesson: classroom.firstWeek.lesson.id, kind: "classwork" }}
              className="font-medium underline underline-offset-4">Create first assessment</Link>}
        <Link to="/teacher/gradebook" search={{ section: id }}
          className="font-medium underline underline-offset-4">Gradebook</Link>
        <Link to="/classes" search={{ section: id, tab: "people" }}
          className="font-medium underline underline-offset-4">Review roster</Link>
      </WorkspaceLinkNavigation>
    </div>
  </DashboardPanel>;
}

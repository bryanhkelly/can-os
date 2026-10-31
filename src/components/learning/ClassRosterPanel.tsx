import { Link } from "@tanstack/react-router";
import { WorkspacePanel } from "@/components/workspace";

export interface ClassRosterStudent {
  profileId: string;
  personId: string;
  name: string;
  completedLessons: number;
}

export function ClassRosterPanel({
  students, lessonCount, sectionId,
}: {
  students: readonly ClassRosterStudent[];
  lessonCount: number;
  sectionId: string;
}) {
  return <WorkspacePanel title="Class roster"
    description="Only current section enrollments appear. Completion is student-reported, not mastery.">
    <ul className="divide-y">
      {students.map(student => <li key={student.profileId} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <Link to="/staff/students/$personId" params={{personId:student.personId}}
          className="text-sm font-semibold underline">{student.name}</Link>
        <span className="text-sm text-muted-foreground">
          {student.completedLessons} / {lessonCount} lessons marked complete
        </span>
        <Link to="/teacher/gradebook" search={{section:sectionId,student:student.profileId}}
          className="text-sm underline">Review classwork</Link>
      </li>)}
    </ul>
    {!students.length && <p className="text-sm">No students are enrolled in this class.</p>}
  </WorkspacePanel>;
}

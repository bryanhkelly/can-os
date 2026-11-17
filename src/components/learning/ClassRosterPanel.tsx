import { Link } from "@tanstack/react-router";
import { WorkspacePanel, RosterList } from "@/components/workspace";

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
    <RosterList rows={students} rowKey={student => student.profileId}
      primary={student => <Link to="/staff/students/$personId" params={{personId:student.personId}}
        className="text-sm font-semibold underline">{student.name}</Link>}
      detail={student => `${student.completedLessons} / ${lessonCount} lessons marked complete`}
      actions={student => <Link to="/teacher/gradebook" search={{section:sectionId,student:student.profileId}}
        className="text-sm underline">Review classwork</Link>}
      emptyMessage="No students are enrolled in this class."/>
  </WorkspacePanel>;
}

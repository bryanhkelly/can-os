import { Link } from "@tanstack/react-router";
import { WorkspacePanel, DirectoryTable } from "@/components/workspace";

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
    <DirectoryTable label="Class roster" caption="Current authorized section enrollments."
      rows={students} rowKey={student=>student.profileId}
      empty={<p className="p-4 text-sm text-muted-foreground">No students are currently enrolled in this section.</p>}
      columns={[
        {id:"student",title:"Student",render:student=><Link to="/staff/students/$personId"
          params={{personId:student.personId}} className="text-sm font-semibold underline">{student.name}</Link>},
        {id:"progress",title:"Self-reported lesson progress",
          render:student=>`${student.completedLessons} / ${lessonCount} lessons marked complete`},
        {id:"classwork",title:"Classwork",render:student=><Link to="/teacher/gradebook"
          search={{section:sectionId,student:student.profileId}} className="text-sm underline">Review classwork</Link>},
      ]}/>
  </WorkspacePanel>;
}

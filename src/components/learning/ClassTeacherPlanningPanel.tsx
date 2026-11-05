import { Link } from "@tanstack/react-router";
import { WorkspacePanel } from "@/components/workspace";
import { isLearnerFacingInstruction } from "@/domain/first-class-lesson";
import type { ClassContent } from "@/domain/class-content";
import type { getClassWorkspace } from "@/modules/learning/class-workspace.functions";

type Workspace = Awaited<ReturnType<typeof getClassWorkspace>>;
type Lesson = ClassContent["modules"][number]["lessons"][number];

export function ClassTeacherPlanningPanel({ data, lessons, search }: {
  data: Workspace;
  lessons: readonly Lesson[];
  search: { section: string; student?: string };
}) {
  return data.role === "teacher" ? <div className="space-y-5" aria-label="Teacher course implementation plan">
    <WorkspacePanel title="Teacher course implementation plan"
      description="Plan classroom work from the publisher's pinned course sequence. Class assignments and supplements are separate teacher-owned records; completion is self-reported, not mastery or credit.">
      <p className="text-sm">{lessons.length} published lessons · {data.roster.length} enrolled learners · {data.assessmentEvidence?.length ?? 0} released assessments</p>
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
        const assigned=(data.assessmentEvidence ?? []).filter(work=>work.curriculumLessonId===item.id);
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
  </div> : <p role="alert" className="rounded border p-4 text-sm">Teacher planning is available only to the assigned teaching team.</p>;
}
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState, RecordFacts, StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { isLearnerFacingInstruction } from "@/domain/first-class-lesson";
import type { ClassContent } from "@/domain/class-content";
import type { getClassWorkspace } from "@/modules/learning/class-workspace.functions";

type Workspace = Awaited<ReturnType<typeof getClassWorkspace>>;
type Lesson = ClassContent["modules"][number]["lessons"][number];

/** Teacher planning never modifies the publisher's pinned curriculum. */
export function ClassTeacherPlanningPanel({ data, lessons, search }: {
  data: Workspace;
  lessons: readonly Lesson[];
  search: { section: string; student?: string };
}) {
  if (data.role !== "teacher") {
    return <WorkspaceNotice tone="danger">
      Teacher planning is available only to the assigned teaching team.
    </WorkspaceNotice>;
  }

  return <div className="space-y-5" aria-label="Teacher course implementation plan">
    <WorkspacePanel title="Teacher course implementation plan"
      description="Plan classroom work from the publisher's pinned course sequence. Assignments and supplements are teacher-owned; lesson completion is self-reported, not mastery or credit.">
      <RecordFacts label="Class planning overview" columns={3} variant="tiles" items={[
        { label: "Published lessons", value: lessons.length },
        { label: "Enrolled learners", value: data.roster.length },
        { label: "Released assessments", value: data.assessmentEvidence?.length ?? 0 },
      ]}/>
      {data.content?.blueprint && <p className="mt-4 text-sm text-muted-foreground">
        Publisher's proposed {data.content.blueprint.targetInstructionalWeeks}-week sequence:
        {" "}{data.content.blueprint.weeks.filter(week => week.status !== "planned").length}
        {" "}weeks with authored planning status. Planned weeks without published lessons are not assigned automatically.
      </p>}
    </WorkspacePanel>
    {data.content?.modules.map(module => <WorkspacePanel key={module.id} title={module.title}>
      {data.content?.blueprint && <p className="mb-3 text-sm text-muted-foreground">
        {data.content.blueprint.weeks.filter(week => week.unitId === module.id)
          .map(week => `Week ${week.week}: ${week.title} (${week.status})`).join(" · ") ||
          "No matching weeks in publisher roadmap"}
      </p>}
      {module.lessons.length > 0
        ? <ol className="divide-y divide-border">{module.lessons.map(item => {
            const assigned = (data.assessmentEvidence ?? []).filter(work => work.curriculumLessonId === item.id);
            const marked = data.lessonCompletionCounts.find(count => count.lessonId === item.id)?.studentCount ?? 0;
            const ready = isLearnerFacingInstruction(item);
            return <li key={item.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <p className="font-semibold">{item.title}</p>
                  <StatusBadge tone={ready ? "success" : "attention"}>
                    {ready ? "Published instruction" : "Outline only"}
                  </StatusBadge>
                  <p className="text-sm text-muted-foreground">
                    {assigned.length} linked released assignments · {marked}/{data.roster.length} learners self-reported complete
                  </p>
                </div>
                {ready
                  ? <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link to="/classes" search={{ ...search, tab: "lessons", lesson: item.id }}>
                          View lesson
                        </Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link to="/teacher/gradebook"
                          search={{ section: data.section.id, lesson: item.id, kind: "classwork" }}>
                          Create classwork
                        </Link>
                      </Button>
                    </div>
                  : <p className="text-sm text-muted-foreground">Publisher instruction is not available yet.</p>}
              </div>
              {assigned.length > 0 && <nav aria-label={`Released assessments for ${item.title}`}
                className="flex flex-wrap gap-2">
                {assigned.map(work => <Button asChild key={work.id} variant="outline" size="sm">
                  <Link to="/teacher/gradebook"
                    search={{ section: data.section.id, assessment: work.id }}>{work.title}</Link>
                </Button>)}
              </nav>}
            </li>;
          })}</ol>
        : <EmptyState title="No published lessons in this unit."
            description="Published instructional content will appear here when the publisher releases it."/>}
    </WorkspacePanel>)}
    {data.content && data.content.modules.length === 0 && <EmptyState
      title="No published units yet."
      description="The publisher has not released a course sequence for this class. Teacher assignments remain separate from publisher curriculum."/>}
    {!data.content && <WorkspaceNotice tone="attention">
      No published curriculum is available to plan this class.
    </WorkspaceNotice>}
  </div>;
}

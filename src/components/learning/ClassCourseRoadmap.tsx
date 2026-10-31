import type { ClassContent } from "@/domain/class-content";
import { WorkspacePanel } from "@/components/workspace";

type Blueprint = NonNullable<ClassContent["blueprint"]>;

export function ClassCourseRoadmap({ blueprint }: { blueprint: Blueprint }) {
  return <WorkspacePanel title="Yearlong course roadmap"
    description="Curriculum planning progress, not a list of completed lessons or a credit-award decision. Planned weeks are not yet available for instruction.">
    <p className="text-sm">
      {blueprint.weeks.filter(week => week.status !== "planned").length} of {blueprint.targetInstructionalWeeks} weeks authored
      {" · School review: "}{blueprint.reviewStatus.replaceAll("_", " ")}
    </p>
    {blueprint.creditStatus !== "credit_ready" &&
      <p className="mt-2 text-sm text-muted-foreground">
        This course remains in curriculum development and is not certified as credit-ready.
      </p>}
    <details className="mt-3">
      <summary className="cursor-pointer text-sm underline">Explore the proposed weekly sequence</summary>
      <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
        {blueprint.weeks.map(week => <li key={week.week} className="flex flex-wrap justify-between gap-2 border-b py-2">
          <span>Week {week.week}: {week.title}</span>
          <span className="text-muted-foreground">
            {week.status === "planned" ? "Planning only" : week.status === "authored" ? "Authored; teacher review pending" : week.status}
          </span>
        </li>)}
      </ol>
    </details>
  </WorkspacePanel>;
}

import { Link } from "@tanstack/react-router";
import type { getClassWorkspace } from "@/modules/learning/class-workspace.functions";

type Workspace = Awaited<ReturnType<typeof getClassWorkspace>>;
type Assessment = NonNullable<Workspace["assessmentEvidence"]>[number];

/** Read-only work links. Grade and submission decisions remain in the
 * authenticated assessment/gradebook commands, never in this component.
 */
export function ClassLessonAssessmentLinks({
  items, role, sectionId,
}: {
  items: readonly Assessment[];
  role: Workspace["role"];
  sectionId: string;
}) {
  if (!items.length) return null;
  const title = items.some(item => item.unitId && !item.curriculumLessonId)
    ? "Assignments for this lesson or unit" : "Assignments for this lesson";
  return <section className="mt-6 space-y-3  border p-4" aria-label={title}>
          <h3 className="text-sm font-semibold">{title}</h3>
          <ul className="divide-y">{items.map(work => <li key={work.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium text-sm">{work.title}</p>
              {role !== "teacher" && <p className="text-xs text-muted-foreground">
                {work.status === "graded" && work.score !== null ? `Graded: ${work.score} / ${work.pointsPossible ?? "—"}` :
                work.status === "submitted" ? "Submitted · awaiting teacher feedback" :
                work.status === "returned" ? "Returned for revision" :
                work.status === "draft" ? "Response in progress" : "Not submitted"}
              </p>}
            </div>
            {role === "teacher" ?
              <Link to="/teacher/gradebook" search={{section:sectionId,assessment:work.id}} className="text-sm underline">Review in gradebook</Link> :
              role === "student" ?
              <Link to="/student/assignments" search={{section:sectionId,assessment:work.id}} className="text-sm underline">Open assignment</Link> : null}
          </li>)}</ul>
        </section>;
}

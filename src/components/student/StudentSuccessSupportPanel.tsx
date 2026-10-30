import { Link } from "@tanstack/react-router";
import { WorkspacePanel } from "@/components/workspace";
import type { StudentSuccessSupportSummary } from "@/domain/student-success-support";

/**
 * Only explicitly student-owned Action records from the existing student
 * Action endpoint appear here. Internal teacher interventions, counselor
 * case details and safeguarding incidents are not sources for this panel.
 */
export function StudentSuccessSupportPanel({
  support,
}: { support: StudentSuccessSupportSummary | null }) {
  return <WorkspacePanel title="Your learning support"
    description="Your own academic support and recovery actions, separate from confidential staff case records."
    className="mt-7">
    {support === null ? <>
      <p className="text-sm text-muted-foreground">
        Your support actions are temporarily unavailable. This does not mean there are none.
      </p>
      <Link to="/student/support" className="mt-3 inline-block text-sm underline">Open your support workspace →</Link>
    </> : <>
      {!support.tasks.length && <p className="text-sm text-muted-foreground">
        No outstanding student-owned support actions. You can still ask your school for help.
      </p>}
      <ul className="grid gap-3">
        {support.tasks.map(task => <li key={task.id} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            {task.status === "resolved" ? "Teacher confirmed goal met" : task.status.replaceAll("_", " ")}
            {task.dueAt ? ` · Due ${new Date(task.dueAt).toLocaleDateString()}` : ""}
          </p>
          <p className="mt-1 font-semibold">
            {task.destination === "assignment"
              ? <Link to="/student/assignments" search={{ assessment: task.destinationId }}
                  className="underline">{task.title}</Link>
              : <Link to="/student/experiences" search={{ action: task.destinationId }}
                  className="underline">{task.title}</Link>}
          </p>
          {task.goalOutcome && <p className="mt-2 text-sm font-medium">
            {task.goalOutcome === "met" ? "Goal met after teacher review" : "Teacher recommends more practice"}
          </p>}
          {task.studentFeedback && <p className="mt-1 text-sm">
            Teacher feedback: {task.studentFeedback}
          </p>}
        </li>)}
      </ul>
      {support.truncated && <p className="mt-3 text-xs text-muted-foreground">
        Showing {support.tasks.length} of {support.total} outstanding actions.
      </p>}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link to="/student/experiences" className="font-semibold underline">See all your actions →</Link>
        <Link to="/student/support" className="underline">Ask for help</Link>
      </div>
    </>}
    <p className="mt-3 text-xs text-muted-foreground">
      Teachers and counselors manage private intervention records separately. They are not displayed here unless an appropriate student-facing action is explicitly created.
    </p>
  </WorkspacePanel>;
}

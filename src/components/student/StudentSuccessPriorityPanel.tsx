import { Link } from "@tanstack/react-router";
import type { StudentSuccessPriorities } from "@/domain/student-success";
import { WorkspacePanel } from "@/components/workspace";

/**
 * Student-owned, assignment-derived next steps only. No counselor cases,
 * safety records, staff-only interventions or inferred learning diagnoses.
 */
export function StudentSuccessPriorityPanel({ plan }: {
  plan: StudentSuccessPriorities | null;
}) {
  if (!plan) return <WorkspacePanel title="Your next learning steps"
    description="Your current assignments could not be loaded. Your other school-day information remains available."
    className="mt-7">
    <Link to="/student/assignments" className="text-sm font-semibold underline">Open assignments to try again →</Link>
  </WorkspacePanel>;

  const fmtDate = (date: string | null) => {
    if (!date) return "No due date";
    const parsed = new Date(date);
    return Number.isFinite(parsed.getTime())
      ? `Due ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed)}`
      : "Due date unavailable";
  };

  return <WorkspacePanel title="Your next learning steps"
    description="Across your enrolled classes · based on published assignments and the latest saved submission status."
    className="mt-7">
    <div className="flex flex-wrap gap-2 text-xs" aria-label="Assignment status summary">
      <span className="rounded-full border px-3 py-1">Revisions: {plan.revise}</span>
      <span className="rounded-full border px-3 py-1">Overdue: {plan.overdue}</span>
      <span className="rounded-full border px-3 py-1">Due soon: {plan.dueSoon}</span>
      <span className="rounded-full border px-3 py-1">Awaiting feedback: {plan.awaitingFeedback}</span>
    </div>
    {plan.steps.length ? <ol className="mt-4 grid gap-3">
      {plan.steps.map(step => <li key={step.assessmentId} className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground">{step.course} · {step.label}</p>
        <p className="mt-1 font-semibold">
          <Link to="/student/assignments" search={{
            assessment: step.assessmentId,
            section: step.sectionId ?? undefined,
          }} className="underline">{step.title}</Link>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{fmtDate(step.dueAt)}</p>
        <Link to="/student/assignments" search={{
          assessment: step.assessmentId,
          section: step.sectionId ?? undefined,
        }} className="mt-2 inline-block text-sm underline">
          {step.kind === "revision" ? "Revise assignment" :
            step.kind === "review_feedback" ? "Review teacher feedback" :
            step.kind === "awaiting_feedback" ? "View submission" :
            "Open assignment"} →
        </Link>
      </li>)}
    </ol> : <p className="mt-4 text-sm text-muted-foreground">
      No published assignments currently need follow-up. Check your class schedule and lessons for other work.
    </p>}
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
      <Link to="/student/assignments" className="font-semibold underline">
        {plan.truncated ? "See all assignments" : "Open assignment workspace"} →
      </Link>
      <Link to="/student/support" className="underline">Ask for learning help</Link>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">{plan.notice}</p>
  </WorkspacePanel>;
}

import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { StatusBadge } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { StudentAssignmentLink } from "./StudentAssignmentLink";
import { Link, useRouter } from "@tanstack/react-router";
import { finishQuickWinAction } from "@/modules/actions/student-actions.functions";
import { canCompleteStudentAction } from "@/modules/actions/student-action-policy";

type Action = {
  id: string; title: string; description: string | null;
  status: "open" | "in_progress" | "waiting" | "resolved" | "cancelled";
  priority: string; dueAt: Date | string | null;
  metadata: Record<string, unknown>; type: string;
  subjectType?: string; subjectId?: string;
  canComplete?: boolean;
};
export function LiveQuickWins({ actions, connected, actionId }: { actions: Action[]; connected: boolean; actionId?: string }) {
  const router = useRouter();
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const outstanding = actions.filter(action => ["open", "in_progress", "waiting"].includes(action.status));
  const visible = actionId ? actions.filter(action => action.id === actionId) : actions;

  async function finish(actionId: string) {
    await mutation.run(() => finishQuickWinAction({ data: { actionId } }), {
      successMessage: "Action saved as complete.", commandErrorMessage: "Could not save action.",
    });
  }

  return <section className="mt-8 border border-border bg-card p-5 sm:p-7">
    <Link to="/home" className="text-xs font-semibold underline">Back to Student Today</Link>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your actions</p><h2 className="mt-2 font-serif text-3xl">Your saved actions</h2><p className="mt-2 text-sm text-muted-foreground">Your assigned actions and support requests.</p></div>
      <StatusBadge tone={connected ? "success" : "attention"}>{connected ? "School actions available" : "School actions unavailable"}</StatusBadge>
    </div>
    <MutationFeedback state={mutation} className="mt-4" pendingMessage="Saving action..."/>
    <div className="mt-5 space-y-3">
      {visible.map(action => {
        const assessmentId = action.subjectType === "assessment" ? action.subjectId : undefined;
        return <div key={action.id} className="flex flex-wrap items-center gap-3  border border-border bg-background p-4">
        <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{String(action.metadata.source ?? action.type)} · {action.priority} priority</p><p className="mt-1 text-sm font-semibold">{assessmentId
          ? <StudentAssignmentLink assessmentId={assessmentId} className="hover:underline">{action.title}</StudentAssignmentLink>
          : <Link to="/student/experiences" search={{action:action.id}} className="hover:underline">{action.title}</Link>}</p><p className="mt-1 text-xs text-muted-foreground">{action.description}</p></div>
        {(assessmentId || !actionId) && (assessmentId
          ? <StudentAssignmentLink assessmentId={assessmentId} className="text-xs font-semibold underline">Review assignment</StudentAssignmentLink>
          : <Link to="/student/experiences" search={{action:action.id}} className="text-xs font-semibold underline">Review action</Link>)}
        <StatusBadge tone={action.status==="resolved"?"success":"neutral"}>
          {action.status==="resolved"?"Completed":action.status.replaceAll("_"," ")}
        </StatusBadge>
        {canCompleteStudentAction(action) && action.canComplete !== false &&
          <Button type="button" size="sm" disabled={busy||!connected} onClick={()=>void finish(action.id)}>Mark complete</Button>}
        {action.status==="open"&&(!canCompleteStudentAction(action)||action.canComplete===false)&&
          <p className="text-xs text-muted-foreground">
            {action.type==="student_learning_goal"
              ? "Review this goal with your teacher; your teacher will confirm the outcome."
              : "Managed in its owning workflow."}
          </p>}
      </div>;})}
      {actionId && !visible.length ? <p role="alert" className="text-sm text-muted-foreground">This action is unavailable in your current student workspace.</p> :
        !actions.length && <p className="text-sm text-muted-foreground">You have no saved actions.</p>}
    </div>
    {actionId ? <Link to="/student/experiences" className="mt-4 inline-block text-xs underline">View all saved actions</Link> :
      <p className="mt-4 text-xs text-muted-foreground">{outstanding.length} saved action{outstanding.length===1?"":"s"} need attention</p>}
    <div className="mt-7 border-t border-border pt-5">
      <h3 className="font-semibold">Ask for help</h3>
      <Link to="/student/support" className="mt-2 inline-block text-sm underline">Open student support →</Link>
    </div>
  </section>;
}

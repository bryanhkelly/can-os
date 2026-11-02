import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  finishQuickWinAction, requestQuickWinHelp,
} from "@/modules/actions/student-actions.functions";
import { canCompleteStudentAction } from "@/modules/actions/student-action-policy";

type Action = {
  id: string; title: string; description: string | null;
  status: "open" | "in_progress" | "waiting" | "resolved" | "cancelled";
  priority: string; dueAt: Date | string | null;
  metadata: Record<string, unknown>; type: string;
  subjectType?: string; subjectId?: string;
};
export function LiveQuickWins({ actions, connected, actionId }: { actions: Action[]; connected: boolean; actionId?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const outstanding = actions.filter(action => ["open", "in_progress", "waiting"].includes(action.status));
  const visible = actionId ? actions.filter(action => action.id === actionId) : actions;

  async function finish(actionId: string) {
    setBusy(true); setError(""); setSaved("");
    try {
      await finishQuickWinAction({ data: { actionId } });
      setSaved("Action saved as complete .");
      await router.invalidate();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save"); }
    finally { setBusy(false); }
  }

  async function requestHelp() {
    setBusy(true); setError(""); setSaved("");
    try {
      await requestQuickWinHelp({ data: { message } });
      setMessage("");
      setSaved("Help request saved .");
      await router.invalidate();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save"); }
    finally { setBusy(false); }
  }

  return <section className="mt-8 rounded-2xl border-2 border-foreground/15 bg-card p-5 sm:p-7">
    <Link to="/student" className="text-xs font-semibold underline">Back to Student Today</Link>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your actions</p><h2 className="mt-2 font-serif text-3xl">Your saved actions</h2><p className="mt-2 text-sm text-muted-foreground">Your assigned actions and support requests.</p></div>
      <span className="rounded-full bg-stone-warm px-3 py-2 text-xs font-semibold">{connected ? "Neon connected" : "Neon unavailable"}</span>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-300 px-3 py-2 text-sm">{error}</p>}
    {saved && <p role="status" className="mt-4 rounded-lg border border-emerald-300 px-3 py-2 text-sm">{saved}</p>}
    <div className="mt-5 space-y-3">
      {visible.map(action => {
        const target = action.subjectType === "assessment" && action.subjectId
          ? { to: "/student/assignments" as const, search: { assessment: action.subjectId } }
          : { to: "/student/experiences" as const, search: { action: action.id } };
        return <div key={action.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-4">
        <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{String(action.metadata.source ?? action.type)} · {action.priority} priority</p><p className="mt-1 text-sm font-semibold"><Link {...target} className="hover:underline">{action.title}</Link></p><p className="mt-1 text-xs text-muted-foreground">{action.description}</p></div>
        {(target.to === "/student/assignments" || !actionId) &&
          <Link {...target} className="text-xs font-semibold underline">{target.to === "/student/assignments" ? "Review assignment" : "Review action"}</Link>}
        <span className={"text-xs font-semibold capitalize"+(action.status==="resolved"?" text-emerald-800":" text-muted-foreground")}>
          {action.status==="resolved"?"Completed":action.status.replaceAll("_"," ")}
        </span>
        {canCompleteStudentAction(action) &&
          <button disabled={busy||!connected} onClick={()=>finish(action.id)} className="rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-50">Mark complete</button>}
        {action.status==="open"&&!canCompleteStudentAction(action)&&
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
      <h3 className="font-semibold">Ask for help · saved request</h3>
      <p className="mt-2 text-xs text-muted-foreground">Create a support request linked to your account.</p>
      <textarea rows={3} maxLength={1000} value={message} onChange={event=>setMessage(event.target.value)} placeholder="I need help with…" className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm"/>
      <button disabled={busy || !connected || message.trim().length<3} onClick={requestHelp} className="mt-2 rounded-lg bg-foreground px-5 py-3 text-xs font-semibold text-background disabled:opacity-40">Save help request</button>
    </div>
  </section>;
}

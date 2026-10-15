import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  finishQuickWinAction, requestQuickWinHelp,
} from "@/modules/student-experience/quick-wins.functions";

type Action = {
  id: string; title: string; description: string | null;
  status: "open" | "in_progress" | "waiting" | "resolved" | "cancelled";
  priority: string; dueAt: Date | string | null;
  metadata: Record<string, unknown>; type: string;
};
export function LiveQuickWins({ actions, connected }: { actions: Action[]; connected: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const outstanding = actions.filter(action => action.status === "open");

  async function finish(actionId: string) {
    setBusy(true); setError(""); setSaved("");
    try {
      await finishQuickWinAction({ data: { actionId } });
      setSaved("Action saved as complete in synthetic Neon.");
      await router.invalidate();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save"); }
    finally { setBusy(false); }
  }

  async function requestHelp() {
    setBusy(true); setError(""); setSaved("");
    try {
      await requestQuickWinHelp({ data: { message } });
      setMessage("");
      setSaved("Help request saved in synthetic Neon.");
      await router.invalidate();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save"); }
    finally { setBusy(false); }
  }

  return <section className="mt-8 rounded-2xl border-2 border-foreground/15 bg-card p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Database connected · Synthetic only</p><h2 className="mt-2 font-serif text-3xl">Your saved actions</h2><p className="mt-2 text-sm text-muted-foreground">These records persist in Neon, unlike the interactive examples below.</p></div>
      <span className="rounded-full bg-stone-warm px-3 py-2 text-xs font-semibold">{connected ? "Neon connected" : "Neon unavailable"}</span>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-300 px-3 py-2 text-sm">{error}</p>}
    {saved && <p role="status" className="mt-4 rounded-lg border border-emerald-300 px-3 py-2 text-sm">{saved}</p>}
    <div className="mt-5 space-y-3">
      {actions.map(action => <div key={action.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-4">
        <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{String(action.metadata.source ?? action.type)} · {action.priority} priority</p><p className="mt-1 text-sm font-semibold">{action.title}</p><p className="mt-1 text-xs text-muted-foreground">{action.description}</p></div>
        {action.status === "open" ?
          <button disabled={busy} onClick={()=>finish(action.id)} className="rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-50">Mark complete</button> :
          <span className="text-xs font-semibold text-emerald-800">Completed ✓</span>}
      </div>)}
      {!actions.length && <p className="text-sm text-muted-foreground">No synthetic actions found. Load scripts/seeds/student-quick-wins.sql to populate this view.</p>}
    </div>
    <p className="mt-4 text-xs text-muted-foreground">{outstanding.length} saved action{outstanding.length===1?"":"s"} need attention</p>
    <div className="mt-7 border-t border-border pt-5">
      <h3 className="font-semibold">Ask for help · saved request</h3>
      <p className="mt-2 text-xs text-muted-foreground">Create a genuine Action record for the synthetic student in Neon.</p>
      <textarea rows={3} maxLength={1000} value={message} onChange={event=>setMessage(event.target.value)} placeholder="I need help with…" className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm"/>
      <button disabled={busy || !connected || message.trim().length<3} onClick={requestHelp} className="mt-2 rounded-lg bg-foreground px-5 py-3 text-xs font-semibold text-background disabled:opacity-40">Save help request</button>
    </div>
  </section>;
}

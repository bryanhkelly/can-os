import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMyWatches,
  getMyWatchDeliveries,
  updateWatchOptions,
  updateWatchStatus,
} from "@/modules/conversation/ask-can.functions";
import { WorkspaceShell, EmptyState, QueryState } from "@/components/workspace";
import { NotificationPreferences } from "@/components/guardian/NotificationPreferences";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";

export const Route = createFileRoute("/guardian/watching")({
  component: WatchingPage,
});

type Watch = Awaited<ReturnType<typeof getMyWatches>>[number];

function WatchingPage() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyFor, setHistoryFor] = useState("");

  const load = useCallback(async () => {
    const rows = await getMyWatches();
    setWatches(rows);
    setError("");
  }, []);
  const mutation = useMutationFeedback(load);
  const busy = mutation.pending || mutation.refreshFailed;

  useEffect(() => {
    load()
      .catch(() => setError("Sign in to see what CAN is watching for you."))
      .finally(() => setLoading(false));
  }, [load]);

  async function setStatus(subscriptionId: string, status: "active" | "paused" | "revoked") {
    setError("");
    await mutation.run(() => updateWatchStatus({ data: { subscriptionId, status } }), {
      successMessage: "Watch updated.", commandErrorMessage: "That watch could not be updated.",
    });
  }

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Family"
      title="Things CAN Is Watching"
      subtitle="Every standing instruction you've given CAN — inspect it, pause it, or turn it off."
    >
      <NotificationPreferences />
      <MutationFeedback state={mutation} className="mt-4" pendingMessage="Updating watch..."/>
      <QueryState loading={loading ? "Loading your watches…" : ""} error={error}>
        {watches.length === 0 && (
          <EmptyState
            className="mt-6 bg-card"
            title="CAN isn't watching anything yet. Ask CAN to watch something, like “tell me when my child misses an assignment.”"
          />
        )}
        <div className="mt-6 grid gap-3">
          {watches.map((watch) => (
            <article key={watch.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {watch.eventTypes.join(", ").replaceAll(/([a-z])([A-Z])/g, "$1 $2")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Watching {watch.subjectType.replaceAll("_", " ")} ·{" "}
                    {watch.channel === "in_app" ? "CAN notification" : watch.channel}
                    {watch.reminderAfterHours
                      ? ` · reminder after ${watch.reminderAfterHours}h unresolved`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {new Date(watch.createdAt).toLocaleDateString()}
                    {watch.createdVia === "conversation" ? " via Ask CAN" : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs ${
                    watch.status === "active"
                      ? ""
                      : "border-amber-500 text-amber-600"
                  }`}
                >
                  {watch.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <button type="button" className="rounded-full border px-3 py-1"
                  onClick={() => {
                    if (historyFor === watch.id) { setHistoryFor(""); return; }
                    setHistoryFor(watch.id);
                  }}>Delivery history</button>
                {watch.status === "active" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(watch.id, "paused")}
                    className="rounded-full border px-3 py-1 hover:bg-muted disabled:opacity-50"
                  >
                    Pause
                  </button>
                )}
                {watch.status === "paused" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(watch.id, "active")}
                    className="rounded-full border px-3 py-1 hover:bg-muted disabled:opacity-50"
                  >
                    Resume
                  </button>
                )}
                {(watch.status === "active" || watch.status === "paused") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(watch.id, "revoked")}
                    className="rounded-full border border-amber-500 px-3 py-1 text-amber-600 hover:bg-muted disabled:opacity-50"
                  >
                    Turn off
                  </button>
                )}
              </div>
              {watch.status === "active" && <WatchSettings watch={watch} onSaved={load} />}
              {historyFor === watch.id && <WatchDeliveryHistory subscriptionId={watch.id}/>}
            </article>
          ))}
        </div>
      </QueryState>
    </WorkspaceShell>
  );
}

function WatchDeliveryHistory({ subscriptionId }: { subscriptionId: string }) {
  const history = useQuery({ queryKey: ["watch-delivery-history", subscriptionId],
    queryFn: () => getMyWatchDeliveries({ data: { subscriptionId } }), retry: false });
  return <div className="mt-4 border-t pt-3 text-xs">
    <p className="mb-2 font-semibold">Recent reminder deliveries</p>
    <button type="button" className="mb-2 underline" disabled={history.isFetching}
      onClick={() => void history.refetch()}>{history.isFetching ? "Refreshing..." : "Refresh delivery status"}</button>
    <p className="mb-2">Refreshing only reads status; it never resends an update.</p>
    {history.isPending ? <p role="status">Loading delivery history...</p> :
      history.isError ? <p role="alert">{mutationErrorMessage(history.error, "Unable to load delivery history.")} Retry using refresh above.</p> :
      history.data.length === 0 ? <p>No history yet.</p> :
      history.data.map(item => <div key={item.id} className="mb-2 rounded border p-2">
        {item.kind} · {item.channel} · {item.label} · {new Date(item.createdAt).toLocaleString()}
        <p className="mt-1">{item.detail}</p>
        <p className="mt-1">Next: {item.nextStep}</p>
        <p className="mt-1">Delivery ID: {item.id}</p>
        {item.nextAttemptAt && <p>Next attempt: {new Date(item.nextAttemptAt).toLocaleString()}</p>}
      </div>)}
  </div>;
}

function WatchSettings({ watch, onSaved }: { watch: Watch; onSaved: () => Promise<void> }) {
  const [channel, setChannel] = useState<"in_app" | "email" | "sms">(
    watch.channel === "sms" ? "sms" : watch.channel === "email" ? "email" : "in_app");
  const [first, setFirst] = useState(watch.reminderAfterHours ?? 24);
  const [repeat, setRepeat] = useState(watch.repeatEveryHours ?? 24);
  const [maximum, setMaximum] = useState(watch.maxReminders);
  const mutation = useMutationFeedback(onSaved);
  const saving = mutation.pending || mutation.refreshFailed;
  async function save() {
    await mutation.run(() => updateWatchOptions({ data: {
        subscriptionId: watch.id, channel, remindAfterHours: first,
        repeatEveryHours: repeat, maxReminders: maximum,
      } }), { successMessage: "Saved.", commandErrorMessage: "Could not save reminder settings." });
  }
  return <div className="mt-4 grid gap-3 border-t pt-3 text-sm sm:grid-cols-2">
    <label>Channel
      <select value={channel} onChange={e => setChannel(e.target.value as "in_app" | "email" | "sms")}
        className="mt-1 block w-full rounded-md border bg-background p-2">
        <option value="in_app">In-app</option><option value="email">Email</option><option value="sms">Verified SMS</option>
      </select>
    </label>
    <label>First reminder after (hours)
      <input type="number" min={1} max={720} value={first}
        onChange={e => setFirst(Number(e.target.value))}
        className="mt-1 block w-full rounded-md border bg-background p-2"/>
    </label>
    <label>Repeat every (hours)
      <input type="number" min={1} max={720} value={repeat}
        onChange={e => setRepeat(Number(e.target.value))}
        className="mt-1 block w-full rounded-md border bg-background p-2"/>
    </label>
    <label>Maximum reminders
      <input type="number" min={1} max={30} value={maximum}
        onChange={e => setMaximum(Number(e.target.value))}
        className="mt-1 block w-full rounded-md border bg-background p-2"/>
    </label>
    <div className="flex items-center gap-2">
      <button type="button" disabled={saving} onClick={() => void save()}
        className="rounded-full bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Save</button>
      <MutationFeedback state={mutation} pendingMessage="Saving reminder settings..."/>
    </div>
  </div>;
}

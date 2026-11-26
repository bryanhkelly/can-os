import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMyWatches,
  getMyWatchDeliveries,
  updateWatchOptions,
  updateWatchStatus,
} from "@/modules/conversation/ask-can.functions";
import { WorkspaceShell, EmptyState, QueryState, WorkspacePanel, FormSection, ActionFooter } from "@/components/workspace";
import { NotificationPreferences } from "@/components/guardian/NotificationPreferences";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { StatusBadge } from "@/components/workspace";

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
      eyebrow="Family"
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
            <WorkspacePanel key={watch.id} title={watch.eventTypes.join(", ").replaceAll(/([a-z])([A-Z])/g, "$1 $2")} actions={<StatusBadge tone={watch.status === "active" ? "success" : watch.status === "paused" ? "attention" : "neutral"}>{watch.status}</StatusBadge>}>
                <div>
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
              <ActionFooter layout="inline">
                <Button type="button" variant="outline" size="sm"
                  onClick={() => {
                    if (historyFor === watch.id) { setHistoryFor(""); return; }
                    setHistoryFor(watch.id);
                  }}>Delivery history</Button>
                {watch.status === "active" && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(watch.id, "paused")}
                    variant="outline" size="sm"
                  >
                    Pause
                  </Button>
                )}
                {watch.status === "paused" && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(watch.id, "active")}
                    variant="outline" size="sm"
                  >
                    Resume
                  </Button>
                )}
                {(watch.status === "active" || watch.status === "paused") && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(watch.id, "revoked")}
                    variant="outline" size="sm"
                  >
                    Turn off
                  </Button>
                )}
              </ActionFooter>
              {watch.status === "active" && <WatchSettings watch={watch} onSaved={load} />}
              {historyFor === watch.id && <WatchDeliveryHistory subscriptionId={watch.id}/>}
            </WorkspacePanel>
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
    <Button type="button" variant="ghost" size="sm" className="mb-2 underline" disabled={history.isFetching}
      onClick={() => void history.refetch()}>{history.isFetching ? "Refreshing..." : "Refresh delivery status"}</Button>
    <p className="mb-2">Refreshing only reads status; it never resends an update.</p>
    {history.isPending ? <p role="status">Loading delivery history...</p> :
      history.isError ? <p role="alert">{mutationErrorMessage(history.error, "Unable to load delivery history.")} Retry using refresh above.</p> :
      history.data.length === 0 ? <p>No history yet.</p> :
      history.data.map(item => <div key={item.id} className="mb-2  border p-2">
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
    if (saving) return;
    await mutation.run(() => updateWatchOptions({ data: {
        subscriptionId: watch.id, channel, remindAfterHours: first,
        repeatEveryHours: repeat, maxReminders: maximum,
      } }), { successMessage: "Saved.", commandErrorMessage: "Could not save reminder settings." });
  }
  return <FormSection title="Reminder settings" className="mt-4">
    <Field label="Channel">
      <Select value={channel} onChange={e => setChannel(e.target.value as "in_app" | "email" | "sms")}
       >
        <option value="in_app">In-app</option><option value="email">Email</option><option value="sms">Verified SMS</option>
      </Select>
    </Field>
    <Field label="First reminder after (hours)">
      <Input type="number" min={1} max={720} value={first}
        onChange={e => setFirst(Number(e.target.value))}
       />
    </Field>
    <Field label="Repeat every (hours)">
      <Input type="number" min={1} max={720} value={repeat}
        onChange={e => setRepeat(Number(e.target.value))}
       />
    </Field>
    <Field label="Maximum reminders">
      <Input type="number" min={1} max={30} value={maximum}
        onChange={e => setMaximum(Number(e.target.value))}
       />
    </Field>
    <ActionFooter layout="inline" className="sm:col-span-2">
      <Button type="button" disabled={saving} loading={mutation.pending} loadingLabel="Saving…" onClick={() => void save()}>Save</Button>
      <MutationFeedback state={mutation} pendingMessage="Saving reminder settings..."/>
    </ActionFooter>
  </FormSection>;
}

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  getMyWatches,
  getMyWatchDeliveries,
  updateWatchStatus,
} from "@/modules/conversation/ask-can.functions";
import { WorkspaceShell, EmptyState, QueryState } from "@/components/workspace";

export const Route = createFileRoute("/guardian/watching")({
  component: WatchingPage,
});

type Watch = Awaited<ReturnType<typeof getMyWatches>>[number];

function WatchingPage() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [historyFor, setHistoryFor] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getMyWatchDeliveries>>>([]);

  const load = useCallback(async () => {
    const rows = await getMyWatches();
    setWatches(rows);
  }, []);

  useEffect(() => {
    load()
      .catch(() => setError("Sign in to see what CAN is watching for you."))
      .finally(() => setLoading(false));
  }, [load]);

  async function setStatus(subscriptionId: string, status: "active" | "paused" | "revoked") {
    setBusyId(subscriptionId);
    setError("");
    try {
      await updateWatchStatus({ data: { subscriptionId, status } });
      await load();
    } catch {
      setError("That watch could not be updated.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Family"
      title="Things CAN Is Watching"
      subtitle="Every standing instruction you've given CAN — inspect it, pause it, or turn it off."
    >
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
                  onClick={async () => {
                    if (historyFor === watch.id) { setHistoryFor(""); return; }
                    setHistoryFor(watch.id);
                    try { setHistory(await getMyWatchDeliveries({ data: { subscriptionId: watch.id } })); }
                    catch { setError("Unable to load delivery history."); }
                  }}>Delivery history</button>
                {watch.status === "active" && (
                  <button
                    type="button"
                    disabled={busyId === watch.id}
                    onClick={() => setStatus(watch.id, "paused")}
                    className="rounded-full border px-3 py-1 hover:bg-muted disabled:opacity-50"
                  >
                    Pause
                  </button>
                )}
                {watch.status === "paused" && (
                  <button
                    type="button"
                    disabled={busyId === watch.id}
                    onClick={() => setStatus(watch.id, "active")}
                    className="rounded-full border px-3 py-1 hover:bg-muted disabled:opacity-50"
                  >
                    Resume
                  </button>
                )}
                {(watch.status === "active" || watch.status === "paused") && (
                  <button
                    type="button"
                    disabled={busyId === watch.id}
                    onClick={() => setStatus(watch.id, "revoked")}
                    className="rounded-full border border-amber-500 px-3 py-1 text-amber-600 hover:bg-muted disabled:opacity-50"
                  >
                    Turn off
                  </button>
                )}
              </div>
              {historyFor === watch.id && <div className="mt-4 border-t pt-3 text-xs">
                <p className="mb-2 font-semibold">Recent reminder deliveries</p>
                {history.length === 0 && <p>No history yet.</p>}
                {history.map(item => <div key={item.id} className="mb-2 rounded border p-2">
                  {item.kind} · {item.channel} · {item.status} · {new Date(item.createdAt).toLocaleString()}
                  {item.lastError && <p className="text-amber-600">{item.lastError}</p>}
                </div>)}
              </div>}
            </article>
          ))}
        </div>
      </QueryState>
    </WorkspaceShell>
  );
}

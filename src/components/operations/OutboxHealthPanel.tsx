import { useCallback, useEffect, useRef, useState } from "react";
import { QueryState } from "@/components/workspace";
import { getOutboxHealthSummary } from "@/modules/operations/outbox-health.functions";

type Health = Awaited<ReturnType<typeof getOutboxHealthSummary>>;

/**
 * Read-only outbox telemetry for operators: pending backlog, events whose type
 * no worker claims (unhandled), and terminal failures (each escalated to an
 * ops Action). The server function is the only authorization gate; this panel
 * renders the server's verdict and never decides eligibility itself.
 */
export function OutboxHealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    setReadError("");
    try {
      const current = await getOutboxHealthSummary();
      if (request === requestSequence.current) setHealth(current);
    } catch (cause) {
      if (request === requestSequence.current) setReadError(
        cause instanceof Error ? cause.message : "Unable to load outbox health.");
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => { requestSequence.current++; };
  }, [refresh]);

  const stats: Array<[string, number]> = health
    ? [["Pending", health.pending], ["Unhandled", health.pendingUnhandled], ["Failed", health.failed]]
    : [];

  return <section aria-label="Event outbox health" className="mt-7 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Event outbox</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Domain events move through a transactional outbox before consumers run. A growing pending
      backlog means the worker is behind; unhandled events have no registered consumer; failed
      events exhausted their retries and each raised an ops Action.
    </p>
    <QueryState loading={loading ? "Loading outbox health…" : undefined}
      error={readError || undefined} onRetry={() => void refresh()} retrying={loading}>
      {health && <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {stats.map(([label, value]) => <div key={label} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>)}
      </div>}
      {health && health.pendingUnhandled > 0 && <p role="status" className="mt-4 rounded-lg border border-dashed p-3 text-sm">
        {health.pendingUnhandled} pending event{health.pendingUnhandled === 1 ? "" : "s"} have no registered
        consumer and will not drain until a handler is registered.
      </p>}
    </QueryState>
  </section>;
}

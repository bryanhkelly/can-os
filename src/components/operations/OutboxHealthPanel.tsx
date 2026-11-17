import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useCallback, useEffect, useRef, useState } from "react";
import { QueryState } from "@/components/workspace";
import { getOutboxHealthSummary } from "@/modules/operations/outbox-health.functions";
import { SchoolFamilyDeliveryRecoveryPanel } from "./SchoolFamilyDeliveryRecoveryPanel";

type Health = Awaited<ReturnType<typeof getOutboxHealthSummary>>;

/**
 * Outbox telemetry and source-owned recovery for authorized operators. The
 * health query is read-only; the nested delivery recovery module performs
 * independently authorized and audited queue mutations. Neither component
 * decides its own eligibility or claims provider acceptance as delivery.
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
        mutationErrorMessage(cause, "Unable to load outbox health."));
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => { requestSequence.current++; };
  }, [refresh]);

  const stats: Array<[string, number]> = health
    ? [["Pending", health.pending], ["Processing", health.processing], ["Unhandled", health.pendingUnhandled], ["Failed", health.failed]]
    : [];

  return <section aria-label="Event outbox health" className="mt-7 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Event outbox</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Domain events move through a transactional outbox before consumers run. A growing pending
      backlog means the worker is behind; processing events have been claimed by a worker; unhandled events have no registered consumer; failed
      events exhausted their retries and each raised an ops Action.
    </p>
    <QueryState loading={loading ? "Loading outbox health…" : undefined}
      error={readError || undefined} onRetry={() => void refresh()} retrying={loading}>
      {health && <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => <div key={label} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>)}
      </div>}
      {health?.schoolFamilyDelivery && <div className="mt-6 border-t pt-4">
        <h3 className="font-semibold">School-family outbound delivery</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Counts for your authorized Sites and Organizations only. Provider accepted
          does not confirm mail-server delivery, reading, or a guardian taking action.
          Failed excludes deliveries already scheduled for automatic retry.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {([
            ["Queued", health.schoolFamilyDelivery.pending],
            ["Processing", health.schoolFamilyDelivery.processing],
            ["Retry scheduled", health.schoolFamilyDelivery.retryScheduled],
            ["Failed", health.schoolFamilyDelivery.failed],
            ["Provider accepted", health.schoolFamilyDelivery.providerAccepted],
            ["Mail server delivered", health.schoolFamilyDelivery.providerDelivered],
            ["Provider failed", health.schoolFamilyDelivery.providerFailed],
            ["Spam complaints", health.schoolFamilyDelivery.complained],
            ["Suppressed", health.schoolFamilyDelivery.suppressed],
          ] as Array<[string, number]>).map(([label, value]) =>
            <div key={label} className="border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>)}
        </div>
      </div>}
      {health && <SchoolFamilyDeliveryRecoveryPanel onRecovered={refresh} />}
      {health && health.pendingUnhandled > 0 && <p role="status" className="mt-4 rounded-lg border border-dashed p-3 text-sm">
        {health.pendingUnhandled} pending event{health.pendingUnhandled === 1 ? "" : "s"} have no registered
        consumer and will not drain until a handler is registered.
      </p>}
    </QueryState>
  </section>;
}

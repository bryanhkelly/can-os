import { Link } from "@tanstack/react-router";
import type { getDeliveryHistory } from "@/modules/communication/delivery-history.functions";

type History = Awaited<ReturnType<typeof getDeliveryHistory>>;
const channels = { in_app: "In-app", email: "Email", sms: "SMS", agent_webhook: "Agent webhook" };

export function DeliveryHistory({ history, cursor, notification, refreshing, onRefresh }: {
  history: History | null;
  cursor?: string;
  notification?: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return <section className="mt-10" aria-labelledby="delivery-history-heading">
    <h2 id="delivery-history-heading" className="font-serif text-2xl">Watch delivery history</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Recorded outcomes for your event-triggered watches and reminders, newest first.
      This is not a log of all messages, weekly digests or external delivery receipts.
      Watched record details are not included because access can change.
    </p>
    <div className="mt-4 space-y-3">
      {!history && <p role="alert" className="rounded-xl border p-5 text-sm">Delivery history is unavailable. Retry or return to the latest deliveries. Your notifications are still available above.</p>}
      {history?.items.map(item => <article key={item.id} className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">{item.kind} · {channels[item.channel]}</h3>
          <span className="rounded border px-2 py-1 text-xs font-semibold">{item.label}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
        <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div><dt className="inline font-semibold">Queued: </dt><dd className="inline"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></dd></div>
          <div><dt className="inline font-semibold">Provider attempts: </dt><dd className="inline">{item.attempts}</dd></div>
          {item.acceptedAt && <div><dt className="inline font-semibold">{item.channel === "in_app" ? "Created in CAN: " : "Provider accepted: "}</dt><dd className="inline"><time dateTime={item.acceptedAt}>{new Date(item.acceptedAt).toLocaleString()}</time></dd></div>}
          {item.nextAttemptAt && <div><dt className="inline font-semibold">Next attempt: </dt><dd className="inline"><time dateTime={item.nextAttemptAt}>{new Date(item.nextAttemptAt).toLocaleString()}</time></dd></div>}
        </dl>
      </article>)}
      {history && !history.items.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">No watch delivery records on this page.</p>}
    </div>
    <nav aria-label="Delivery history pages" className="mt-4 flex flex-wrap gap-4 text-sm">
      <button type="button" disabled={refreshing} onClick={onRefresh} className="underline disabled:opacity-50">{refreshing ? "Refreshing..." : "Refresh delivery status"}</button>
      {cursor && <Link to="/notifications" search={{ notification }} className="underline">Latest deliveries</Link>}
      {history?.nextCursor && <Link to="/notifications" search={{ notification, deliveryCursor: history.nextCursor }} className="underline">Older deliveries</Link>}
    </nav>
  </section>;
}

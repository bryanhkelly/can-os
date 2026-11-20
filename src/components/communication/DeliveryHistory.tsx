import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { RecordedTime, StatusTimeline } from "@/components/workflow";
import { WorkspaceNotice } from "@/components/workspace/notice";
import { PageNavigation } from "@/components/workspace/page-navigation";
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
    <div className="mt-4">
      {!history && <WorkspaceNotice tone="danger">
        Delivery history is unavailable. Retry or return to the latest deliveries.
        Your notifications are still available above.
      </WorkspaceNotice>}
      {history && <StatusTimeline label="Watch delivery history"
        emptyMessage="No watch delivery records on this page."
        entries={history.items.map(item => ({
          id: item.id,
          title: `${item.kind} · ${channels[item.channel]}`,
          occurredAt: item.createdAt,
          status: item.label,
          description: <div className="space-y-2">
            <p>{item.detail}</p>
            <p><strong>Next: </strong>{item.nextStep}</p>
            {item.recovery && <Link to="/guardian/watching"
              hash={item.recovery === "preferences" ? "notification-preferences" : undefined}
              className="inline-block font-semibold underline">
              {item.recovery === "preferences" ? "Review notification preferences" : "Review watch settings"}
            </Link>}
            <dl className="space-y-1">
              <div><dt className="inline font-semibold">Provider attempts: </dt><dd className="inline">{item.attempts}</dd></div>
              <div><dt className="inline font-semibold">Delivery ID: </dt><dd className="inline">{item.id}</dd></div>
              {item.acceptedAt && <div><dt className="inline font-semibold">
                {item.channel === "in_app" ? "Created in CAN: " : "Provider accepted: "}
              </dt><dd className="inline"><RecordedTime value={item.acceptedAt}/></dd></div>}
              {item.nextAttemptAt && <div><dt className="inline font-semibold">Next attempt: </dt><dd className="inline"><RecordedTime value={item.nextAttemptAt}/></dd></div>}
            </dl>
          </div>,
        }))}/>}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-4">
      <Button type="button" size="sm" variant="outline" loading={refreshing} disabled={refreshing}
        onClick={onRefresh}>{refreshing ? "Refreshing..." : "Refresh delivery status"}</Button>
      {(cursor || history?.nextCursor) && <PageNavigation label="Delivery history pages"
        previous={cursor ? <Link to="/notifications" search={{ notification }} className="underline">Latest deliveries</Link> : undefined}
        next={history?.nextCursor ? <Link to="/notifications" search={{ notification, deliveryCursor: history.nextCursor }} className="underline">Older deliveries</Link> : undefined}
      />}
    </div>
  </section>;
}

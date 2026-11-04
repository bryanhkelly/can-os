import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getNotifications, readNotification, readAllNotifications, setNotificationStatus } from "@/modules/communication/notification-center.functions";
import { MutationFeedback, QueryState } from "@/components/workspace";
import { NotificationFeed } from "@/components/communication/NotificationFeed";
import { useMutationFeedback, mutationErrorMessage } from "@/lib/mutation-feedback";

export function NotificationTray({ onNavigate, enabled }: { onNavigate: () => void; enabled: boolean }) {
  const [notices, setNotices] = useState<Awaited<ReturnType<typeof getNotifications>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const refresh = async () => {
    const rows = await getNotifications();
    setNotices(rows);
    setLoadError("");
  };
  const mutation = useMutationFeedback(refresh);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setLoadError("");
      try {
        const rows = await getNotifications();
        if (active) setNotices(rows);
      } catch (error) {
        if (active) setLoadError(mutationErrorMessage(error, "Unable to load notifications."));
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [enabled]);

  async function retryLoad() {
    setLoading(true);
    try { await refresh(); }
    catch (error) { setLoadError(mutationErrorMessage(error, "Unable to load notifications.")); }
    finally { setLoading(false); }
  }

  async function changeStatus(id: string, status: "read" | "unread" | "dismissed") {
    await mutation.run(() => status === "read" ? readNotification({ data: { id } }) : setNotificationStatus({ data: { id, status } }), {
      successMessage: status === "dismissed" ? "Notification dismissed." : status === "read" ? "Notification marked as read." : "Notification marked unread.",
      commandErrorMessage: "Unable to update notification.",
    });
  }
  const visible = notices.filter(item => item.status !== "dismissed");
  return <div>
    <p className="mb-5 text-sm text-muted-foreground">Academic, operational, and communication updates, linked to your next step.</p>
    <MutationFeedback state={mutation} pendingMessage="Updating notification..." className="mt-4"/>
    {loading || loadError
      ? <QueryState loading={loading ? "Loading notifications..." : undefined}
          error={loadError || undefined} onRetry={() => void retryLoad()} retrying={loading}/>
      : <NotificationFeed notices={visible} busy={mutation.pending || mutation.refreshFailed}
        onStatus={(id, status) => void changeStatus(id, status)} onNavigate={onNavigate}
        onReadAll={() => void mutation.run(() => readAllNotifications(), {
          successMessage: "Notifications marked as read.", commandErrorMessage: "Unable to update notifications.",
        })} />}
    <Link to="/notifications" onClick={onNavigate}
      className="mt-5 block border-t pt-4 text-center text-sm font-semibold text-primary underline focus-visible:ring-2 focus-visible:ring-ring">Open notification center</Link>
  </div>;
}

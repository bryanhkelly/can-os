import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getNotifications, readNotification } from "@/modules/communication/notification-center.functions";
import { MutationFeedback, QueryState, StatusBadge } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { useMutationFeedback, mutationErrorMessage } from "@/lib/mutation-feedback";

export function NotificationTray({ onNavigate, enabled }: { onNavigate: () => void; enabled: boolean }) {
  const [notices, setNotices] = useState<Awaited<ReturnType<typeof getNotifications>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
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

  async function markRead(id: string) {
    setBusyId(id);
    try {
      await mutation.run(() => readNotification({ data: { id } }), {
        successMessage: "Notification marked as read.",
        commandErrorMessage: "Unable to update notification.",
      });
    } finally { setBusyId(null); }
  }
  const visible = notices.filter(item => item.status !== "dismissed");
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Updates for your signed-in account.</p>
      <Link to="/notifications" onClick={onNavigate} className="text-sm underline">Open notification center</Link>
    </div>
    <MutationFeedback state={mutation} pendingMessage="Updating notification..." className="mt-4"/>
    {loading || loadError
      ? <QueryState loading={loading ? "Loading notifications..." : undefined}
          error={loadError || undefined} onRetry={() => void retryLoad()} retrying={loading}/>
      : <ul className="mt-5 space-y-3">{visible.map(notice => <li key={notice.id} className="rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{notice.href ? <Link to={notice.href} href={notice.href} onClick={onNavigate} className="underline">{notice.title}</Link> :
            <Link to="/notifications" search={{ notification: notice.id }} onClick={onNavigate} className="underline">{notice.title}</Link>}</h3>
          {notice.status === "unread" && <StatusBadge tone="attention">Unread</StatusBadge>}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{notice.body}</p>
        <time dateTime={notice.date} className="mt-2 block text-xs text-muted-foreground">{new Date(notice.date).toLocaleString()}</time>
        {notice.status === "unread" && <Button variant="outline" size="sm"
          disabled={busyId !== null || mutation.pending || mutation.refreshFailed}
          onClick={() => void markRead(notice.id)} className="mt-3">
          {busyId === notice.id ? "Saving..." : "Mark as read"}
        </Button>}
      </li>)}</ul>}
    {!loading && !loadError && !visible.length && <p role="status" className="mt-5 rounded-xl border p-4 text-sm text-muted-foreground">No notifications yet.</p>}
  </div>;
}

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getNotifications, readNotification } from "@/modules/communication/notification-center.functions";
import { StatusBadge } from "@/components/workspace";

export function NotificationTray({ onNavigate }: { onNavigate: () => void }) {
  const [notices, setNotices] = useState<Awaited<ReturnType<typeof getNotifications>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getNotifications().then(rows => { if (active) setNotices(rows); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "Unable to load notifications."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function markRead(id: string) {
    setBusy(id); setError("");
    try {
      await readNotification({ data: { id } });
      setNotices(previous => previous.map(item => item.id === id ? { ...item, status: "read" } : item));
    } catch(error) { setError(error instanceof Error ? error.message : "Unable to update notification."); }
    finally { setBusy(null); }
  }
  const visible = notices.filter(item => item.status !== "dismissed");
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Updates for your signed-in account.</p>
      <Link to="/notifications" onClick={onNavigate} className="text-sm underline">Open notification center</Link>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-amber-500 p-3 text-sm">{error}</p>}
    {loading ? <p role="status" className="mt-5 text-sm">Loading notifications...</p> :
      <ul className="mt-5 space-y-3">{visible.map(notice => <li key={notice.id} className="rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{notice.href ? <Link to={notice.href} href={notice.href} onClick={onNavigate} className="underline">{notice.title}</Link> :
            <Link to="/notifications" search={{ notification: notice.id }} onClick={onNavigate} className="underline">{notice.title}</Link>}</h3>
          {notice.status === "unread" && <StatusBadge tone="attention">Unread</StatusBadge>}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{notice.body}</p>
        <time dateTime={notice.date} className="mt-2 block text-xs text-muted-foreground">{new Date(notice.date).toLocaleString()}</time>
        {notice.status === "unread" && <button type="button" disabled={busy !== null} onClick={() => void markRead(notice.id)}
          className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">{busy === notice.id ? "Saving..." : "Mark as read"}</button>}
      </li>)}</ul>}
    {!loading && !error && !visible.length && <p role="status" className="mt-5 rounded-xl border p-4 text-sm text-muted-foreground">No notifications yet.</p>}
  </div>;
}

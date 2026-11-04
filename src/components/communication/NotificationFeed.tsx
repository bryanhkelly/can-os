import { useState } from "react";
import { ArrowUpRight, Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/workspace";
import type { CenterNotice } from "@/domain/notification-center";

export function NotificationFeed({ notices, busy, onStatus, onReadAll, onNavigate }: {
  notices: CenterNotice[];
  busy: boolean;
  onStatus: (id: string, status: "read" | "unread" | "dismissed") => void;
  onReadAll: () => void;
  onNavigate?: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const unreadCount = notices.filter(notice => notice.status === "unread").length;
  const visible = filter === "unread" ? notices.filter(notice => notice.status === "unread") : notices;
  return <section aria-label="Activity feed" className="min-w-0 border bg-card">
    <header className="border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-section">Activity feed</h3>
          <p className="mt-1 text-xs text-muted-foreground">{unreadCount} unread {unreadCount === 1 ? "update" : "updates"}</p>
        </div>
        <Button variant="ghost" size="sm" disabled={busy || !unreadCount} onClick={onReadAll}>
          <CheckCheck aria-hidden="true" />Mark all as read
        </Button>
      </div>
      <div role="group" aria-label="Notification filter" className="mt-4 flex gap-2">
        {(["all", "unread"] as const).map(value => <Button key={value} variant={filter === value ? "secondary" : "ghost"}
          size="sm" aria-pressed={filter === value} onClick={() => setFilter(value)}>
          {value === "all" ? "All updates" : "Unread"}
        </Button>)}
      </div>
    </header>
    <ul className="divide-y">
      {visible.map(notice => <li key={notice.id} className={`flex min-w-0 gap-3 border-l-2 p-4 ${notice.status === "unread" ? "border-l-primary bg-accent/30" : "border-l-transparent"}`}>
        <span className="flex size-9 shrink-0 items-center justify-center border bg-muted text-muted-foreground"><Bell aria-hidden="true" className="size-4" /></span>
        <article className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="break-words text-sm font-semibold">{notice.href
              ? <a href={notice.href} onClick={onNavigate} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{notice.title}</a>
              : notice.title}</h4>
            <StatusBadge tone={notice.status === "unread" ? "info" : "neutral"}>
              {notice.status === "unread" ? "Unread" : notice.status === "dismissed" ? "Dismissed" : "Read"}
            </StatusBadge>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{notice.body}</p>
          <time dateTime={notice.date} className="mt-2 block text-xs text-muted-foreground">{new Date(notice.date).toLocaleString()}</time>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {notice.href && <a href={notice.href} onClick={onNavigate}
              className="mr-2 inline-flex items-center gap-1 text-xs font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Open related record<ArrowUpRight aria-hidden="true" className="size-3.5" />
            </a>}
            <Button variant="ghost" size="sm" disabled={busy}
              onClick={() => onStatus(notice.id, notice.status === "unread" ? "read" : "unread")}>
              {notice.status === "unread" && <Check aria-hidden="true" />}{notice.status === "unread" ? "Mark as read" : "Mark unread"}
            </Button>
            {notice.status !== "dismissed" && <Button variant="ghost" size="sm" disabled={busy}
              onClick={() => onStatus(notice.id, "dismissed")}>Dismiss</Button>}
          </div>
        </article>
      </li>)}
    </ul>
    {!visible.length && <div role="status" className="grid justify-items-center gap-3 p-8 text-center">
      <Bell aria-hidden="true" className="size-7 text-muted-foreground" />
      <p className="text-sm font-semibold">{filter === "unread" ? "You're all caught up." : "No notifications yet."}</p>
      <p className="text-xs text-muted-foreground">Updates for your signed-in account appear here.</p>
    </div>}
  </section>;
}

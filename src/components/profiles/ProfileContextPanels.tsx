import type { ReactNode } from "react";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { cn } from "@/lib/utils";

export interface ProfileMeeting {
  id: string;
  title: string;
  startsAt: string; // ISO timestamp supplied by an authorized scheduling service
  displayTime: string; // formatted in the owning school's timezone
  description?: string;
  href?: string;
}
export interface ProfileRelatedLink {
  id: string;
  title: string;
  href: string;
  description?: string;
  icon?: ReactNode;
}

/** Render supplied appointments, never infer a meeting from a planned action. */
export function ProfileMeetingsPanel({ meetings, emptyMessage = "No meetings are available in this view.", scheduleAction }: {
  meetings: readonly ProfileMeeting[];
  emptyMessage?: string;
  scheduleAction?: ReactNode;
}) {
  return <WorkspacePanel title="Meetings" description="Appointments visible in your authorized school context.">
    {meetings.length ? <ol className="space-y-2">{meetings.map(meeting=><li key={meeting.id}
      className="border border-border bg-muted/35 p-3">
      {meeting.href ? <a href={meeting.href} className="text-xs font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{meeting.title}</a>
        : <h3 className="text-xs font-semibold">{meeting.title}</h3>}
      <time dateTime={meeting.startsAt} className="mt-1 block text-xs text-muted-foreground">{meeting.displayTime}</time>
      {meeting.description && <p className="mt-2 text-xs text-muted-foreground">{meeting.description}</p>}
    </li>)}</ol>
      : <p role="status" className="text-xs leading-5 text-muted-foreground">{emptyMessage}</p>}
    {scheduleAction && <div className="mt-4">{scheduleAction}</div>}
  </WorkspacePanel>;
}

export function ProfileLinksPanel({ links, title = "Quick links", className }: {
  links: readonly ProfileRelatedLink[];
  title?: string;
  className?: string;
}) {
  return <div className={cn("min-w-0",className)}>
    <WorkspacePanel title={title}>
      <ul className="space-y-2">{links.map(link=><li key={link.id}>
        <a href={link.href} className="flex min-h-10 items-center justify-between gap-3 border border-border px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex min-w-0 items-center gap-2">{link.icon}<span>{link.title}
            {link.description && <span className="mt-1 block font-normal text-muted-foreground">{link.description}</span>}
          </span></span>
          <span aria-hidden="true">↗</span>
        </a>
      </li>)}</ul>
      {!links.length && <p role="status" className="text-xs text-muted-foreground">No related destinations available.</p>}
    </WorkspacePanel>
  </div>;
}

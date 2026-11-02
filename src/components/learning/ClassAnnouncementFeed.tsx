import { WorkspacePanel } from "@/components/workspace";

export interface ClassAnnouncement {
  id: string;
  title: string;
  body: string;
  createdAt: string | Date;
}

export function ClassAnnouncementFeed({ announcements, timezone }: {
  announcements: readonly ClassAnnouncement[];
  timezone: string;
}) {
  return <>
    {announcements.slice().reverse().map(item =>
      <WorkspacePanel key={item.id} title={item.title} description={new Intl.DateTimeFormat("en-US",{
        dateStyle:"medium",timeStyle:"short",timeZone:timezone,
      }).format(new Date(item.createdAt))}>
        <p className="whitespace-pre-wrap text-sm leading-7">{item.body}</p>
      </WorkspacePanel>)}
    {!announcements.length &&
      <p className="rounded-xl border p-5 text-sm text-muted-foreground">No class announcements yet.</p>}
  </>;
}

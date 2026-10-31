import { WorkspacePanel } from "@/components/workspace";

export interface ClassAnnouncement {
  id: string;
  title: string;
  body: string;
  createdAt: string | Date;
}

export function ClassAnnouncementFeed({ announcements }: { announcements: readonly ClassAnnouncement[] }) {
  return <>
    {announcements.slice().reverse().map(item =>
      <WorkspacePanel key={item.id} title={item.title} description={new Date(item.createdAt).toLocaleString()}>
        <p className="whitespace-pre-wrap text-sm leading-7">{item.body}</p>
      </WorkspacePanel>)}
    {!announcements.length &&
      <p className="rounded-xl border p-5 text-sm text-muted-foreground">No class announcements yet.</p>}
  </>;
}

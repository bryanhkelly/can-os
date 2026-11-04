import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { WorkspaceNotice } from "@/components/workspace";
import { type LoadOutcome } from "@/lib/safe-loader";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import type { getClassroomMeetings, scheduleClassroomMeeting, setClassroomMeetingLink } from "@/modules/learning/classroom-meetings.functions";

export type ClassroomMeetings = Awaited<ReturnType<typeof getClassroomMeetings>>;
export type ClassroomMeetingCommands = {
  get: (request: Parameters<typeof getClassroomMeetings>[0]) => ReturnType<typeof getClassroomMeetings>;
  schedule: (request: Parameters<typeof scheduleClassroomMeeting>[0]) => ReturnType<typeof scheduleClassroomMeeting>;
  saveLink: (request: Parameters<typeof setClassroomMeetingLink>[0]) => ReturnType<typeof setClassroomMeetingLink>;
};
export function ClassroomMediaStage({ recorded, meetings, sectionId, timezone, role, studentPersonId, commands }: {
  recorded: ReactNode; meetings?: LoadOutcome<ClassroomMeetings>; sectionId: string; timezone: string;
  role: string; studentPersonId?: string;
  commands: ClassroomMeetingCommands;
}) {
  const [mode, setMode] = useState<"recorded" | "live">("recorded");
  const [reloaded, setReloaded] = useState<LoadOutcome<ClassroomMeetings> | null>(null);
  const [title, setTitle] = useState("");
  const [startsLocal, setStartsLocal] = useState("");
  const [endsLocal, setEndsLocal] = useState("");
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const request = useRef<{ id: string; specification: string } | null>(null);
  async function refresh() {
    const events = await commands.get({ data: { sectionId, studentPersonId } });
    setReloaded({ ok: true, data: events });
  }
  const mutation = useMutationFeedback(refresh);
  const busy = mutation.pending || mutation.refreshFailed;
  const outcome = reloaded ?? meetings;
  async function schedule() {
    const specification = JSON.stringify({ title: title.trim(), startsLocal, endsLocal, url: url.trim() });
    if (!request.current || request.current.specification !== specification)
      request.current = { id: crypto.randomUUID(), specification };
    await mutation.run(async () => {
      const result = await commands.schedule({ data: { id: request.current!.id, sectionId, title: title.trim(), startsLocal, endsLocal, meetingUrl: url.trim() } });
      request.current = null; setTitle(""); setStartsLocal(""); setEndsLocal(""); setUrl("");
      return result;
    }, { successMessage: "Live class scheduled on the class calendar.", commandErrorMessage: "Unable to schedule this live class." });
  }
  return <section className="min-w-0 space-y-4" aria-label="Classroom media">
    <div className="classroom-mode-bar">
      <div className="classroom-modes" role="group" aria-label="Class format">
        <Button variant="ghost" size="sm" aria-pressed={mode === "recorded"} onClick={() => setMode("recorded")}><Video aria-hidden="true"/>Recorded lesson</Button>
        {role !== "guardian" && <Button variant="ghost" size="sm" aria-pressed={mode === "live"} onClick={() => setMode("live")}><CalendarDays aria-hidden="true"/>Live classroom</Button>}
      </div>
      <span className="text-3xs text-muted-foreground">{mode === "recorded" ? "On-demand · Pause, replay, or review the transcript" : `Class calendar · ${timezone}`}</span>
    </div>
    <div className="classroom-video-stage">
      {mode === "recorded" ? recorded : <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl font-semibold">Live classroom</h2>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void mutation.run(
            refresh, { successMessage: "Class calendar refreshed. Unsaved link edits are preserved.", commandErrorMessage: "Unable to refresh class meetings.",
              refresh: async () => undefined })}>Refresh class calendar</Button>
        </div>
        <p className="text-sm text-muted-foreground">Teacher-managed meetings open with the meeting provider. Joining here does not record attendance or grant academic credit. Showing up to 30 class events in the next 30 days.</p>
        {!outcome && <WorkspaceNotice>Live class availability has not been loaded.</WorkspaceNotice>}
        {outcome && !outcome.ok && <WorkspaceNotice tone="danger">{outcome.message}
          <Button variant="outline" size="sm" className="ml-2" disabled={busy} onClick={() => void mutation.run(
            refresh, { successMessage: "Class calendar refreshed.", commandErrorMessage: "Unable to refresh class meetings.",
              refresh: async () => undefined })}>Retry</Button>
        </WorkspaceNotice>}
        {outcome?.ok && <>
          {!outcome.data.length && <p role="status" className="border bg-muted p-5 text-sm">No class calendar events are scheduled in the next 30 days.</p>}
          <ul className="space-y-3">{outcome.data.map(event => <li key={event.id} className="space-y-3 border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{event.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.startsAt))} · {event.timezone}</p>
              <p className="mt-1 text-xs">{event.cancelled ? "Cancelled" : event.meetingUrl ? "Meeting link available" : "The teacher has not attached a meeting link."}</p></div>
              {event.meetingUrl && !event.cancelled && <Button asChild variant="outline" size="sm"><a href={event.meetingUrl} target="_blank" rel="noopener noreferrer">Open meeting<span className="sr-only"> for {event.title} in a new tab</span></a></Button>}
            </div>
            <Link to="/calendar" search={{ section: sectionId, event: event.id, date: dateKeyInTimezone(event.startsAt, event.timezone), view: "agenda" }} className="text-xs underline">View calendar event</Link>
            {event.canManage && <div>
              {editing === event.id ? <form className="mt-3 space-y-3" onSubmit={submit => { submit.preventDefault(); void mutation.run(async () => {
                await commands.saveLink({ data: { sectionId, eventId: event.id, meetingUrl: editUrl.trim() || null, expectedMeetingUrl: event.meetingUrl } });
                setEditing(null);
              }, { successMessage: "Class meeting link saved.", commandErrorMessage: "Unable to save the meeting link." }); }}>
                <label className="block text-sm">HTTPS meeting link (clear to remove)<input type="url" maxLength={2048} value={editUrl} disabled={busy} onChange={change => setEditUrl(change.target.value)} className="mt-1 block w-full border bg-background p-2"/></label>
                <div className="flex gap-2"><Button size="sm" disabled={busy}>Save link</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></div>
              </form> : <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setEditing(event.id); setEditUrl(event.meetingUrl ?? ""); }}>Manage meeting link</Button>}
            </div>}
            {role === "teacher" && !event.canManage && !event.cancelled && <p className="text-xs text-muted-foreground">This event is owned by another school workflow. Its details must be managed there.</p>}
          </li>)}</ul>
        </>}
        {role === "teacher" && <details className="border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Schedule a live class</summary>
          <form className="mt-4 grid gap-3" onSubmit={event => { event.preventDefault(); void schedule(); }}>
            <fieldset disabled={busy} className="grid gap-3">
              <label className="text-sm">Meeting title<input required minLength={3} maxLength={200} value={title} onChange={event => setTitle(event.target.value)} className="mt-1 block w-full border bg-background p-2"/></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Starts ({timezone})<input required type="datetime-local" value={startsLocal} onChange={event => setStartsLocal(event.target.value)} className="mt-1 block w-full min-w-0 border bg-background p-2"/></label>
                <label className="text-sm">Ends ({timezone})<input required type="datetime-local" value={endsLocal} onChange={event => setEndsLocal(event.target.value)} className="mt-1 block w-full min-w-0 border bg-background p-2"/></label>
              </div>
              <label className="text-sm">HTTPS meeting link<input required type="url" maxLength={2048} value={url} onChange={event => setUrl(event.target.value)} className="mt-1 block w-full border bg-background p-2"/></label>
              <p className="text-xs text-muted-foreground">Create the meeting with your provider first. Scheduling here creates one canonical class calendar event; use Calendar to reschedule or cancel it.</p>
              <Button className="justify-self-start">Schedule live class</Button>
            </fieldset>
          </form>
        </details>}
        <MutationFeedback state={mutation} pendingMessage="Saving class calendar change..."/>
      </div>}
    </div>
  </section>;
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError } from "@/components/ui/field";
import { ActionDialog, EmptyState, LocalDateTimeField, MutationFeedback, StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { dateTimeInputValue, formatTimestamp } from "@/modules/calendar/timezone";
import { siteLocalTimeToIso } from "@/modules/calendar/site-local-time";
import {
  createCanonicalGroupSession, recordCanonicalGroupAttendance,
  reviseCanonicalGroupSession, rsvpCanonicalGroupSession,
} from "@/modules/study-groups/canonical-sessions.functions";
import type {
  GroupPanelRecord, GroupPanelRole, GroupPanelAvailability,
  GroupPanelRun, GroupPanelMutation,
} from "./group-panel-contracts";

/** Self-contained session workspace shared by study-group pages.
 * Server commands remain authoritative for scheduling, RSVP and attendance.
 * A scheduled session does not imply presence or approval.
 */
export function GroupSessionsPanel({ group, role, availability, busy, run, mutation, selectedSession }: {
  group: GroupPanelRecord; role: GroupPanelRole; availability: GroupPanelAvailability; busy: boolean; run: GroupPanelRun;
  mutation: GroupPanelMutation; selectedSession?: string;
}) {
  const [scheduling, setScheduling] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [reschedule, setReschedule] = useState<{ id: string; title: string; start: string; end: string } | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; title: string } | null>(null);
  const now = new Date();
  const unknownSession = Boolean(selectedSession) &&
    !group.sessions.some(session => session.id === selectedSession);
  return <WorkspacePanel title="Sessions"
    description={`Times shown in ${group.timezone}.`}
    actions={role === "teacher" && <Button variant="outline" size="sm" type="button" disabled={busy || !availability.writesEnabled}
      onClick={() => setScheduling(open => !open)}>
      {scheduling ? "Close scheduler" : "Schedule session"}</Button>}>
    <div className="space-y-3">
      {unknownSession && <WorkspaceNotice tone="danger">This session is unavailable in this study group.</WorkspaceNotice>}
      {role === "teacher" && scheduling && <form noValidate
        className="grid gap-3 border p-4 sm:grid-cols-2"
        onSubmit={event => {
          event.preventDefault();
          setAttempted(true);
          if (sessionTitle.trim().length < 3 || !starts || !ends || ends <= starts) return;
          void run(async () => {
            await createCanonicalGroupSession({ data: {
              groupId: group.id, title: sessionTitle, agenda,
              startsAt: siteLocalTimeToIso(starts, group.timezone),
              endsAt: siteLocalTimeToIso(ends, group.timezone),
            } });
            setSessionTitle(""); setAgenda(""); setStarts(""); setEnds("");
            setScheduling(false); setAttempted(false);
          }, "Session scheduled.");
        }}>
        <Field label="Session title" className="text-sm" required
          error={attempted && sessionTitle.trim().length < 3 ? "Enter a session title with at least 3 characters." : undefined}>
          <Input minLength={3} maxLength={150} value={sessionTitle}
            onChange={event => setSessionTitle(event.target.value)} />
        </Field>
        <Field label="Agenda" className="text-sm">
          <Input value={agenda} onChange={event => setAgenda(event.target.value)} />
        </Field>
        <LocalDateTimeField label="Start" timezone={group.timezone} value={starts} onChange={setStarts} required disabled={busy} />
        <LocalDateTimeField label="End" timezone={group.timezone} value={ends} onChange={setEnds} required disabled={busy} />
        {attempted && (!starts || !ends || ends <= starts) &&
          <FieldError className="sm:col-span-2">Choose an end time later than the start.</FieldError>}
        <div><Button type="submit" disabled={busy}>Schedule session</Button></div>
      </form>}
      {group.sessions.map(session => {
        const upcoming = !session.cancelled && new Date(session.startsAt) > now;
        const past = !session.cancelled && new Date(session.startsAt) <= now;
        return <div key={session.id} aria-current={selectedSession === session.id ? "true" : undefined}
          className={selectedSession === session.id ? "border-2 border-primary bg-card p-3" : "border border-border bg-card p-3"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{session.title}</p>
            {session.cancelled && <StatusBadge tone="danger">Cancelled</StatusBadge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatTimestamp(session.startsAt, group.timezone)} – {formatTimestamp(session.endsAt, group.timezone)}
            {" · "}{session.location || "Location to be confirmed"}
          </p>
          {session.agenda && <p className="mt-2 text-sm">{session.agenda}</p>}
          {role === "student" && upcoming && <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs">Your RSVP: {session.rsvp ?? "not selected"}</span>
            {(["going", "maybe", "declined"] as const).map(value =>
              <Button variant="outline" size="sm" type="button" key={value} disabled={busy || !availability.writesEnabled}
                onClick={() => void run(() => rsvpCanonicalGroupSession({
                  data: { sessionId: session.id, rsvp: value },
                }), "RSVP updated.")} aria-pressed={session.rsvp === value}>{value}</Button>)}
          </div>}
          {role === "teacher" && upcoming && <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" type="button" disabled={busy || !availability.writesEnabled}
              onClick={() => setReschedule({
                id: session.id, title: session.title,
                start: dateTimeInputValue(session.startsAt, group.timezone),
                end: dateTimeInputValue(session.endsAt, group.timezone),
              })}>Reschedule</Button>
            <Button variant="destructive" size="sm" type="button" disabled={busy || !availability.writesEnabled}
              onClick={() => setCancelling({ id: session.id, title: session.title })}>Cancel session</Button>
          </div>}
          {role === "teacher" && past && <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold">Attendance</p>
            {group.roster.map(student => {
              const attendance = session.attendance.find(row => row.personId === student.personId);
              return <div key={student.personId} className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-xs">{student.studentName}
                  {" · "}{attendance?.attended === true ? "Present"
                    : attendance?.attended === false ? "Absent" : "Not recorded"}</span>
                {([true, false] as const).map(attended =>
                  <Button variant="outline" size="sm" type="button" key={String(attended)} disabled={busy || !availability.writesEnabled}
                    onClick={() => void run(() => recordCanonicalGroupAttendance({ data: {
                      sessionId: session.id, studentPersonId: student.personId, attended,
                    } }), "Attendance saved.")} aria-pressed={attendance?.attended === attended}>{attended ? "Present" : "Absent"}</Button>)}
              </div>;
            })}
            {group.roster.length === 0 &&
              <p className="text-xs text-muted-foreground">No approved students to mark.</p>}
          </div>}
        </div>;
      })}
      {group.sessions.length === 0 && <EmptyState title="No sessions scheduled."
        description={role === "teacher" ? "Schedule the first session for this group."
          : "The facilitator has not scheduled a session yet."} />}
    </div>
    {reschedule && <ActionDialog open title={`Reschedule ${reschedule.title}`} confirmLabel="Save session time"
      description={`Enter times in ${group.timezone}. Nonexistent or ambiguous daylight-saving times are not accepted.`}
      pending={mutation.pending} pendingLabel="Saving session time…" confirmDisabled={busy || !availability.writesEnabled}
      onClose={() => setReschedule(null)}
      onConfirm={() => void mutation.run(() => reviseCanonicalGroupSession({ data: {
        sessionId: reschedule.id, action: "reschedule",
        startsAt: siteLocalTimeToIso(reschedule.start, group.timezone),
        endsAt: siteLocalTimeToIso(reschedule.end, group.timezone),
      } }), {
        successMessage: "Session rescheduled.",
        commandErrorMessage: "Unable to save group change.",
      }).then(outcome => {
        if (outcome.status === "saved" || outcome.status === "refresh-failed") setReschedule(null);
      })}>
      <LocalDateTimeField label="New start" timezone={group.timezone} value={reschedule.start}
        onChange={start => setReschedule(current => current && { ...current, start })} required />
      <LocalDateTimeField label="New end" timezone={group.timezone} value={reschedule.end}
        onChange={end => setReschedule(current => current && { ...current, end })} required />
      <MutationFeedback state={mutation} pendingMessage="Saving group change..." />
    </ActionDialog>}
    {cancelling && <ActionDialog open destructive title={`Cancel ${cancelling.title}?`}
      description="This will cancel the scheduled group session and update its calendar event. It will not erase historical attendance."
      confirmLabel="Cancel session" pending={mutation.pending} pendingLabel="Cancelling session…"
      confirmDisabled={busy || !availability.writesEnabled}
      onClose={() => setCancelling(null)}
      onConfirm={() => void mutation.run(() => reviseCanonicalGroupSession({ data: {
        sessionId: cancelling.id, action: "cancel",
      } }), {
        successMessage: "Session cancelled.",
        commandErrorMessage: "Unable to cancel session.",
      }).then(outcome => {
        if (outcome.status === "saved" || outcome.status === "refresh-failed") setCancelling(null);
      })}>
      <MutationFeedback state={mutation} pendingMessage="Cancelling session…" />
    </ActionDialog>}
  </WorkspacePanel>;
}

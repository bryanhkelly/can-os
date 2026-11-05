import { useEffect, useRef, useState } from "react";
import {
  cancelTeacherConferenceBooking,
  completeTeacherConference,
  createTeacherConferenceSeries,
  getTeacherConferences,
  queueTeacherConferenceReminder,
} from "@/modules/conferences/conference.functions";
import { conferenceOutcomeProblem } from "@/modules/conferences/eligibility";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { QueryState } from "@/components/workspace/query-state";
import { ActionDialog } from "@/components/workspace/action-dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Data = Awaited<ReturnType<typeof getTeacherConferences>>;
type Publication = {
  seriesId: string; title: string; startsAt: string; endsAt: string; slotMinutes: number;
};
type CompletionTarget = {
  booking: Data["bookings"][number];
  outcome: "held" | "no_show";
};

const pad = (value: number) => String(value).padStart(2, "0");
/** Local wall-time value for <input type="datetime-local">. */
function localInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultWindow() {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { startsAt: localInputValue(start), endsAt: localInputValue(end) };
}

/**
 * Teacher office-hour conferences: open a bookable window, then record
 * outcomes, queue guardian reminders or cancel bookings. All writes go
 * through the conference service's capability and scope checks.
 */
export function TeacherConferencePanel() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("Family office hours");
  const [range, setRange] = useState(defaultWindow);
  const [slotMinutes, setSlotMinutes] = useState(20);
  const [now, setNow] = useState(() => new Date());
  const [cancelTarget, setCancelTarget] = useState<Data["bookings"][number] | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [completionTarget, setCompletionTarget] = useState<CompletionTarget | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"staff_private" | "family_visible">("staff_private");
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDescription, setFollowUpDescription] = useState("");
  const publications = useRef(new Map<string, Publication>());

  async function loadConferences() {
    const result = await getTeacherConferences();
    if (!result.connected) throw new Error("Conference scheduling unavailable");
    return result;
  }
  async function refresh() {
    try {
      setData(await loadConferences());
      setLoadError("");
    } catch (error) {
      setLoadError(mutationErrorMessage(error, "Conference scheduling is unavailable for this account."));
      throw error;
    }
  }
  const mutation = useMutationFeedback(refresh);
  const busy = mutation.pending || mutation.refreshFailed;
  useEffect(() => {
    let active = true;
    void loadConferences().then(result => {
      if (active) { setData(result); setLoadError(""); }
    }).catch(error => {
      if (active) setLoadError(mutationErrorMessage(error, "Conference scheduling is unavailable for this account."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function perform(operation: () => Promise<unknown>, success: string) {
    return mutation.run(operation, {
      successMessage: success,
      commandErrorMessage: "Unable to save conference change.",
      refreshErrorMessage: "Conference scheduling could not refresh. Retry refresh before making another change.",
    });
  }
  async function retryLoad() {
    setLoading(true);
    try { await refresh(); }
    catch { /* The query state already contains the safe, retryable load error. */ }
    finally { setLoading(false); }
  }
  function beginCompletion(booking: Data["bookings"][number], outcome: CompletionTarget["outcome"]) {
    setCompletionNote("");
    setNoteVisibility("staff_private");
    setCreateFollowUp(false);
    setFollowUpTitle(`Follow up with ${booking.studentName}`);
    setFollowUpDescription("");
    setCompletionTarget({ booking, outcome });
  }
  async function saveCompletion() {
    if (!completionTarget) return;
    const note = completionNote.trim();
    const followUp = followUpTitle.trim();
    const result = await perform(() => completeTeacherConference({ data: {
      bookingId: completionTarget.booking.id,
      outcome: completionTarget.outcome,
      ...(note ? { note, noteVisibility } : {}),
      ...(createFollowUp ? {
        followUp: {
          title: followUp,
          ...(followUpDescription.trim() ? { description: followUpDescription.trim() } : {}),
        },
      } : {}),
    } }), completionTarget.outcome === "held" ? "Appointment marked as held." : "No-show recorded.");
    if (result.status === "saved" || result.status === "refresh-failed") setCompletionTarget(null);
  }

  const format = (stamp: string) => new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(stamp));

  return <section className="mt-10" aria-label="Family conferences">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Family conferences</p>
    <p className="mt-2 text-sm text-muted-foreground">
      Open bookable office-hour windows for your students' guardians, then record how each appointment went.
    </p>
    {!cancelTarget && <MutationFeedback state={mutation} pendingMessage="Saving conference change..." className="mt-3" />}

    {!data && <QueryState loading={loading ? "Loading conference scheduling..." : undefined}
      error={!loading ? loadError || "Conference scheduling is unavailable for this account." : undefined}
      onRetry={() => void retryLoad()} retrying={loading}/>}
    {data?.connected && <>
      <form className="mt-4 grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-2" aria-label="Open office-hour window"
        onSubmit={event => {
          event.preventDefault();
          void perform(async () => {
            const payload = {
              title: title.trim(),
              startsAt: new Date(range.startsAt).toISOString(),
              endsAt: new Date(range.endsAt).toISOString(),
              slotMinutes,
            };
            const key = JSON.stringify(payload);
            // Keep each uncertain payload's identity even when the form is edited.
            const request = publications.current.get(key) ?? { ...payload, seriesId: crypto.randomUUID() };
            publications.current.set(key, request);
            const result = await createTeacherConferenceSeries({ data: request });
            publications.current.delete(key);
            return result;
          }, "Office-hour window published for guardians.");
        }}>
        <fieldset disabled={busy} aria-busy={mutation.pending} className="contents">
        <Field label="Title" required className="sm:col-span-2">
          <Input required minLength={3} value={title} onChange={event => setTitle(event.target.value)} />
        </Field>
        <Field label="Window starts" required>
          <Input required type="datetime-local" value={range.startsAt}
            onChange={event => setRange(value => ({ ...value, startsAt: event.target.value }))} />
        </Field>
        <Field label="Window ends" required>
          <Input required type="datetime-local" value={range.endsAt}
            onChange={event => setRange(value => ({ ...value, endsAt: event.target.value }))} />
        </Field>
        <Field label="Minutes per appointment" required>
          <Input required type="number" min={5} max={120} step={5} value={slotMinutes}
            onChange={event => setSlotMinutes(Number(event.target.value))} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={busy}>
            Publish bookable window
          </Button>
        </div>
        </fieldset>
      </form>

      <div className="mt-6 grid gap-3">
        {data.series.length === 0 && <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          No upcoming office-hour windows yet.
        </p>}
        {data.series.map(series => <article key={series.id} className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{series.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {format(series.startsAt)} – {format(series.endsAt)} · {series.slotMinutes}-minute appointments ·{" "}
            {series.availableCount} of {series.slotCount} still open
          </p>
        </article>)}
      </div>

      {data.bookings.length > 0 && <div className="mt-6 grid gap-3" aria-label="Conference bookings">
        <p className="text-xs text-muted-foreground">Up to 50 appointments, with pending bookings first; includes the past 30 days.
          Record held appointments only after they start, and no-shows after they end.</p>
        {data.bookings.map(booking => <article key={booking.id} className="rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{booking.studentName}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {booking.seriesTitle} · {format(booking.startsAt)} · {booking.status === "booked" ? "Confirmed" : booking.status}
              </p>
            </div>
            {booking.status === "booked" && <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy || conferenceOutcomeProblem({
                  status: booking.status, outcome: "held",
                  startsAt: new Date(booking.startsAt), endsAt: new Date(booking.endsAt),
                  now,
                }) !== null}
                onClick={() => beginCompletion(booking, "held")}>
                Mark held
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy || conferenceOutcomeProblem({
                  status: booking.status, outcome: "no_show",
                  startsAt: new Date(booking.startsAt), endsAt: new Date(booking.endsAt),
                  now,
                }) !== null}
                onClick={() => beginCompletion(booking, "no_show")}>
                No-show
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy}
                onClick={() => void perform(() => queueTeacherConferenceReminder({ data: { bookingId: booking.id } }), "Reminder queued for the guardian.")}>
                Schedule reminder
              </Button>
              <Button type="button" variant="destructive" size="sm" disabled={busy}
                onClick={() => { setCancelSubmitting(false); setCancelTarget(booking); }}>
                Cancel booking
              </Button>
            </div>}
            {booking.notes.map(note => <p key={note.id} className="mt-3 rounded-lg border p-3 text-sm">
              <span className="font-semibold">{note.visibility === "family_visible" ? "Family-visible summary" : "Staff-private note"}</span>
              <span className="ml-2">{note.note}</span>
            </p>)}
          </div>
        </article>)}
      </div>}
    </>}
    <ActionDialog open={cancelTarget !== null}
      title={`Cancel appointment for ${cancelTarget?.studentName ?? "this family"}?`}
      description={cancelTarget
        ? `Cancel ${cancelTarget.seriesTitle} on ${format(cancelTarget.startsAt)}? The appointment will be canceled and its slot will open for another family.`
        : "Cancel this appointment? The slot will open for another family."}
      confirmLabel="Cancel booking" destructive pending={mutation.pending} confirmDisabled={busy}
      onClose={() => { setCancelTarget(null); setCancelSubmitting(false); }}
      onConfirm={() => {
        if (!cancelTarget) return;
        setCancelSubmitting(true);
        void perform(() => cancelTeacherConferenceBooking({ data: { bookingId: cancelTarget.id } }),
          "Appointment cancelled and slot reopened.").then(result => {
          if (result.status === "saved" || result.status === "refresh-failed") {
            setCancelTarget(null);
            setCancelSubmitting(false);
          } else if (result.status !== "failed") setCancelSubmitting(false);
        });
      }}>
      {cancelSubmitting && <MutationFeedback state={mutation} pendingMessage="Canceling appointment..." />}
    </ActionDialog>
    <ActionDialog open={completionTarget !== null}
      title={completionTarget?.outcome === "held" ? "Record conference outcome" : "Record no-show"}
      description={completionTarget
        ? `Record the outcome for ${completionTarget.booking.studentName}'s ${completionTarget.booking.seriesTitle} appointment. Notes default to staff-private; share only an appropriate summary with the family.`
        : "Record this conference outcome."}
      confirmLabel={completionTarget?.outcome === "held" ? "Mark held" : "Record no-show"}
      pending={mutation.pending}
      confirmDisabled={busy || (createFollowUp && followUpTitle.trim().length < 3) ||
        (completionTarget !== null && conferenceOutcomeProblem({
          status: completionTarget.booking.status,
          outcome: completionTarget.outcome,
          startsAt: new Date(completionTarget.booking.startsAt),
          endsAt: new Date(completionTarget.booking.endsAt),
          now,
        }) !== null)}
      onClose={() => setCompletionTarget(null)}
      onConfirm={() => void saveCompletion()}>
      <Field label="Conference note">
        <Textarea maxLength={2000} rows={3} value={completionNote}
          onChange={event => setCompletionNote(event.target.value)}
        />
      </Field>
      {completionNote.trim() && <Field label="Note visibility">
        <Select value={noteVisibility} onChange={event => setNoteVisibility(event.target.value as typeof noteVisibility)}>
          <option value="staff_private">Staff-private</option>
          <option value="family_visible">Family-visible summary</option>
        </Select>
      </Field>}
      <Label className="flex items-start gap-2 text-sm">
        <Input type="checkbox" checked={createFollowUp}
          onChange={event => setCreateFollowUp(event.target.checked)}
          className="mt-1 h-4 w-4 min-h-0 p-0" />
        <span>Create a follow-up action for this student</span>
      </Label>
      {createFollowUp && <>
        <Field label="Follow-up action" required>
          <Input required minLength={3} maxLength={200} value={followUpTitle}
            onChange={event => setFollowUpTitle(event.target.value)} />
        </Field>
        <Field label="Follow-up details">
          <Textarea maxLength={1500} rows={3} value={followUpDescription}
            onChange={event => setFollowUpDescription(event.target.value)}
          />
        </Field>
        <p className="text-xs text-muted-foreground">This action will appear in the student&apos;s support actions.</p>
      </>}
    </ActionDialog>
  </section>;
}

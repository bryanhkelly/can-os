import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import {
  createSchoolInterestEvent,
  listSchoolInterestEvents,
  recordSchoolInterestEventAttendance,
  rotateSchoolInterestEventLink,
} from "@/modules/enrollment/interest-events.functions";
import { dateTimeInputInTimezone, dateTimeInputValue } from "@/modules/calendar/timezone";
import { z } from "zod";
import { siteTimezoneSchema } from "@/domain/site-timezone";

export const Route = createFileRoute("/operations/interest-events")({
  validateSearch: (search: Record<string, unknown>) => ({
    siteId: typeof search.siteId === "string" ? z.string().uuid().parse(search.siteId) : undefined,
    programId: typeof search.programId === "string" ? z.string().uuid().parse(search.programId) : undefined,
  }),
  loader: safeLoader(() => listSchoolInterestEvents(), {
    authMessage: "Sign in with a site administrator or registrar grant to manage school events.",
  }),
  component: InterestEventsPage,
});

type Data = Awaited<ReturnType<typeof listSchoolInterestEvents>>;

function InterestEventsPage() {
  const result = Route.useLoaderData();
  if (!result.ok) {
    return <LoaderFailure eyebrow="School launch" title="Interest Events" outcome={result} />;
  }
  return <InterestEventsWorkspace data={result.data} />;
}

export function InterestEventsWorkspace({ data }: { data: Data }) {
  const router = useRouter();
  const search = Route.useSearch();
  const [programId, setProgramId] = useState(
    data.programs.find(program => program.id === search.programId)?.id ?? data.programs[0]?.id ?? "",
  );
  const selectedProgram = data.programs.find(program => program.id === programId);
  const timezone = siteTimezoneSchema.safeParse(selectedProgram?.timezone).success ? selectedProgram!.timezone : null;
  const [title, setTitle] = useState("Parent information session");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"information_session" | "open_house" | "campus_tour" | "family_experience" | "other">("information_session");
  const [visibility, setVisibility] = useState<"public" | "invitation_only">("invitation_only");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState(() => timezone ? dateTimeInputValue(new Date(Date.now() + 7 * 86400000), timezone) : "");
  const [endsAt, setEndsAt] = useState(() => timezone ? dateTimeInputValue(new Date(Date.now() + 7 * 86400000 + 3600000), timezone) : "");
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);
  const [timeValidationError, setTimeValidationError] = useState("");
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);setTimeValidationError("");
    if (busy || !selectedProgram || !timezone || title.trim().length<3 || !startsAt || !endsAt) return;
    let startInstant: string;
    let endInstant: string;
    try {
      startInstant=dateTimeInputInTimezone(startsAt, timezone, "reject");
      endInstant=dateTimeInputInTimezone(endsAt, timezone, "reject");
      if(Date.parse(endInstant)<=Date.parse(startInstant)){
        setTimeValidationError("The event end must be later than its start.");return;
      }
    } catch {
      setTimeValidationError("Choose a valid local time. Ambiguous or nonexistent daylight-saving times are not accepted.");
      return;
    }
    await mutation.run(async () => {
      const result = await createSchoolInterestEvent({ data: {
        requestId: crypto.randomUUID(),
        programId,
        title:title.trim(),
        description,
        kind,
        startsAt: startInstant,
        endsAt: endInstant,
        timezone,
        location,
        visibility,
      } });
      const rsvpUrl = result.rsvpUrl;
      if (rsvpUrl) setShareLinks(current => ({ ...current, [result.eventId]: rsvpUrl }));
      return result;
    }, {
      successMessage: "Interest event created and added to the school calendar.",
      commandErrorMessage: "Unable to create the interest event.",
    });
  }

  async function generateLink(eventId: string) {
    if (busy) return;
    await mutation.run(async () => {
      const result = await rotateSchoolInterestEventLink({ data: { eventId } });
      setShareLinks(current => ({ ...current, [eventId]: result.rsvpUrl }));
      return result;
    }, {
      successMessage: "A new invitation-only RSVP link is ready. Any previous link has been disabled.",
      commandErrorMessage: "Unable to generate an invitation link.",
    });
  }

  async function recordAttendance(registrationId: string, attendanceStatus: "attended" | "no_show") {
    if (busy) return;
    await mutation.run(() => recordSchoolInterestEventAttendance({ data: {
      registrationId,
      attendanceStatus,
    } }), {
      successMessage: attendanceStatus === "attended" ? "Family checked in." : "Family marked as a no-show.",
      commandErrorMessage: "Unable to record event attendance.",
    });
  }

  return <WorkspaceShell
    width="wide"
    eyebrow="School launch"
    title="Interest Events"
    subtitle="Create a parent information session, open house, campus tour, or family experience. RSVPs create or reuse an adult-only interest record; they do not create an application or enroll a student."
    actions={<Link to="/operations/launch" className="rounded border px-3 py-2 text-sm">Launch dashboard</Link>}
  >
    <MutationFeedback state={mutation} pendingMessage="Saving event..." />
    <form noValidate onSubmit={event => void submit(event)} className="mt-6 space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Create an interest event</h2>
      {!data.programs.length && <p role="status" className="text-sm">No school programs are available in your authorized scope.</p>}
      <Field label="School Program" required
        error={attempted&&!selectedProgram?"Choose a Program with a valid Site timezone.":undefined}>
        <Select value={programId} onChange={event => {
          const next = data.programs.find(program => program.id === event.target.value);
          setProgramId(event.target.value);
          if (next?.timezone) {
            setStartsAt(dateTimeInputValue(new Date(Date.now() + 7 * 86400000), next.timezone));
            setEndsAt(dateTimeInputValue(new Date(Date.now() + 7 * 86400000 + 3600000), next.timezone));
          } else { setStartsAt(""); setEndsAt(""); }
        }}>
          {data.programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
        </Select>
      </Field>
      <Field label="Event name" required
        error={attempted&&title.trim().length<3?"Enter an event name with at least 3 characters.":undefined}>
        <Input minLength={3} maxLength={160} value={title} onChange={event => setTitle(event.target.value)} />
      </Field>
      <Field label="Event type" required>
        <Select value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
          <option value="information_session">Parent information session</option>
          <option value="open_house">Open house</option>
          <option value="campus_tour">Campus tour</option>
          <option value="family_experience">Family experience</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Description">
        <Textarea rows={3} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" required error={attempted&&!startsAt?"Choose an event start time.":undefined}>
          <Input disabled={!timezone} type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} />
        </Field>
        <Field label="Ends" required error={attempted&&(!endsAt||(Boolean(startsAt&&endsAt)&&endsAt<=startsAt))?"Choose an end time later than the start time.":undefined}>
          <Input disabled={!timezone} type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} />
        </Field>
      </div>
      {timeValidationError&&<FieldError>{timeValidationError}</FieldError>}
      {timezone ? <p className="text-xs text-muted-foreground">Times use the selected Site's timezone: {timezone}.</p>
        : <p role="alert" className="text-sm">The school timezone is unavailable. <Link to="/operations/launch" search={{ siteId: selectedProgram?.siteId, programId }} className="underline">Configure school timezone</Link></p>}
      <Field label="Location or meeting details">
        <Input maxLength={300} value={location} onChange={event => setLocation(event.target.value)} />
      </Field>
      <Field label="Who can RSVP?" required>
        <Select value={visibility} onChange={event => setVisibility(event.target.value as typeof visibility)}>
          <option value="invitation_only">Invitation-only link</option>
          <option value="public">Public RSVP (requires the current published Site and Program)</option>
        </Select>
      </Field>
      <Button type="submit" disabled={busy || !timezone}>
        Create event
      </Button>
    </form>

    <section className="mt-8 space-y-4" aria-labelledby="saved-events">
      <h2 id="saved-events" className="text-lg font-semibold">Saved events and RSVPs</h2>
      {data.events.map(event => <article key={event.id} className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{event.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{event.siteName} · {event.programName} · {event.visibility.replace("_", " ")}</p>
            <p className="mt-1 text-sm">{new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium", timeStyle: "short", timeZone: event.timezone,
            }).format(new Date(event.startsAt))} ({event.timezone})</p>
            {event.location && <p className="mt-1 text-sm">{event.location}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {event.visibility === "invitation_only"
              ? <Button type="button" variant="outline" disabled={busy} onClick={() => void generateLink(event.id)}>Generate invite link</Button>
              : event.rsvpUrl && <a href={event.rsvpUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm underline">Open public RSVP</a>}
            <Link to="/calendar" search={{ event: undefined, date: undefined, section: undefined, source: "site", view: "agenda" }} className="rounded border px-3 py-2 text-sm underline">School calendar</Link>
          </div>
        </div>
        {shareLinks[event.id] && <p className="mt-3 break-all rounded bg-muted p-3 text-sm">
          Invite-only RSVP link: <a className="underline" href={shareLinks[event.id]}>{shareLinks[event.id]}</a>
        </p>}
        <h4 className="mt-4 text-sm font-semibold">RSVP and check-in list ({event.registrations.length})</h4>
        {event.registrations.length
          ? <ul className="mt-2 divide-y">{event.registrations.map(registration => {
            const eventStarted = Date.now() >= new Date(event.startsAt).getTime();
            const eventEnded = event.endsAt && Date.now() >= new Date(event.endsAt).getTime();
            return <li key={registration.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0 break-words">
              <p>{registration.firstName} {registration.lastName} · <a className="underline" href={`mailto:${encodeURIComponent(registration.email)}`}>{registration.email}</a></p>
              <p className="mt-1 text-xs text-muted-foreground">
                {registration.attendanceStatus
                  ? `${registration.attendanceStatus === "attended" ? "Attended" : "No-show"}${registration.attendanceMarkedAt ? ` · recorded ${new Date(registration.attendanceMarkedAt).toLocaleString()}` : ""}`
                  : "Registered · attendance not recorded"}
              </p>
            </div>
            {!registration.attendanceStatus && <div className="flex flex-wrap gap-2">
              {eventStarted && <Button type="button" size="sm" variant="outline" disabled={busy}
                onClick={() => void recordAttendance(registration.id, "attended")}>Check in</Button>}
              {eventEnded && <Button type="button" size="sm" variant="outline" disabled={busy}
                onClick={() => void recordAttendance(registration.id, "no_show")}>Mark no-show</Button>}
            </div>}
            </li>;
          })}</ul>
          : <p className="mt-2 text-sm text-muted-foreground">No RSVPs yet.</p>}
      </article>)}
      {!data.events.length && <p className="rounded border p-4 text-sm">No interest events have been created for your authorized programs.</p>}
    </section>
  </WorkspaceShell>;
}

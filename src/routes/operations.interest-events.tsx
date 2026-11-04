import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import {
  createSchoolInterestEvent,
  listSchoolInterestEvents,
  rotateSchoolInterestEventLink,
} from "@/modules/enrollment/interest-events.functions";
import { dateTimeInputInTimezone, dateTimeInputValue } from "@/modules/calendar/timezone";
import { z } from "zod";

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

function InterestEventsWorkspace({ data }: { data: Data }) {
  const router = useRouter();
  const search = Route.useSearch();
  const [programId, setProgramId] = useState(
    data.programs.find(program => program.id === search.programId)?.id ?? data.programs[0]?.id ?? "",
  );
  const selectedProgram = data.programs.find(program => program.id === programId);
  const timezone = selectedProgram?.timezone ?? "America/Los_Angeles";
  const [title, setTitle] = useState("Parent information session");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"information_session" | "open_house" | "campus_tour" | "family_experience" | "other">("information_session");
  const [visibility, setVisibility] = useState<"public" | "invitation_only">("invitation_only");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState(() => dateTimeInputValue(new Date(Date.now() + 7 * 86400000), timezone));
  const [endsAt, setEndsAt] = useState(() => dateTimeInputValue(new Date(Date.now() + 7 * 86400000 + 3600000), timezone));
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !selectedProgram) return;
    await mutation.run(async () => {
      const result = await createSchoolInterestEvent({ data: {
        requestId: crypto.randomUUID(),
        programId,
        title,
        description,
        kind,
        startsAt: dateTimeInputInTimezone(startsAt, timezone, "reject"),
        endsAt: dateTimeInputInTimezone(endsAt, timezone, "reject"),
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

  return <WorkspaceShell
    width="wide"
    eyebrow="School launch"
    title="Interest Events"
    subtitle="Create a parent information session, open house, campus tour, or family experience. RSVPs create or reuse an adult-only interest record; they do not create an application or enroll a student."
    actions={<Link to="/operations/launch" className="rounded border px-3 py-2 text-sm">Launch dashboard</Link>}
  >
    <MutationFeedback state={mutation} pendingMessage="Saving event..." />
    <form onSubmit={event => void submit(event)} className="mt-6 space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Create an interest event</h2>
      {!data.programs.length && <p role="status" className="text-sm">No school programs are available in your authorized scope.</p>}
      <label className="block text-sm font-medium">School Program
        <select required value={programId} onChange={event => {
          const next = data.programs.find(program => program.id === event.target.value);
          setProgramId(event.target.value);
          if (next) {
            setStartsAt(dateTimeInputValue(new Date(Date.now() + 7 * 86400000), next.timezone));
            setEndsAt(dateTimeInputValue(new Date(Date.now() + 7 * 86400000 + 3600000), next.timezone));
          }
        }} className="mt-2 w-full rounded border bg-background p-3">
          {data.programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Event name
        <input required minLength={3} maxLength={160} value={title} onChange={event => setTitle(event.target.value)} className="mt-2 w-full rounded border bg-background p-3" />
      </label>
      <label className="block text-sm font-medium">Event type
        <select value={kind} onChange={event => setKind(event.target.value as typeof kind)} className="mt-2 w-full rounded border bg-background p-3">
          <option value="information_session">Parent information session</option>
          <option value="open_house">Open house</option>
          <option value="campus_tour">Campus tour</option>
          <option value="family_experience">Family experience</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="block text-sm font-medium">Description
        <textarea rows={3} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} className="mt-2 w-full rounded border bg-background p-3" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Starts
          <input required type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} className="mt-2 w-full rounded border bg-background p-3" />
        </label>
        <label className="block text-sm font-medium">Ends
          <input required type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} className="mt-2 w-full rounded border bg-background p-3" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Times use the selected Site's timezone: {timezone}.</p>
      <label className="block text-sm font-medium">Location or meeting details
        <input maxLength={300} value={location} onChange={event => setLocation(event.target.value)} className="mt-2 w-full rounded border bg-background p-3" />
      </label>
      <label className="block text-sm font-medium">Who can RSVP?
        <select value={visibility} onChange={event => setVisibility(event.target.value as typeof visibility)} className="mt-2 w-full rounded border bg-background p-3">
          <option value="invitation_only">Invitation-only link</option>
          <option value="public">Public RSVP (requires the current published Site and Program)</option>
        </select>
      </label>
      <button type="submit" disabled={busy || !selectedProgram} className="rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
        Create event
      </button>
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
              ? <button type="button" disabled={busy} onClick={() => void generateLink(event.id)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Generate invite link</button>
              : event.rsvpUrl && <a href={event.rsvpUrl} target="_blank" rel="noreferrer" className="rounded border px-3 py-2 text-sm underline">Open public RSVP</a>}
            <Link to="/calendar" search={{ event: undefined, date: undefined, section: undefined, source: "site", view: "agenda" }} className="rounded border px-3 py-2 text-sm underline">School calendar</Link>
          </div>
        </div>
        {shareLinks[event.id] && <p className="mt-3 break-all rounded bg-muted p-3 text-sm">
          Invite-only RSVP link: <a className="underline" href={shareLinks[event.id]}>{shareLinks[event.id]}</a>
        </p>}
        <h4 className="mt-4 text-sm font-semibold">Registered families ({event.registrations.length})</h4>
        {event.registrations.length
          ? <ul className="mt-2 divide-y">{event.registrations.map(registration => <li key={registration.id} className="py-2 text-sm">
            {registration.firstName} {registration.lastName} · <a className="underline" href={`mailto:${encodeURIComponent(registration.email)}`}>{registration.email}</a>
          </li>)}</ul>
          : <p className="mt-2 text-sm text-muted-foreground">No RSVPs yet.</p>}
      </article>)}
      {!data.events.length && <p className="rounded border p-4 text-sm">No interest events have been created for your authorized programs.</p>}
    </section>
  </WorkspaceShell>;
}

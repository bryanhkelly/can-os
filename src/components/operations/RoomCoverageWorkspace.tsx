import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRoomCoverageWorkspaceFn, createRoomAtSiteFn, saveRoomCoverageFn } from "@/modules/operations/room-coverage.functions";
import { addCalendarDays } from "@/modules/calendar/timezone";
import { roomCoverageOccurs } from "@/domain/room-coverage";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/choice";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { StatusBadge } from "@/components/workspace";

type Model = Awaited<ReturnType<typeof getRoomCoverageWorkspaceFn>>;
type Schedule = Model["schedules"][number];
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** One authorized room registry and schedule service, reused across Prepare. */
export function RoomCoverageWorkspace({ siteId, view = "all" }: {
  siteId?: string;
  view?: "all" | "rooms" | "schedules";
}) {
  const query = useQuery({ queryKey: ["room-coverage", siteId ?? "own"],
    queryFn: () => getRoomCoverageWorkspaceFn({ data: siteId ? { siteId } : {} }), retry: false });
  const feedback = useMutationFeedback(() => query.refetch({ throwOnError: true }));
  const [roomId, setRoomId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [roomAttempted, setRoomAttempted] = useState(false);
  const busy = feedback.pending || feedback.refreshFailed;
  const model = query.data;
  return <section aria-label={view === "rooms" ? "Site physical rooms" :
    view === "schedules" ? "Existing school Program room coverage" : "All-day room coverage"}
    className="mt-6 border border-border bg-card p-5">
    <h2 className="font-serif text-2xl">{view === "rooms"
      ? "Physical rooms & occupancy capacity"
      : view === "schedules" ? "Facilitator coverage & room schedules"
      : model?.canManage ? "All-day room coverage" : "My assigned room coverage"}</h2>
    {view === "rooms" ? <p className="mt-2 text-sm">
      Record physical rooms and self-reported occupancy limits for this Site.
      Accessibility, equipment and building-use verification remain separate.
    </p> : <p className="mt-2 text-sm">
      Existing school Program room coverage assigns onsite facilitators while
      learners attend Courses. Teaching assignments remain separate.
    </p>}
    {view !== "rooms" && <p className="mt-2 text-sm text-muted-foreground">A saved assignment is a plan, not verified arrival,
      continuous supervision, safety approval or permission to open. Independently reviewed daily room
      plans, qualified primary and backup adults, occupancy and school-calendar checks still apply.
      Breaks or absences require an approved coverage handoff; report interruptions rather than assuming coverage continues.</p>}
    {view !== "rooms" && <p className="mt-2 text-sm text-muted-foreground">For standalone schools, this is planning only:
      the existing reviewed daily supervision and witnessed-presence workflow supports independently
      church-hosted CAN programs. Saving a room assignment does not activate that workflow for a standalone school.</p>}
    {query.isPending && <p role="status" className="mt-3">Loading room coverage...</p>}
    {query.error && <div role="alert" className="mt-3">
      {mutationErrorMessage(query.error, "Room coverage is unavailable.")}
      <Button type="button" variant="outline" onClick={() => void query.refetch()}>Retry room coverage</Button>
    </div>}
    {model && <>
      <p className="mt-3 text-sm">School timezone: {model.timezone}</p>
      {view === "rooms" && <div className="mt-4 space-y-2">
        <h3 className="font-semibold">Recorded rooms ({model.rooms.length})</h3>
        {!model.rooms.length && <p className="text-sm text-muted-foreground">
          No rooms are recorded yet. Add a room and its occupancy limit below.
        </p>}
        {model.rooms.map(room => <div key={room.id}
          className="flex flex-wrap items-center justify-between gap-3 border p-3 text-sm">
          <span className="font-medium">{room.name}</span>
          <span className="text-muted-foreground">Capacity: {room.capacity}
            {room.retiredAt ? " · retired" : ""}</span>
        </div>)}
      </div>}
      {view !== "rooms" && <>
      {!model.schedules.length && <p role="status" className="mt-3 border border-border bg-muted/30 p-4 text-sm">
         {model.canManage
           ? "No room coverage assignments recorded. Assign an accepted facilitator, backup, room and linked classes before opening the onsite day."
           : "No room coverage assignments recorded for your current Site. Contact your Site Leader to confirm your room, backup adult and assigned classes before supervising learners."}
       </p>}
      <ul className="mt-3 space-y-3">{model.schedules.map(schedule => <li key={schedule.id + ":" + schedule.revision} className="border border-border bg-background p-4">
        <h3 className="font-semibold">{model.rooms.find(room => room.id === schedule.roomId)?.name ?? "Unavailable room"}</h3>
        <p className="mt-1 text-sm">{schedule.weekdays.map(day => days[day]).join(", ")} · {schedule.startsAtLocal}-{schedule.endsAtLocal}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
           <span>{schedule.startsOn} through {schedule.endsOn}</span>
           <StatusBadge tone={roomCoverageOccurs(schedule, model.today) ? "info" : "neutral"}>
             {roomCoverageOccurs(schedule, model.today) ? "Scheduled today" : "Not scheduled today"}
           </StatusBadge>
         </div>
        <p className="mt-1 text-sm">Primary: {model.staff.find(person => person.id === schedule.primaryPersonId)?.name ?? "Identity no longer eligible"} ·
          {" "}Backup: {model.staff.find(person => person.id === schedule.backupPersonId)?.name ?? "Not assigned or no longer eligible"}</p>
        <p className="text-sm">Room occupancy limit: {model.rooms.find(room => room.id === schedule.roomId)?.capacity ?? "Unavailable"}</p>
        <p className="mt-1 text-sm">Courses served: {schedule.sectionIds.map(id => model.classes.find(section => section.id === id)?.title ?? "Unavailable class").join(", ") || "No classes linked yet"}</p>
        {(!schedule.backupPersonId || !schedule.sectionIds.length) && <p role="status" className="mt-2 border-l-2 border-warning px-3 text-sm">
          Setup incomplete: {!schedule.backupPersonId ? "assign a separate qualified backup adult. " : ""}
          {!schedule.sectionIds.length ? "Link the classes whose onsite students use this room." : ""}
        </p>}
        {model.canManage && <details className="mt-3"><summary className="cursor-pointer">Edit room assignment</summary>
          <RoomCoverageForm model={model} schedule={schedule} changed={() => query.refetch({ throwOnError: true })}/>
        </details>}
      </li>)}</ul>
      </>}
      {model.canManage && <>
        {view !== "schedules" && <>
        <h3 className="mt-5 font-semibold">Create a physical room</h3>
        <form noValidate className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={event => {
          event.preventDefault();
          setRoomAttempted(true);
          const roomCapacity = Number(capacity);
          if (name.trim().length < 2 || !Number.isInteger(roomCapacity) || roomCapacity < 1 || roomCapacity > 1000) return;
          void feedback.run(async () => {
            const result = await createRoomAtSiteFn({ data: { siteId: model.siteId, roomId, name: name.trim(), capacity: roomCapacity } });
            setRoomId(crypto.randomUUID()); setName(""); setCapacity("");
            setRoomAttempted(false);
            return result;
          }, { successMessage: "Physical room saved. This is not an inspection or supervision approval.",
            commandErrorMessage: "Unable to save the physical room." });
        }}>
          <Field label="Room name" required error={roomAttempted&&name.trim().length<2?"Enter a room name with at least 2 characters.":undefined}>
            <Input minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} disabled={busy}/>
          </Field>
          <Field label="Occupancy limit" required error={roomAttempted&&(!Number.isInteger(Number(capacity))||Number(capacity)<1||Number(capacity)>1000)?"Enter a whole number from 1 to 1000.":undefined}>
            <Input type="number" min={1} max={1000} value={capacity} onChange={event => setCapacity(event.target.value)} disabled={busy}/>
          </Field>
          <Button type="submit" className="self-end" disabled={busy}>Create room</Button>
        </form>
        <MutationFeedback state={feedback} className="mt-3" pendingMessage="Saving physical room..."/>
        {feedback.refreshFailed && <Button onClick={() => void feedback.retryRefresh()} disabled={feedback.pending}>Refresh saved rooms</Button>}
        </>}
        {view !== "rooms" && <>
        <h3 className="mt-5 font-semibold">Assign all-day room coverage</h3>
        {!model.staff.length && <p role="status" className="mt-2 text-sm">Invite a room facilitator and have them accept before assigning coverage.</p>}
        <RoomCoverageForm key={"new:" + model.schedules.length} model={model} changed={() => query.refetch({ throwOnError: true })}/>
        </>}
      </>}
    </>}
  </section>;
}

function RoomCoverageForm({ model, schedule, changed }: {
  model: Model; schedule?: Schedule; changed: () => Promise<unknown>;
}) {
  const [id] = useState(() => schedule?.id ?? crypto.randomUUID());
  const [roomId, setRoomId] = useState(schedule?.roomId ?? "");
  const [primary, setPrimary] = useState(schedule?.primaryPersonId ?? "");
  const [backup, setBackup] = useState(schedule?.backupPersonId ?? "");
  const [startsOn, setStartsOn] = useState(schedule?.startsOn ?? model.today);
  const [endsOn, setEndsOn] = useState(schedule?.endsOn ?? addCalendarDays(model.today, 90));
  const [start, setStart] = useState(schedule?.startsAtLocal ?? "08:00");
  const [end, setEnd] = useState(schedule?.endsAtLocal ?? "14:00");
  const [weekdays, setWeekdays] = useState(schedule?.weekdays ?? [1, 2, 3, 4, 5]);
  const [sectionIds, setSectionIds] = useState(schedule?.sectionIds ?? []);
  const [attempted, setAttempted] = useState(false);
  const feedback = useMutationFeedback(changed);
  const busy = feedback.pending || feedback.refreshFailed;
  const datesValid = Boolean(startsOn && endsOn && endsOn >= startsOn);
  const timesValid = Boolean(start && end && end > start);
  return <form noValidate className="mt-3 space-y-3" onSubmit={event => {
    event.preventDefault();
    setAttempted(true);
    if (!roomId || !primary || !datesValid || !timesValid || !weekdays.length) return;
    void feedback.run(() => saveRoomCoverageFn({ data: {
      siteId: model.siteId, id, expectedRevision: schedule?.revision ?? null, roomId,
      primaryPersonId: primary, backupPersonId: backup || null, startsOn, endsOn,
      startsAtLocal: start, endsAtLocal: end, weekdays, sectionIds,
    } }), { successMessage: "Room coverage assignment saved. Independent safety and daily-plan checks remain required.",
      commandErrorMessage: "Unable to save room coverage. Verify the dates, identities and conflicting assignments." });
  }}>
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Coverage room" required error={attempted&&!roomId?"Select a room.":undefined}>
        <Select value={roomId} onChange={event => setRoomId(event.target.value)} disabled={busy}>
        <option value="">Select a room</option>{model.rooms.filter(room => !room.retiredAt).map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </Select>
      </Field>
      <Field label="Primary facilitator" required error={attempted&&!primary?"Select an accepted facilitator.":undefined}>
        <Select value={primary} onChange={event => setPrimary(event.target.value)} disabled={busy}>
        <option value="">Select an accepted facilitator</option>{model.staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </Select>
      </Field>
      <Field label="Backup facilitator">
        <Select value={backup} onChange={event => setBackup(event.target.value)} disabled={busy}>
        <option value="">Not assigned - setup incomplete</option>{model.staff.filter(person => person.id !== primary).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </Select>
      </Field>
      <Field label="Coverage starts on" required error={attempted&&!startsOn?"Choose a start date.":undefined}>
        <Input type="date" value={startsOn} onChange={event => setStartsOn(event.target.value)} disabled={busy}/>
      </Field>
      <Field label="Coverage ends on" required error={attempted&&(!endsOn||endsOn<startsOn)?"Choose an end date on or after the start date.":undefined}>
        <Input type="date" value={endsOn} onChange={event => setEndsOn(event.target.value)} disabled={busy}/>
      </Field>
      <Field label="Starts at (school time)" required error={attempted&&!start?"Choose a start time.":undefined}>
        <Input type="time" value={start} onChange={event => setStart(event.target.value)} disabled={busy}/>
      </Field>
      <Field label="Ends at (school time)" required error={attempted&&(!end||end<=start)?"Choose an end time later than the start time.":undefined}>
        <Input type="time" value={end} onChange={event => setEnd(event.target.value)} disabled={busy}/>
      </Field>
    </div>
    <fieldset disabled={busy} className="flex flex-wrap gap-3"><legend className="mb-2 text-sm font-semibold">Coverage weekdays</legend>
      {days.map((day, value) => <Label key={day} className="flex items-center gap-2 text-sm"><Checkbox checked={weekdays.includes(value)}
        onChange={event => setWeekdays(current => event.target.checked ? [...current, value].sort() : current.filter(item => item !== value))}/>{day}</Label>)}
      {attempted&&!weekdays.length&&<FieldError className="w-full">Select at least one coverage weekday.</FieldError>}
    </fieldset>
    <fieldset disabled={busy} className="space-y-2"><legend className="text-sm font-semibold">Classes whose onsite students use this room</legend>
      <p className="text-sm text-muted-foreground">Different simultaneous courses may share this room. Enrollment stays in the original classes; occupancy counts each student once.</p>
      {!model.classes.length && <p role="status" className="text-sm">No onsite classes exist yet. Save the room assignment now, then link classes after academic setup.</p>}
      {model.classes.map(section => <Label key={section.id} className="flex items-center gap-2 text-sm">
        <Checkbox checked={sectionIds.includes(section.id)} onChange={event => setSectionIds(current =>
          event.target.checked ? [...current, section.id] : current.filter(id => id !== section.id))}/>{section.title} · {section.programName}
      </Label>)}
    </fieldset>
    <Button type="submit" disabled={busy}>{feedback.pending ? "Saving coverage..." : "Save room coverage"}</Button>
    <MutationFeedback state={feedback} className="mt-3" pendingMessage="Saving room coverage..."/>
    {feedback.refreshFailed && <Button type="button" disabled={feedback.pending} onClick={() => void feedback.retryRefresh()}>Refresh saved coverage</Button>}
  </form>;
}

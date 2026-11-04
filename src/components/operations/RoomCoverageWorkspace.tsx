import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRoomCoverageWorkspaceFn, createRoomAtSiteFn, saveRoomCoverageFn } from "@/modules/operations/room-coverage.functions";
import { addCalendarDays } from "@/modules/calendar/timezone";
import { roomCoverageOccurs } from "@/domain/room-coverage";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";

type Model = Awaited<ReturnType<typeof getRoomCoverageWorkspaceFn>>;
type Schedule = Model["schedules"][number];
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function RoomCoverageWorkspace({ siteId }: { siteId?: string }) {
  const query = useQuery({ queryKey: ["room-coverage", siteId ?? "own"],
    queryFn: () => getRoomCoverageWorkspaceFn({ data: siteId ? { siteId } : {} }), retry: false });
  const feedback = useMutationFeedback(() => query.refetch({ throwOnError: true }));
  const [roomId, setRoomId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const busy = feedback.pending || feedback.refreshFailed;
  const model = query.data;
  return <section aria-label="All-day room coverage" className="mt-6 rounded-xl border p-5">
    <h2 className="font-serif text-2xl">All-day room coverage</h2>
    <p className="mt-2 text-sm">One onsite facilitator supervises a physical room while its students take
      different virtual courses. Course teaching assignments remain separate.</p>
    <p className="mt-2 text-sm text-muted-foreground">A saved assignment is a plan, not verified arrival,
      continuous supervision, safety approval or permission to open. Independently reviewed daily room
      plans, qualified primary and backup adults, occupancy and school-calendar checks still apply.
      Breaks or absences require an approved coverage handoff; report interruptions rather than assuming coverage continues.</p>
    <p className="mt-2 text-sm text-muted-foreground">For standalone schools, this is planning only:
      the existing reviewed daily supervision and witnessed-presence workflow supports independently
      church-hosted CAN programs. Saving a room assignment does not activate that workflow for a standalone school.</p>
    {query.isPending && <p role="status" className="mt-3">Loading room coverage...</p>}
    {query.error && <div role="alert" className="mt-3">
      {mutationErrorMessage(query.error, "Room coverage is unavailable.")}
      <Button type="button" variant="outline" onClick={() => void query.refetch()}>Retry room coverage</Button>
    </div>}
    {model && <>
      <p className="mt-3 text-sm">School timezone: {model.timezone}</p>
      {!model.schedules.length && <p role="status" className="mt-3 text-sm">No room coverage assignments recorded.</p>}
      <ul className="mt-3 space-y-3">{model.schedules.map(schedule => <li key={schedule.id + ":" + schedule.revision} className="rounded-lg border p-3">
        <h3 className="font-semibold">{model.rooms.find(room => room.id === schedule.roomId)?.name ?? "Unavailable room"}</h3>
        <p className="mt-1 text-sm">{schedule.weekdays.map(day => days[day]).join(", ")} · {schedule.startsAtLocal}-{schedule.endsAtLocal}</p>
        <p className="text-sm">{schedule.startsOn} through {schedule.endsOn} · {roomCoverageOccurs(schedule, model.today) ? "Scheduled today" : "Not scheduled today"}</p>
        <p className="mt-1 text-sm">Primary: {model.staff.find(person => person.id === schedule.primaryPersonId)?.name ?? "Identity no longer eligible"} ·
          {" "}Backup: {model.staff.find(person => person.id === schedule.backupPersonId)?.name ?? "Not assigned or no longer eligible"}</p>
        <p className="text-sm">Room occupancy limit: {model.rooms.find(room => room.id === schedule.roomId)?.capacity ?? "Unavailable"}</p>
        <p className="mt-1 text-sm">Courses served: {schedule.sectionIds.map(id => model.classes.find(section => section.id === id)?.title ?? "Unavailable class").join(", ") || "No classes linked yet"}</p>
        {(!schedule.backupPersonId || !schedule.sectionIds.length) && <p role="status" className="mt-2 text-sm">
          Setup incomplete: {!schedule.backupPersonId ? "assign a separate qualified backup adult. " : ""}
          {!schedule.sectionIds.length ? "Link the classes whose onsite students use this room." : ""}
        </p>}
        {model.canManage && <details className="mt-3"><summary className="cursor-pointer">Edit room assignment</summary>
          <RoomCoverageForm model={model} schedule={schedule} changed={() => query.refetch({ throwOnError: true })}/>
        </details>}
      </li>)}</ul>
      {model.canManage && <>
        <h3 className="mt-5 font-semibold">Create a physical room</h3>
        <form className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={event => {
          event.preventDefault();
          void feedback.run(async () => {
            const result = await createRoomAtSiteFn({ data: { siteId: model.siteId, roomId, name, capacity: Number(capacity) } });
            setRoomId(crypto.randomUUID()); setName(""); setCapacity("");
            return result;
          }, { successMessage: "Physical room saved. This is not an inspection or supervision approval.",
            commandErrorMessage: "Unable to save the physical room." });
        }}>
          <Label>Room name<Input required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} disabled={busy}/></Label>
          <Label>Occupancy limit<Input required type="number" min={1} max={1000} value={capacity} onChange={event => setCapacity(event.target.value)} disabled={busy}/></Label>
          <Button type="submit" className="self-end" disabled={busy}>Create room</Button>
        </form>
        <MutationFeedback state={feedback} className="mt-3" pendingMessage="Saving physical room..."/>
        {feedback.refreshFailed && <Button onClick={() => void feedback.retryRefresh()} disabled={feedback.pending}>Refresh saved rooms</Button>}
        <h3 className="mt-5 font-semibold">Assign all-day room coverage</h3>
        {!model.staff.length && <p role="status" className="mt-2 text-sm">Invite a room facilitator and have them accept before assigning coverage.</p>}
        <RoomCoverageForm key={"new:" + model.schedules.length} model={model} changed={() => query.refetch({ throwOnError: true })}/>
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
  const feedback = useMutationFeedback(changed);
  const busy = feedback.pending || feedback.refreshFailed;
  const selectClass = "mt-1 block w-full rounded border bg-background p-2";
  return <form className="mt-3 space-y-3" onSubmit={event => {
    event.preventDefault();
    void feedback.run(() => saveRoomCoverageFn({ data: {
      siteId: model.siteId, id, expectedRevision: schedule?.revision ?? null, roomId,
      primaryPersonId: primary, backupPersonId: backup || null, startsOn, endsOn,
      startsAtLocal: start, endsAtLocal: end, weekdays, sectionIds,
    } }), { successMessage: "Room coverage assignment saved. Independent safety and daily-plan checks remain required.",
      commandErrorMessage: "Unable to save room coverage. Verify the dates, identities and conflicting assignments." });
  }}>
    <div className="grid gap-3 sm:grid-cols-3">
      <Label>Coverage room<select className={selectClass} required value={roomId} onChange={event => setRoomId(event.target.value)} disabled={busy}>
        <option value="">Select a room</option>{model.rooms.filter(room => !room.retiredAt).map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
      </select></Label>
      <Label>Primary facilitator<select className={selectClass} required value={primary} onChange={event => setPrimary(event.target.value)} disabled={busy}>
        <option value="">Select an accepted facilitator</option>{model.staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></Label>
      <Label>Backup facilitator<select className={selectClass} value={backup} onChange={event => setBackup(event.target.value)} disabled={busy}>
        <option value="">Not assigned - setup incomplete</option>{model.staff.filter(person => person.id !== primary).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></Label>
      <Label>Coverage starts on<Input type="date" required value={startsOn} onChange={event => setStartsOn(event.target.value)} disabled={busy}/></Label>
      <Label>Coverage ends on<Input type="date" required value={endsOn} onChange={event => setEndsOn(event.target.value)} disabled={busy}/></Label>
      <Label>Starts at (school time)<Input type="time" required value={start} onChange={event => setStart(event.target.value)} disabled={busy}/></Label>
      <Label>Ends at (school time)<Input type="time" required value={end} onChange={event => setEnd(event.target.value)} disabled={busy}/></Label>
    </div>
    <fieldset disabled={busy} className="flex flex-wrap gap-3"><legend className="mb-2 text-sm font-semibold">Coverage weekdays</legend>
      {days.map((day, value) => <label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={weekdays.includes(value)}
        onChange={event => setWeekdays(current => event.target.checked ? [...current, value].sort() : current.filter(item => item !== value))}/>{day}</label>)}
    </fieldset>
    <fieldset disabled={busy} className="space-y-2"><legend className="text-sm font-semibold">Classes whose onsite students use this room</legend>
      <p className="text-sm text-muted-foreground">Different simultaneous courses may share this room. Enrollment stays in the original classes; occupancy counts each student once.</p>
      {!model.classes.length && <p role="status" className="text-sm">No onsite classes exist yet. Save the room assignment now, then link classes after academic setup.</p>}
      {model.classes.map(section => <label key={section.id} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={sectionIds.includes(section.id)} onChange={event => setSectionIds(current =>
          event.target.checked ? [...current, section.id] : current.filter(id => id !== section.id))}/>{section.title} · {section.programName}
      </label>)}
    </fieldset>
    <Button type="submit" disabled={busy || !roomId || !primary || !weekdays.length}>{feedback.pending ? "Saving coverage..." : "Save room coverage"}</Button>
    <MutationFeedback state={feedback} className="mt-3" pendingMessage="Saving room coverage..."/>
    {feedback.refreshFailed && <Button type="button" disabled={feedback.pending} onClick={() => void feedback.retryRefresh()}>Refresh saved coverage</Button>}
  </form>;
}

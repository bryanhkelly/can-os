import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { assignSchoolSectionRoomFn, createSchoolRoomFn, getSchoolRoomsFn, retireSchoolRoomFn, updateSchoolRoomFn } from "@/modules/operations/site-rooms.functions";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/choice";

export function SchoolRoomsSetup({ programId }: { programId: string }) {
  const rooms = useQuery({ queryKey: ["school-rooms", programId],
    queryFn: () => getSchoolRoomsFn({ data: { programId } }), retry: false });
  const feedback = useMutationFeedback(() => rooms.refetch({ throwOnError: true }));
  const [roomId, setRoomId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [createAttempted, setCreateAttempted] = useState(false);
  const busy = feedback.pending || feedback.refreshFailed;
  return <section id="physical-classrooms" aria-label="Physical classrooms" className="mt-6 rounded-xl border p-5">
    <h2 className="font-serif text-2xl">Physical classrooms</h2>
    <p className="mt-2 text-sm">Create the actual rooms at this Site once, then select them for
      scheduled classes in school-day room and adult coverage planning. Rooms are shared by
      Programs at the same Site; they are separate from teaching classes (Sections).</p>
    <p className="mt-2 text-sm text-muted-foreground">Record the school's reviewed occupancy
      limit. Saving a room does not certify an inspection, reserve it, approve supervision
      or authorize opening.</p>
    {rooms.isPending && <p role="status" className="mt-3">Loading school rooms…</p>}
    {rooms.error && <div role="alert" className="mt-3 text-sm">
      {mutationErrorMessage(rooms.error, "Unable to load the school room directory.")} <Button variant="outline" type="button" onClick={() => void rooms.refetch()}>Retry room directory</Button>
    </div>}
    {rooms.data && <>
      {rooms.data.rooms.length ? <ul className="mt-4 space-y-2 text-sm">
        {rooms.data.rooms.map(room => <li key={room.id+":"+room.revision} className="rounded-lg border p-3">
          <strong>{room.name}</strong> · occupancy limit {room.capacity}
          {room.retiredAt ? <p className="mt-1">Retired - unavailable for new assignments or room-plan approvals. Historical records are retained.</p>
            : rooms.data.canManage ? <RoomEditor room={room} busy={busy}
                update={(name, capacity, reason) => feedback.run(() => updateSchoolRoomFn({
                  data: { programId, roomId: room.id, expectedRevision: room.revision, name, capacity, reason },
                }), { successMessage: "Classroom details updated. Approved daily plans retain their reviewed snapshot.",
                  commandErrorMessage: "Unable to update this classroom." })}
                retire={reason => feedback.run(() => retireSchoolRoomFn({
                  data: { programId, roomId: room.id, expectedRevision: room.revision, reason, confirmed: true },
                }), { successMessage: "Classroom retired. Review defaults that still reference it; approved plans and history were not rewritten.",
                  commandErrorMessage: "Unable to retire this classroom." })}/> : null}
        </li>)}
      </ul> : <p role="status" className="mt-4 text-sm">No physical classrooms have been created for this Site.</p>}
      {!rooms.data.canManage && <p className="mt-4 text-sm" role="status">Room configuration is managed by the school registrar. You may review this physical directory, but cannot edit rooms or class locations.</p>}
      {rooms.data.canManage && <form noValidate className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={event => {
        event.preventDefault();
        setCreateAttempted(true);
        const capacityValue = Number(capacity);
        if (name.trim().length < 2 || !Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > 1000) return;
        void feedback.run(async () => {
          const result = await createSchoolRoomFn({ data: { programId, roomId, name: name.trim(), capacity: capacityValue } });
          setRoomId(crypto.randomUUID()); setName(""); setCapacity("");
          setCreateAttempted(false);
          return result;
        }, { successMessage: "Physical classroom saved. Select it when preparing school-day room coverage.",
          commandErrorMessage: "The physical classroom could not be saved." });
      }}>
        <Field label="Physical classroom name" required
          error={createAttempted&&name.trim().length<2?"Enter a room name with at least 2 characters.":undefined}>
          <Input minLength={2} maxLength={120} value={name}
            onChange={event => setName(event.target.value)} disabled={busy}/>
        </Field>
        <Field label="Room occupancy limit" required
          error={createAttempted&&(!Number.isInteger(Number(capacity))||Number(capacity)<1||Number(capacity)>1000)
            ?"Enter a whole number from 1 to 1000.":undefined}>
          <Input type="number" min={1} max={1000} step={1} value={capacity}
            onChange={event => setCapacity(event.target.value)} disabled={busy}/>
        </Field>
        <Button type="submit" className="self-end" disabled={busy}>
          {feedback.pending ? "Saving room…" : "Create physical classroom"}
        </Button>
      </form>}
      {rooms.data.canManage && !!rooms.data.rooms.length && <div className="mt-5 space-y-3">
        <h3 className="font-semibold">Classroom locations</h3>
        <p className="text-sm text-muted-foreground">Assign each teaching class a default physical room.
          This is planning, not an exclusive reservation or approved adult coverage. Daily plans retain
          their own reviewed room; changing this default does not replace them.</p>
        {rooms.data.classes.map(section => <SectionRoomLocation key={section.id+":"+(section.roomId??"none")}
          section={section} rooms={rooms.data!.rooms} busy={busy}
          save={roomId => feedback.run(() => assignSchoolSectionRoomFn({
            data: { programId, sectionId: section.id, roomId },
          }), { successMessage: "Default classroom location saved. Reviewed school-day coverage remains separate.",
            commandErrorMessage: "The classroom location could not be saved." })}/>)}
      </div>}
    </>}
    {feedback.notice && <p role="status" className="mt-3 text-sm">{feedback.notice}</p>}
    {feedback.error && <p role="alert" className="mt-3 text-sm">{feedback.error}</p>}
    {feedback.refreshFailed && <Button type="button" variant="outline" disabled={feedback.pending}
      onClick={() => void feedback.retryRefresh()}>Refresh saved rooms</Button>}
  </section>;
}

function SectionRoomLocation({ section, rooms, busy, save }: {
  section: Awaited<ReturnType<typeof getSchoolRoomsFn>>["classes"][number];
  rooms: Awaited<ReturnType<typeof getSchoolRoomsFn>>["rooms"];
  busy: boolean; save: (roomId: string|null) => Promise<unknown>;
}) {
  const [roomId, setRoomId] = useState(section.roomId??"");
  const activeRooms = rooms.filter(room => !room.retiredAt);
  const retiredDefault = rooms.find(room => room.id === section.roomId && room.retiredAt);
  return <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
    event.preventDefault(); void save(roomId||null);
  }}>
    <Label>{section.title} ({section.code}) physical room
      <Select value={roomId} disabled={busy} onChange={event => setRoomId(event.target.value)}
        className="mt-1 block w-full rounded border bg-background p-2">
        <option value="">Not assigned</option>
        {retiredDefault && <option value={retiredDefault.id} disabled>{retiredDefault.name} (retired - replace or clear)</option>}
        {activeRooms.map(room => <option key={room.id} value={room.id}>{room.name} · capacity {room.capacity}</option>)}
      </Select>
    </Label>
    <Button type="submit" variant="outline" disabled={busy || roomId===(section.roomId??"")}>Save classroom location</Button>
    {retiredDefault && <p className="w-full text-sm" role="status">This class's default room is retired.
      Select an active room or clear the default. Historical assignments and approved plans remain unchanged.</p>}
  </form>;
}

function RoomEditor({ room, busy, update, retire }: {
  room: Awaited<ReturnType<typeof getSchoolRoomsFn>>["rooms"][number];
  busy: boolean;
  update: (name: string, capacity: number, reason: string) => Promise<unknown>;
  retire: (reason: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(room.name);
  const [capacity, setCapacity] = useState(String(room.capacity));
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [retireAttempted, setRetireAttempted] = useState(false);
  return <details className="mt-2">
    <summary className="cursor-pointer font-semibold">Edit or retire {room.name}</summary>
    <p className="mt-2 text-sm">Changes affect every Program at this Site. Existing approved daily plans retain
      their reviewed name and occupancy limit; a change here does not approve or amend them. Pending plans
      must match the current active room before approval. Retirement prevents new use, not physical access,
      and is not an emergency closure or an instruction to move children.</p>
    <form noValidate className="mt-3 grid gap-3" onSubmit={event => {
      event.preventDefault();
      setAttempted(true);
      const capacityValue = Number(capacity);
      if (name.trim().length < 2 || !Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > 1000 || reason.trim().length < 5) return;
      void update(name.trim(), capacityValue, reason.trim());
    }}>
      <Field label={`Updated name for ${room.name}`} required
        error={attempted&&name.trim().length<2?"Enter a room name with at least 2 characters.":undefined}>
        <Input minLength={2} maxLength={120} value={name} disabled={busy}
          onChange={event => setName(event.target.value)}/>
      </Field>
      <Field label={`Updated occupancy limit for ${room.name}`} required
        error={attempted&&(!Number.isInteger(Number(capacity))||Number(capacity)<1||Number(capacity)>1000)
          ?"Enter a whole number from 1 to 1000.":undefined}>
        <Input type="number" min={1} max={1000} step={1} value={capacity} disabled={busy}
          onChange={event => setCapacity(event.target.value)}/>
      </Field>
      <Field label={`Reason for changing ${room.name}`} required
        error={(attempted||retireAttempted)&&reason.trim().length<5?"Enter at least 5 characters explaining this room change.":undefined}>
        <Input minLength={5} maxLength={1000} value={reason} disabled={busy}
          onChange={event => setReason(event.target.value)}/>
      </Field>
      <Button type="submit" variant="outline" disabled={busy ||
        (name.trim() === room.name && Number(capacity) === room.capacity)}>Save room changes</Button>
    </form>
    <Field label="I understand retirement cannot be undone here, stops new assignments and approvals, and preserves existing defaults and reviewed plans for explicit follow-up"
      required error={retireAttempted&&!confirmed?"Confirm the retirement consequences before continuing.":undefined}>
      <Checkbox checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/>
    </Field>
    <Button type="button" variant="outline" className="mt-2" disabled={busy}
      onClick={() => {
        setRetireAttempted(true);
        if (!confirmed || reason.trim().length < 5) return;
        void retire(reason.trim());
      }}>Retire {room.name}</Button>
  </details>;
}

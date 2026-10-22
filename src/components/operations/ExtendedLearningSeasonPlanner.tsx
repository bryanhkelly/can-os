import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  createExtendedSeasonDraftFn,
  createExtendedReadinessAssignmentsFn,
  type listExtendedSeasonPlanning,
} from "@/modules/activities/extended-learning.functions";
import { programTypeLabels } from "@/domain/program-offerings";
import { extendedLearningReadinessTasks } from "@/domain/extended-learning-readiness-tasks";

type Planning = Awaited<ReturnType<typeof listExtendedSeasonPlanning>>;

/** This workspace plans seasons only. It cannot publish or register children. */
export function ExtendedLearningSeasonPlanner({ planning, siteId }: {
  planning: Planning;
  siteId?: string;
}) {
  const router = useRouter();
  const [programId, setProgramId] = useState("");
  const [offeringName, setOfferingName] = useState("");
  const [seasonName, setSeasonName] = useState("");
  const [activityType, setActivityType] = useState<"club"|"athletics"|"arts"|"service"|"other">("other");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [capacity, setCapacity] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [readinessOwners, setReadinessOwners] = useState<Record<string,string>>({});
  const programs = planning.programs.filter(p => !siteId || p.siteId === siteId);
  const selectable = programs.filter(p => p.status !== "paused" && p.status !== "closed");
  const selected = selectable.find(p => p.id === programId);
  const inputClass = "mt-1 w-full rounded-lg border bg-background p-2 text-sm";

  async function createDraft(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      if (!selected) throw new Error("Choose a program in your site");
      await createExtendedSeasonDraftFn({ data: {
        programId: selected.id, offeringName, seasonName, activityType,
        startsOn, endsOn, capacity,
      } });
      setSuccess("Draft season saved. Registration is not open.");
      setOfferingName(""); setSeasonName("");
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save draft season");
    } finally {
      setBusy(false);
    }
  }

  async function assignReadiness(seasonId: string, programId: string) {
    setBusy(true); setError(""); setSuccess("");
    try {
      const existing = planning.assignments.find(a => a.seasonId === seasonId);
      const recipientPersonId = readinessOwners[seasonId] ?? existing?.ownerPersonId ?? "";
      if (!recipientPersonId || !planning.operators.some(
        op => op.programId === programId && op.personId === recipientPersonId
      )) throw new Error("Select an eligible site operator");
      const result = await createExtendedReadinessAssignmentsFn({
        data: { seasonId, recipientPersonId },
      });
      setSuccess(result.created ? `Created ${result.created} readiness evidence requests. These are not approvals.`
        : "All evidence requests already exist; registration remains blocked.");
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to assign evidence requests");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5" aria-label="Summer and after-school season planning">
      <h2 className="font-serif text-2xl">Summer and after-school planning</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Set up a program-linked offering and a draft season. Drafts do not accept family registrations.
        Operating approval, supervision, pickup safeguards and session scheduling are separate steps.
      </p>
      {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
      {success && <p role="status" className="mt-3 text-sm">{success}</p>}
      <form onSubmit={createDraft} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs sm:col-span-2">Extended-learning program
          <select className={inputClass} value={programId} onChange={e => setProgramId(e.target.value)} required>
            <option value="">Select a noncredit summer or after-school program</option>
            {selectable.map(p => <option key={p.id} value={p.id}>{p.name} · {programTypeLabels[p.type]}</option>)}
          </select>
        </label>
        <label className="text-xs">Offering name
          <input className={inputClass} value={offeringName} onChange={e => setOfferingName(e.target.value)} placeholder="Robotics lab" required minLength={2} maxLength={160} />
        </label>
        <label className="text-xs">Season name
          <input className={inputClass} value={seasonName} onChange={e => setSeasonName(e.target.value)} placeholder="Summer 2027 / June" required minLength={2} maxLength={120} />
        </label>
        <label className="text-xs">Category
          <select className={inputClass} value={activityType} onChange={e => setActivityType(e.target.value as typeof activityType)}>
            <option value="other">Academic / other</option>
            <option value="club">Club</option>
            <option value="arts">Arts</option>
            <option value="athletics">Athletics</option>
            <option value="service">Service</option>
          </select>
        </label>
        <label className="text-xs">Seat capacity
          <input type="number" className={inputClass} min={1} max={10000} required value={capacity}
            onChange={e => setCapacity(Number(e.target.value))} />
        </label>
        <label className="text-xs">Start date
          <input type="date" className={inputClass} required value={startsOn} onChange={e => setStartsOn(e.target.value)} />
        </label>
        <label className="text-xs">End date
          <input type="date" className={inputClass} required min={startsOn||undefined} value={endsOn}
            onChange={e => setEndsOn(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={!selected || busy} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? "Saving…" : "Save draft season"}
          </button>
          {!selectable.length && <p className="mt-2 text-xs text-muted-foreground">Create a hosted noncredit summer or after-school Program above first.</p>}
        </div>
      </form>
      <div className="mt-6">
        <h3 className="text-sm font-semibold">Recorded seasons</h3>
        <ul className="mt-2 space-y-2">
          {planning.seasons.filter(season => programs.some(p => p.id === season.programId)).map(season =>
            <li key={season.id} className="rounded-lg border p-3 text-sm">
              <strong>{season.offeringName}</strong> · {season.name} · {season.startsOn} to {season.endsOn}
              <span className="ml-2 text-xs text-muted-foreground">{season.status} · {season.capacity ?? "Uncapped"} seats</span>
              {(() => {
                const gate = planning.readiness.find(item => item.seasonId === season.id);
                return gate ? (
                  <div className="mt-2 text-xs">
                    <p className="font-semibold">{gate.ready ? "Readiness checks satisfied" : "Registration opening blocked"}</p>
                    {!gate.ready && <ul className="mt-1 list-disc pl-5">
                      {gate.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
                    </ul>}
                  </div>
                ) : null;
              })()}
              {(() => {
                const tasks = planning.assignments.filter(a => a.seasonId === season.id);
                const available = planning.operators.filter(p => p.programId === season.programId);
                const existingOwner = tasks[0]?.ownerPersonId ?? "";
                const operatorId = readinessOwners[season.id] ?? existingOwner;
                return (
                  <div className="mt-3 rounded-lg border p-3">
                    <p className="text-xs font-semibold">
                      Evidence requests: {tasks.length}/{extendedLearningReadinessTasks.length} recorded
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      These are evidence-gathering assignments only. A completed task does not
                      demonstrate approval or allow children to register.
                    </p>
                    {!!tasks.length && <ul className="mt-2 list-disc pl-5 text-xs">
                      {tasks.map(task => <li key={task.id}>
                        {extendedLearningReadinessTasks.find(t => t.key === task.requirementKey)?.title ??
                          "Unrecognized requirement"} — {task.status === "resolved"
                            ? "task closed, verification pending" : "evidence requested"}
                      </li>)}
                    </ul>}
                    {season.status === "draft" && <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="min-w-44 flex-1 text-xs">Receiving site operator
                        <select className={inputClass} value={operatorId}
                          disabled={busy || tasks.length > 0}
                          onChange={e => setReadinessOwners(current => ({
                            ...current, [season.id]: e.target.value,
                          }))}>
                          <option value="">Choose active site registrar</option>
                          {available.map(person => <option key={person.personId} value={person.personId}>
                            {person.firstName} {person.lastName}
                          </option>)}
                        </select>
                      </label>
                      <button type="button" className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                        disabled={busy || !operatorId || tasks.length === extendedLearningReadinessTasks.length}
                        onClick={() => assignReadiness(season.id, season.programId ?? "")}>
                        {tasks.length ? "Complete missing requests" : "Assign readiness requests"}
                      </button>
                    </div>}
                    {!available.length && <p className="mt-2 text-xs text-muted-foreground">
                      No active site registrar/operator is currently eligible for these tasks.
                    </p>}
                  </div>
                );
              })()}
            </li>
          )}
          {!planning.seasons.some(season => programs.some(p => p.id === season.programId)) &&
            <li className="text-xs text-muted-foreground">No seasons recorded for these programs.</li>}
        </ul>
      </div>
    </section>
  );
}

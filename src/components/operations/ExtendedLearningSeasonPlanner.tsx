import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  createExtendedSeasonDraftFn,
  createExtendedReadinessAssignmentsFn,
  scheduleExtendedSessionsFn,
  publishExtendedSeasonFn,
  type listExtendedSeasonPlanning,
} from "@/modules/activities/extended-learning.functions";
import { programTypeLabels } from "@/domain/program-offerings";
import type { EnrichmentPackage } from "@/domain/enrichment-packages";
import { listEnrichmentSessionRoster } from "@/modules/activities/enrichment-roster.functions";
import { extendedLearningReadinessTasks } from "@/domain/extended-learning-readiness-tasks";
import { ExtendedSeasonEvidencePanel } from "./ExtendedSeasonEvidencePanel";

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
  const [evidenceSeasonId, setEvidenceSeasonId] = useState("");
  const [scheduleSeasonId, setScheduleSeasonId] = useState("");
  const [scheduleFrom, setScheduleFrom] = useState("");
  const [scheduleThrough, setScheduleThrough] = useState("");
  const [scheduleDays, setScheduleDays] = useState<number[]>([1,2,3,4,5]);
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("15:00");
  const [scheduleLocation, setScheduleLocation] = useState("");
  const [scheduleStaffId, setScheduleStaffId] = useState("");
  const [publishSeasonId, setPublishSeasonId] = useState("");
  const [permissionVersion, setPermissionVersion] = useState("");
  const [permissionText, setPermissionText] = useState("");
  const [feeDollars, setFeeDollars] = useState("0");
  const [operatorConfirmed, setOperatorConfirmed] = useState(false);
  const [packages, setPackages] = useState<EnrichmentPackage[]>([]);
  const [packageTitle, setPackageTitle] = useState("");
  const [packagePrice, setPackagePrice] = useState("0");
  const [packageFrom, setPackageFrom] = useState("");
  const [packageThrough, setPackageThrough] = useState("");
  const [packageWeekdays, setPackageWeekdays] = useState<number[]>([0,1,2,3,4,5,6]);
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof listEnrichmentSessionRoster>> | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
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

  async function publishSeason(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      if (!publishSeasonId || !operatorConfirmed) throw new Error("Confirm the release responsibility");
      const dollars = Number(feeDollars);
      if (!Number.isFinite(dollars) || dollars < 0 || Math.abs(Math.round(dollars * 100) - dollars * 100) > 1e-6)
        throw new Error("Enter a fee in dollars and cents");
      await publishExtendedSeasonFn({ data: {
        seasonId: publishSeasonId,
        permissionVersion, permissionText, feeAmountCents: Math.round(dollars * 100),
        ...(packages.length ? { packages } : {}),
        operationalResponsibilityConfirmed: true,
      } });
      setPublishSeasonId(""); setOperatorConfirmed(false); setPackages([]);
      setPermissionText(""); setPermissionVersion("");
      setSuccess("Offering published to the enrichment catalog. Families can now register.");
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to publish registration");
    } finally { setBusy(false); }
  }

  async function showRoster(seasonId: string, sessionId: string) {
    if (roster?.session.id === sessionId) { setRoster(null); return; }
    setRoster(null); setRosterLoading(true); setError("");
    try {
      const result = await listEnrichmentSessionRoster({data:{seasonId,sessionId}});
      setRoster(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to view session roster");
    } finally {setRosterLoading(false);}
  }

  function addPackage(seasonId: string) {
    setError("");
    const season = planning.seasons.find(item => item.id === seasonId);
    const matching = planning.sessions.filter(item => {
      if (item.seasonId !== seasonId) return false;
      const date = new Date(item.startsAt);
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: item.timezone, year:"numeric", month:"2-digit", day:"2-digit",
      }).formatToParts(date).map(part => [part.type,part.value]));
      const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
      const weekday = new Date(dayKey+"T00:00:00Z").getUTCDay();
      return dayKey >= packageFrom && dayKey <= packageThrough &&
        packageWeekdays.includes(weekday);
    });
    const dollars = Number(packagePrice);
    if (!season || !packageTitle.trim() || packageTitle.trim().length < 2 ||
        !Number.isFinite(dollars) || dollars < 0 || dollars > 100000 ||
        Math.abs(dollars * 100 - Math.round(dollars * 100)) > 1e-6 ||
        !packageFrom || !packageThrough || packageFrom > packageThrough ||
        !matching.length)
      return setError("Enter a package name, valid price and dates that match scheduled sessions");
    if (packages.length >= 30) return setError("Maximum 30 package options");
    setPackages(items => [...items, {
      id: crypto.randomUUID(),
      title: packageTitle.trim(),
      priceCents: Math.round(dollars*100),
      sessionIds: matching.map(item => item.id),
    }]);
    setPackageTitle("");
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

  async function saveSessions(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      if (!scheduleSeasonId) throw new Error("Choose a season");
      const result = await scheduleExtendedSessionsFn({ data: {
        seasonId: scheduleSeasonId,
        fromDate: scheduleFrom,
        throughDate: scheduleThrough,
        weekdays: scheduleDays,
        startTime: scheduleStart,
        endTime: scheduleEnd,
        location: scheduleLocation,
        ...(scheduleStaffId ? { facilitatorPersonId: scheduleStaffId } : {}),
      } });
      setSuccess(`Planned ${result.created} new sessions out of ${result.total} matching dates. Registration remains closed.`);
      setScheduleSeasonId("");
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to schedule sessions");
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
              {(season.status === "draft" || season.status === "registration") && <div className="mt-2">
                <button type="button" className="text-xs font-semibold underline"
                  onClick={() => setEvidenceSeasonId(old => old === season.id ? "" : season.id)}>
                  {evidenceSeasonId === season.id ? "Close operating evidence" : "Submit and review operating evidence"}
                </button>
                {evidenceSeasonId === season.id && <ExtendedSeasonEvidencePanel seasonId={season.id}
                  onChange={() => router.invalidate()}/>}
              </div>}
              {season.status === "registration" &&
                <a href="/enrichment" className="ml-3 text-xs underline">View public catalog</a>}
              {season.status === "draft" && (() => {
                const active = publishSeasonId === season.id;
                const isProgramActive = planning.programs.some(p => p.id === season.programId && p.status === "active");
                const openingReadiness = planning.readiness.find(item => item.seasonId === season.id);
                const canPublish = openingReadiness?.ready === true;
                const scheduled = planning.sessions.filter(item => item.seasonId === season.id);
                return <div className="mt-3 rounded-lg border p-3">
                  <p className="text-sm font-semibold">Family registration</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Publishing requires independently approved safeguarding, screened staff, emergency response,
                     authorized child release and session coverage. An attestation cannot replace approvals.
                  </p>
                  <button type="button" className="mt-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    disabled={!canPublish || !isProgramActive || !scheduled.length || busy}
                    onClick={() => {
                      setPublishSeasonId(active ? "" : season.id);
                      setOperatorConfirmed(false);
                      setPackages([]); setPackageTitle("");
                      setPackageFrom(season.startsOn); setPackageThrough(season.endsOn);
                    }}>{active ? "Close publication" : canPublish ? "Publish family registration" : "Registration opening blocked"}</button>
                   {!canPublish && <p role="status" className="mt-2 text-xs">
                     Registration remains blocked pending independently verified operational approvals.
                     {openingReadiness?.blockers?.length ? " Missing: " + openingReadiness.blockers.join("; ") : ""}
                   </p>}
                  {!isProgramActive && <p className="mt-2 text-xs">Activate the program through the existing launch controls first.</p>}
                  {!scheduled.length && <p className="mt-2 text-xs">Plan dated sessions first.</p>}
                  {active && <form onSubmit={publishSeason} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs">Fee per participant (USD)
                      <input className={inputClass} type="number" min={0} max={100000}
                        step="0.01" required value={feeDollars} onChange={e => setFeeDollars(e.target.value)}/>
                    </label>
                    <label className="text-xs">Consent version
                      <input className={inputClass} required maxLength={80} value={permissionVersion}
                        placeholder="summer-2027-v1" onChange={e => setPermissionVersion(e.target.value)}/>
                    </label>
                    <div className="sm:col-span-2 rounded-lg border p-3">
                      <p className="text-sm font-semibold">Optional week / weekday / day packages</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Leave empty for one full-season price. Otherwise add saleable
                        weeks or day combinations; together the packages must cover every scheduled day.
                        Families may choose multiple non-overlapping options.
                      </p>
                      <ul className="mt-2 space-y-1">
                        {packages.map(item => <li key={item.id}
                          className="flex items-center justify-between gap-2 text-xs">
                          <span>{item.title} · {item.sessionIds.length} sessions ·
                            {" "}${(item.priceCents/100).toFixed(2)}</span>
                          <button type="button" className="underline"
                            onClick={() => setPackages(all=>all.filter(p=>p.id!==item.id))}>
                            Remove
                          </button>
                        </li>)}
                      </ul>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="text-xs">Package name
                          <input className={inputClass} value={packageTitle}
                            maxLength={100} placeholder="Week 1 / M-W-F / Full camp"
                            onChange={e=>setPackageTitle(e.target.value)}/>
                        </label>
                        <label className="text-xs">Package fee (USD)
                          <input className={inputClass} type="number" min={0} max={100000} step="0.01"
                            value={packagePrice} onChange={e=>setPackagePrice(e.target.value)}/>
                        </label>
                        <label className="text-xs">From
                          <input className={inputClass} type="date" min={season.startsOn}
                            max={season.endsOn} value={packageFrom}
                            onChange={e=>setPackageFrom(e.target.value)}/>
                        </label>
                        <label className="text-xs">Through
                          <input className={inputClass} type="date" min={packageFrom||season.startsOn}
                            max={season.endsOn} value={packageThrough}
                            onChange={e=>setPackageThrough(e.target.value)}/>
                        </label>
                        <fieldset className="col-span-2">
                          <legend className="text-xs">Include weekdays</legend>
                          <div className="mt-1 flex flex-wrap gap-3">
                            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day,i)=>
                              <label key={day} className="text-xs">
                                <input type="checkbox" checked={packageWeekdays.includes(i)}
                                  onChange={e=>setPackageWeekdays(days=>e.target.checked
                                    ? [...days,i] : days.filter(value=>value!==i))}/>
                                {" "}{day}
                              </label>)}
                          </div>
                        </fieldset>
                        <button type="button" onClick={()=>addPackage(season.id)}
                          className="col-span-2 rounded-lg border p-2 text-xs font-semibold">
                          Add package option
                        </button>
                      </div>
                    </div>
                    <label className="text-xs sm:col-span-2">Published guardian participation permission
                      <textarea className={inputClass} rows={5} required minLength={30} maxLength={6000}
                        placeholder="Write the approved participation permission families must acknowledge."
                        value={permissionText} onChange={e => setPermissionText(e.target.value)}/>
                    </label>
                    <label className="sm:col-span-2 flex items-start gap-2 text-xs">
                      <input type="checkbox" required checked={operatorConfirmed} className="mt-1"
                        onChange={e => setOperatorConfirmed(e.target.checked)}/>
                      I am the authorized registrar publishing this offering and accept responsibility
                      for confirming site operations, supervision, emergency procedures and child release.
                      This records my attestation; CAN OS does not certify regulatory compliance.
                    </label>
                    <div className="sm:col-span-2">
                      <button type="submit" disabled={busy || !operatorConfirmed || !canPublish}
                        className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
                        {busy ? "Publishing…" : "Publish enrollment to families"}
                      </button>
                    </div>
                  </form>}
                </div>;
              })()}
              {(() => {
                const meetings = planning.sessions.filter(item => item.seasonId === season.id);
                const staff = planning.staff.filter(person => person.programId === season.programId);
                const active = scheduleSeasonId === season.id;
                return (
                  <div className="mt-3 rounded-lg border p-3">
                    <p className="text-sm font-semibold">Sessions · {meetings.length} scheduled</p>
                    {!!meetings.length && <div className="mt-1 text-xs text-muted-foreground">
                      First: {new Intl.DateTimeFormat("en-US", {dateStyle:"medium",timeStyle:"short",
                        timeZone:meetings[0]!.timezone}).format(new Date(meetings[0]!.startsAt))}
                      {" · "}Last: {new Intl.DateTimeFormat("en-US",{dateStyle:"medium",
                        timeZone:meetings.at(-1)!.timezone}).format(new Date(meetings.at(-1)!.startsAt))}
                      {" · "}{meetings[0]!.location}
                    </div>}
                    {season.status === "registration" && !!meetings.length &&
                      <details className="mt-2 rounded-lg border p-2">
                        <summary className="cursor-pointer text-xs font-semibold">Daily registered rosters</summary>
                        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                          {meetings.map(session => <button key={session.id} type="button"
                            className="block w-full rounded border px-2 py-1 text-left text-xs"
                            onClick={()=>showRoster(season.id,session.id)}>
                            {new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",
                              timeZone:session.timezone}).format(new Date(session.startsAt))}
                            {" · "}{session.location}
                          </button>)}
                        </div>
                        {rosterLoading && <p className="mt-2 text-xs">Loading roster…</p>}
                        {roster && meetings.some(item=>item.id===roster.session.id) &&
                          <div className="mt-2 rounded-lg border p-3">
                            <p className="text-xs font-semibold">
                              {roster.count} registered for {new Intl.DateTimeFormat("en-US",{
                                dateStyle:"medium",timeZone:roster.session.timezone,
                              }).format(new Date(roster.session.startsAt))}
                            </p>
                            {!roster.roster.length ? <p className="mt-2 text-xs">No confirmed seat allocations.</p>
                              : <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                                {roster.roster.map(child=><li key={child.id}>
                                  {child.firstName} {child.lastName}
                                  {" · "}{child.status.replaceAll("_"," ")}
                                </li>)}
                              </ul>}
                            <p className="mt-2 text-xs text-muted-foreground">
                              Registered participants only; no attendance or pickup release is implied.
                            </p>
                          </div>}
                      </details>}
                    {season.status === "draft" && <button type="button"
                      className="mt-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                      onClick={() => {
                        setScheduleSeasonId(active ? "" : season.id);
                        setScheduleFrom(season.startsOn);
                        setScheduleThrough(season.endsOn);
                        setScheduleStaffId("");
                        setScheduleLocation("");
                      }}>{active ? "Close session editor" : "Plan recurring sessions"}</button>}
                    {active && <form onSubmit={saveSessions} className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs">From
                        <input type="date" required className={inputClass} min={season.startsOn} max={season.endsOn}
                          value={scheduleFrom} onChange={e => setScheduleFrom(e.target.value)} />
                      </label>
                      <label className="text-xs">Through
                        <input type="date" required className={inputClass} min={scheduleFrom||season.startsOn}
                          max={season.endsOn} value={scheduleThrough}
                          onChange={e => setScheduleThrough(e.target.value)} />
                      </label>
                      <fieldset className="sm:col-span-2">
                        <legend className="text-xs">Days of week (site local time)</legend>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs">
                          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((label, day) =>
                            <label key={label} className="flex items-center gap-1">
                              <input type="checkbox" checked={scheduleDays.includes(day)} onChange={e =>
                                setScheduleDays(days => e.target.checked
                                  ? [...days, day].sort((a,b) => a-b) : days.filter(d => d!==day))} />
                              {label}
                            </label>)}
                        </div>
                      </fieldset>
                      <label className="text-xs">Start time
                        <input type="time" required className={inputClass} value={scheduleStart}
                          onChange={e => setScheduleStart(e.target.value)} />
                      </label>
                      <label className="text-xs">End time
                        <input type="time" required className={inputClass} value={scheduleEnd}
                          min={scheduleStart} onChange={e => setScheduleEnd(e.target.value)} />
                      </label>
                      <label className="text-xs">Room or location
                        <input required className={inputClass} value={scheduleLocation}
                          minLength={2} maxLength={120} placeholder="Classroom 2 / Fellowship Hall"
                          onChange={e => setScheduleLocation(e.target.value)} />
                      </label>
                      <label className="text-xs">Instructor / facilitator (optional)
                        <select className={inputClass} value={scheduleStaffId}
                          onChange={e => setScheduleStaffId(e.target.value)}>
                          <option value="">Assign later</option>
                          {staff.map(person => <option key={person.personId} value={person.personId}>
                            {person.firstName} {person.lastName}
                          </option>)}
                        </select>
                      </label>
                      <div className="sm:col-span-2">
                        <button type="submit" disabled={busy || scheduleDays.length===0}
                          className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
                          {busy ? "Scheduling…" : "Save draft sessions"}
                        </button>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Up to 180 sessions per request; dates must be within this season.
                          Assigning an instructor does not certify qualifications or open registration.
                        </p>
                      </div>
                    </form>}
                  </div>
                );
              })()}
              {season.status === "draft" && (() => {
                const tasks = planning.assignments.filter(a => a.seasonId === season.id);
                const available = planning.operators.filter(p => p.programId === season.programId);
                const existingOwner = tasks[0]?.ownerPersonId ?? "";
                const operatorId = readinessOwners[season.id] ?? existingOwner;
                return (
                  <details className="mt-3 rounded-lg border p-3">
                    <summary className="cursor-pointer text-xs font-semibold">Optional evidence requests</summary>
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
                  </details>
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

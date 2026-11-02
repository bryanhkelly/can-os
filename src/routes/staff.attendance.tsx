import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ObsoleteExcuseClosure } from "@/components/operations/ObsoleteExcuseClosure";
import { ExcuseAttachments } from "@/components/operations/ExcuseAttachments";
import {
  listExpectedOnsiteRoster, markExpectedOnsiteAttendance,
  listExpectedPendingExcuses, reviewCurrentAttendanceExcuse,
} from "@/modules/attendance/onsite-attendance-workflow.functions";

export const Route = createFileRoute("/staff/attendance")({
  validateSearch: (search: Record<string, unknown>): { programId?: string } => ({
    programId: typeof search.programId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.programId)
      ? search.programId : undefined,
  }),
  component: StaffAttendancePage,
});

type RosterStudent = Awaited<ReturnType<typeof listExpectedOnsiteRoster>>["students"][number];
type PendingExcuse = Awaited<ReturnType<typeof listExpectedPendingExcuses>>["excuses"][number];

const statusOptions = ["present", "absent", "tardy"] as const;
type OfflineMark = {studentProfileId:string;programId:string;date:string;status:"present"|"absent"|"tardy";mutationId:string;note:string;expectedPreviousEventId?:string|null};
const QUEUE_KEY="can-os:attendance:pending:v2";
const LEGACY_QUEUE_KEY="can-os:attendance:pending:v1";
function readQueue():OfflineMark[]{
 try{
  const raw=window.localStorage.getItem(QUEUE_KEY);
  const data=raw?JSON.parse(raw):[];
  if(!Array.isArray(data))return [];
  return data.filter((v):v is OfflineMark=>typeof v?.studentProfileId==="string"&&typeof v.programId==="string"&&
    typeof v.date==="string"&&["present","absent","tardy"].includes(v.status)&&
    typeof v.mutationId==="string"&&typeof v.note==="string").slice(0,500);
 }catch{return [];}
}
function writeQueue(items:OfflineMark[]){
 window.localStorage.setItem(QUEUE_KEY,JSON.stringify(items));
}


function todayLocal(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function StaffAttendancePage() {
  const { programId } = Route.useSearch();
  const [date, setDate] = useState(todayLocal);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [programs, setPrograms] = useState<Awaited<ReturnType<typeof listExpectedOnsiteRoster>>["programs"]>([]);
  const [legacyCount, setLegacyCount] = useState(0);
  const [excuses, setExcuses] = useState<PendingExcuse[]>([]);
  const [excusesWarning, setExcusesWarning] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [correctionNotes,setCorrectionNotes]=useState<Record<string,string>>({});
  const [queued,setQueued]=useState<OfflineMark[]>([]);
  const [syncing,setSyncing]=useState(false);
  const [conflicts,setConflicts]=useState<OfflineMark[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(()=>{
    setQueued(readQueue());
    try {
      const stored=JSON.parse(window.localStorage.getItem(LEGACY_QUEUE_KEY)??"[]");
      setLegacyCount(Array.isArray(stored)?stored.length:0);
    } catch { setLegacyCount(0); }
  },[]);
  const savePending=(mark:OfflineMark)=>{
    const next=[...readQueue().filter(item=>item.mutationId!==mark.mutationId),mark];
    writeQueue(next);setQueued(next);
  };
  const synchronize=useCallback(async()=>{
    if(typeof navigator!=="undefined"&&!navigator.onLine)return;
    const pending=readQueue();
    if(!pending.length)return;
    setSyncing(true);
    try{
      const remaining:OfflineMark[]=[];
      for(let i=0;i<pending.length;i++){
        const mark=pending[i]!;
        try{await markExpectedOnsiteAttendance({data:mark});}
        catch(error){
          remaining.push(...pending.slice(i));
          if(error instanceof Error&&error.message.includes("Attendance conflict"))
           setConflicts(previous=>[...previous.filter(x=>x.mutationId!==mark.mutationId),mark]);
          writeQueue(remaining);setQueued(remaining);
          setError(error instanceof Error?error.message:"Some attendance entries could not be synchronized");
          return;
        }
      }
      writeQueue([]);setQueued([]);setNotice("All offline attendance entries synchronized.");
      setError("");
    }finally{setSyncing(false);}
  },[]);
  useEffect(()=>{
    window.addEventListener("online",synchronize);
    if(navigator.onLine)void synchronize();
    return ()=>window.removeEventListener("online",synchronize);
  },[synchronize]);
  const load = useCallback(async (targetDate: string) => {
    setLoading(true);
    setError("");
    try {
      const [roster, pending] = await Promise.all([
        listExpectedOnsiteRoster({ data: { date: targetDate, programId } }),
        listExpectedPendingExcuses().catch(() => null),
      ]);
      setStudents(roster.students);
      setPrograms(roster.programs);
      setExcuses(pending?.excuses ?? []);
      setExcusesWarning(pending ? "" :
        "Pending excuse review is unavailable. You can still mark the scheduled attendance roster.");
    } catch {
      setStudents([]);
      setPrograms([]);
      setExcuses([]);
      setError("Sign in with an authorized teacher or registrar account to run attendance.");
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [roster, pending] = await Promise.all([
          listExpectedOnsiteRoster({ data: { date, programId } }),
          listExpectedPendingExcuses().catch(() => null),
        ]);
        if (!active) return;
        setStudents(roster.students);
        setPrograms(roster.programs);
        setExcuses(pending?.excuses ?? []);
        setExcusesWarning(pending ? "" :
          "Pending excuse review is unavailable. You can still mark the scheduled attendance roster.");
        setError("");
      } catch {
        if (!active) return;
        setStudents([]);
        setPrograms([]);
        setExcuses([]);
        setError("Sign in with an authorized teacher or registrar account to run attendance.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [date, programId]);

  const mark = async (student: RosterStudent, status: (typeof statusOptions)[number]) => {
    const change:OfflineMark={studentProfileId:student.studentProfileId,programId:student.programId,date,status,
      mutationId:crypto.randomUUID(),note:correctionNotes[student.programId+":"+student.studentProfileId]??"",
      expectedPreviousEventId:student.attendanceEventId};
    setBusy(change.mutationId);setNotice("");
    try {
      if(!navigator.onLine){
        savePending(change);
        setNotice("Offline: attendance entry saved on this device. It will synchronize when connected.");
      }else{
        await markExpectedOnsiteAttendance({data:change});
        setNotice(student.studentName+" marked "+status+".");
        await load(date);
      }
    }catch(cause){
      if(!navigator.onLine){
        savePending(change);
        setNotice("Offline: entry saved locally for synchronization.");
      }else{
        setError(cause instanceof Error?cause.message:"Unable to record attendance");
      }
    }finally{setBusy("");}
  };

  function discardConflict(mark:OfflineMark){
    const next=readQueue().filter(entry=>entry.mutationId!==mark.mutationId);
    writeQueue(next);setQueued(next);setConflicts(current=>current.filter(entry=>entry.mutationId!==mark.mutationId));
    setNotice("Conflicting attendance change discarded; school record preserved.");
  }
  async function overrideConflict(mark:OfflineMark){
    const current=students.find(item=>item.studentProfileId===mark.studentProfileId&&item.programId===mark.programId);
    const reason=correctionNotes[mark.programId+":"+mark.studentProfileId]?.trim();
    if(!current||!reason){
      setError("Refresh attendance and enter a reason before correcting the newer school record.");
      return;
    }
    const revised={...mark,expectedPreviousEventId:current.attendanceEventId,
      mutationId:crypto.randomUUID(),note:reason};
    const next=readQueue().map(entry=>entry.mutationId===mark.mutationId?revised:entry);
    writeQueue(next);setQueued(next);setConflicts(items=>items.filter(entry=>entry.mutationId!==mark.mutationId));
    await synchronize();
  }
  const review = async (excuse: PendingExcuse, decision: "approved" | "rejected") => {
    setBusy(`excuse:${excuse.excuseId}`);
    setNotice("");
    try {
      await reviewCurrentAttendanceExcuse({ data: { excuseId: excuse.excuseId, decision, note: notes[excuse.excuseId] ?? "" } });
      setNotice(`Excuse ${decision} for ${excuse.studentName}.`);
      await load(date);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to review excuse");
    } finally {
      setBusy("");
    }
  };

  const marked = students.filter(student => student.status !== "unmarked" && student.status !== "expected").length;

  return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Attendance</p>
      <h1 className="mt-2 font-serif text-4xl">Daily attendance</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Mark students expected onsite at your school and review guardian-submitted excuses.
        Approved excuses correct the attendance record without erasing history.
      </p>
      {programId && <div role="status" className="mt-4 rounded-lg border p-3 text-sm">
        Showing the expected onsite roster for the selected Program. Pending guardian excuses
        still cover all students in your authorized review queue.
        <Link to="/staff/attendance" className="ml-2 font-semibold underline">Show all permitted Programs</Link>
      </div>}
      <WorkflowIntro eyebrow="School day · Attendance" title="A reliable record of who is here." description="Mark observed attendance, review excuses and reconcile changes without replacing the underlying history. Offline entries remain pending until synchronized." />
      <label className="mt-8 block max-w-sm text-sm font-semibold">
        Attendance date
        <input
          type="date"
          className="mt-2 w-full rounded-lg border bg-background p-3"
          value={date}
          onChange={event => setDate(event.target.value)}
        />
      </label>
      {notice && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{notice}</p>}
      {excusesWarning && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{excusesWarning}</p>}
      {conflicts.length>0&&<div className="mt-4 rounded-lg border border-amber-500 p-3 text-sm">
        <strong>Attendance conflicts require review</strong>
        <p className="mt-1">A newer school record exists for {conflicts.length} offline
          {conflicts.length===1?" entry":" entries"}. Refresh attendance before deciding
          whether to create a new correction.</p>
        {conflicts.map(item=><div key={item.mutationId} className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2">
         <span className="text-xs">{students.find(s=>s.studentProfileId===item.studentProfileId&&s.programId===item.programId)?.studentName??item.studentProfileId}
          {" · "}{item.date}{" · pending "}{item.status}</span>
         <button type="button" onClick={()=>discardConflict(item)} className="rounded border px-2 py-1 text-xs">Discard local change</button>
         <button type="button" onClick={()=>void overrideConflict(item)} className="rounded border px-2 py-1 text-xs">Apply as reasoned correction</button>
        </div>)}
        <button type="button" onClick={()=>{setConflicts([]);void load(date);}}
          className="mt-2 rounded border px-3 py-2 text-xs">Refresh school records</button>
      </div>}
      {legacyCount>0 && <p role="alert" className="mt-4 rounded-lg border border-amber-500 p-3 text-sm">{legacyCount} older offline attendance entries need review. They have no program identifier, so they will not be uploaded into an ambiguous student/program record. The previous device queue has been preserved.</p>}
      {queued.length>0&&<div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
        <span>{queued.length} attendance {queued.length===1?"entry":"entries"} stored on this device pending synchronization.</span>
        <button type="button" disabled={syncing||!navigator.onLine} onClick={()=>void synchronize()}
          className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">
          {syncing?"Synchronizing…":"Synchronize now"}
        </button>
      </div>}

      {error && <p role="alert" className="mt-8 rounded-lg border p-4 text-sm">{error}</p>}
      {loading && !error && <p role="status" className="mt-8 text-sm">Loading attendance roster…</p>}
      {!loading && !error && <>
        {programs.some(p=>p.configuration!=="configured") && <div role="status" className="mt-4 rounded-xl border border-amber-500 p-4 text-sm">
          <strong>Onsite attendance configuration needs attention</strong>
          {programs.filter(p=>p.configuration!=="configured").map(p=><p key={p.id} className="mt-1">
            {p.name}: {p.configuration.replaceAll("_"," ")}{p.missingCalendarDates?" · "+p.missingCalendarDates+" missing calendar dates":""}.
            No attendance will be inferred where the school configuration is incomplete.
          </p>)}
        </div>}
        <div className="mt-6 grid grid-cols-3 gap-3" aria-label="Roster summary">
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Expected onsite</p><p className="mt-1 text-2xl font-semibold">{students.length}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Marked</p><p className="mt-1 text-2xl font-semibold">{marked}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Pending excuses</p><p className="mt-1 text-2xl font-semibold">{excuses.length}</p></div>
        </div>
        {students.length === 0 && <p className="mt-8 text-sm">No students have a configured onsite attendance expectation for this date and your verified staff assignments.</p>}
        {students.length > 0 && <div className="mt-8 grid gap-4">
          {students.map(student => <section key={student.programId+":"+student.studentProfileId} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{student.studentName}</h2>
                <p className="text-xs text-muted-foreground">{student.programName} · {student.sectionTitle ?? "Program enrollment"}</p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs capitalize">{student.status}</span>
            </div>
            {student.status!=="unmarked" && <label className="mt-3 block text-xs text-muted-foreground">Correction note (required to override an approved excuse)
              <input value={correctionNotes[student.programId+":"+student.studentProfileId]??""}
                onChange={e=>setCorrectionNotes(current=>({...current,[student.programId+":"+student.studentProfileId]:e.target.value}))}
                placeholder="Reason for correction"
                className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"/>
            </label>}
            <div className="mt-4 flex flex-wrap gap-2">
              {statusOptions.map(option => <button
                key={option}
                type="button"
                disabled={busy !== ""}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize disabled:opacity-50 ${student.status === option ? "bg-primary text-primary-foreground" : ""}`}
                onClick={() => mark(student, option)}
              >
                {option}
              </button>)}
            </div>
          </section>)}
        </div>}
        <h2 className="mt-10 font-serif text-2xl">Pending excuses</h2>
        {excuses.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No guardian excuses are waiting for review.</p>}
        {excuses.length > 0 && <div className="mt-4 grid gap-4">
          {excuses.map(excuse => <section key={excuse.excuseId} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{excuse.studentName}</h3>
                <p className="text-xs text-muted-foreground">
                  Marked {excuse.eventStatus} on {new Date(excuse.expectedAt).toLocaleDateString()} · submitted {new Date(excuse.submittedAt).toLocaleDateString()}
                </p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs">Submitted</span>
            </div>
            <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{excuse.reason}</p>
            <ExcuseAttachments attendanceEventId={excuse.attendanceEventId}
              attachments={excuse.attachments} disabled={busy !== ""} />
            {!excuse.canReview && <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-400">Attendance was subsequently corrected. This earlier excuse cannot change the current mark. A registrar can close it with a reason.</p>}
            {excuse.canClose && excuse.currentAttendanceEventId &&
              <ObsoleteExcuseClosure excuse={excuse} onSaved={() => load(date)} />}
            <label className="mt-3 block text-sm font-semibold">
              Review note
              <textarea
                className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"
                rows={2}
                value={notes[excuse.excuseId] ?? ""}
                onChange={event => setNotes(current => ({ ...current, [excuse.excuseId]: event.target.value }))}
                placeholder="Optional note recorded with the decision"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy !== "" || !excuse.canReview}
                className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => review(excuse, "approved")}
              >Approve excuse</button>
              <button
                type="button"
                disabled={busy !== "" || !excuse.canReview}
                className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => review(excuse, "rejected")}
              >Reject</button>
            </div>
          </section>)}
        </div>}
      </>}
    </div>
  </main>;
}

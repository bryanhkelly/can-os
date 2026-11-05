import { QueryState, WorkspaceShell } from "@/components/workspace";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { normalizeClientError, type ClientError } from "@/lib/client-error";
import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { dateKeyInTimezone, formatTimestamp } from "@/modules/calendar/timezone";
import { attendanceQueueKey, readAttendanceQueue, type OfflineAttendanceMark } from "@/domain/attendance-queue";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ObsoleteExcuseClosure } from "@/components/operations/ObsoleteExcuseClosure";
import { ExcuseAttachments } from "@/components/operations/ExcuseAttachments";
import { AttendanceConfigurationNotice } from "@/components/operations/AttendanceConfigurationNotice";
import {optionalSearchUuid,siteProgramSelectionSchema} from "@/lib/route-search";
import {
  listExpectedOnsiteRoster, markExpectedOnsiteAttendance,
  listExpectedPendingExcuses, reviewCurrentAttendanceExcuse,
  getAttendanceWorkspace,
} from "@/modules/attendance/onsite-attendance-workflow.functions";

const attendanceSearchSchema=siteProgramSelectionSchema.pick({programId:true}).extend({
  programId:optionalSearchUuid,student:optionalSearchUuid,date:z.string().date().optional().catch(undefined),
});
export const Route = createFileRoute("/staff/attendance")({
  validateSearch: (search: Record<string, unknown>): { programId?: string; student?: string; date?: string } => attendanceSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => getAttendanceWorkspace({ data: deps }),
  component: StaffAttendancePage,
});

type RosterStudent = Awaited<ReturnType<typeof listExpectedOnsiteRoster>>["students"][number];
type PendingExcuse = Awaited<ReturnType<typeof listExpectedPendingExcuses>>["excuses"][number];

const statusOptions = ["present", "absent", "tardy"] as const;
type OfflineMark = OfflineAttendanceMark;

export async function loadAttendanceRoster(input: {
  date: string;
  programId: string;
  canReviewExcuses: boolean;
}) {
  const [roster, pending] = await Promise.all([
    listExpectedOnsiteRoster({ data: { date: input.date, programId: input.programId } }),
    input.canReviewExcuses
      ? listExpectedPendingExcuses().then(data => ({ ok: true as const, data }))
        .catch(error => ({ ok: false as const, error }))
      : Promise.resolve(null),
  ]);
  const excusesError: ClientError | null = pending && !pending.ok
    ? normalizeClientError(pending.error, "Pending excuse review is unavailable.")
    : null;
  return {
    ...roster,
    excuses: pending?.ok ? pending.data.excuses : [],
    excusesError,
  };
}

function StaffAttendancePage() {
  const workspace = Route.useLoaderData();
  const search = Route.useSearch();
  if (!workspace.selectedProgram) return <WorkspaceShell eyebrow="Attendance" title="Daily attendance">
    <p role="status">No authorized onsite school is available.</p>
  </WorkspaceShell>;
  return <StaffAttendanceWorkspace key={workspace.identity + workspace.selectedProgram.id + (search.date ?? "")} workspace={workspace} />;
}

function StaffAttendanceWorkspace({ workspace }: { workspace: Awaited<ReturnType<typeof getAttendanceWorkspace>> }) {
  const selectedProgram = workspace.selectedProgram!;
  const programId = selectedProgram.id;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queueKey = attendanceQueueKey(workspace.identity, selectedProgram.siteId, programId);
  const [date, setDate] = useState(() => search.date ?? dateKeyInTimezone(new Date(), selectedProgram.timezone));
  const rosterQuery = useQuery({
    queryKey: ["staff-attendance", workspace.identity, programId, date],
    queryFn: () => loadAttendanceRoster({ date, programId, canReviewExcuses: workspace.canReviewExcuses }),
    retry: (count, cause) => normalizeClientError(cause).retryable && count < 1,
  });
  const authorizedStudents = rosterQuery.data?.students ?? [];
  const students = authorizedStudents.filter(student => !search.student || student.studentProfileId === search.student);
  const programs = rosterQuery.data?.programs ?? [];
  const canConfigureAcademicYear = rosterQuery.data?.canConfigureAcademicYear ?? false;
  const excuses = rosterQuery.data?.excuses ?? [];
  const excusesError = rosterQuery.data?.excusesError ?? null;
  const readQueue = useCallback(() => {
    try { return readAttendanceQueue(window.sessionStorage, queueKey, workspace.identity, programId); }
    catch { return []; }
  }, [queueKey, workspace.identity, programId]);
  const writeQueue = useCallback((items: OfflineMark[]) => {
    window.sessionStorage.setItem(queueKey, JSON.stringify(items));
  }, [queueKey]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [correctionNotes,setCorrectionNotes]=useState<Record<string,string>>({});
  const [queued,setQueued]=useState<OfflineMark[]>([]);
  const [syncing,setSyncing]=useState(false);
  const [conflicts,setConflicts]=useState<OfflineMark[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const syncingRef = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(()=>{
    setQueued(readQueue());
    try {
      window.localStorage.removeItem("can-os:attendance:pending:v1");
      window.localStorage.removeItem("can-os:attendance:pending:v2");
    } catch { /* Storage can be disabled by browser policy. */ }
  },[readQueue]);
  const savePending=(mark:OfflineMark)=>{
    const next=[...readQueue().filter(item=>item.mutationId!==mark.mutationId),mark];
    writeQueue(next);setQueued(next);
  };
  const synchronize=useCallback(async()=>{
    if (syncingRef.current || !active.current) return;
    if(typeof navigator!=="undefined"&&!navigator.onLine)return;
    const pending=readQueue();
    if(!pending.length)return;
    syncingRef.current = true;
    setSyncing(true);
    try{
      const current = await getAttendanceWorkspace({ data: { programId } });
      if (!active.current) return;
      if (current.identity !== workspace.identity || current.selectedProgram?.siteId !== selectedProgram.siteId) {
        setQueued([]); setConflicts([]);
        setError("Workspace changed. Reload attendance before reviewing pending entries.");
        return;
      }
      const remaining:OfflineMark[]=[];
      for(let i=0;i<pending.length;i++){
        if (!active.current) return;
        const mark=pending[i]!;
        try{
          await markExpectedOnsiteAttendance({data:mark});
          const next = readQueue().filter(item => item.mutationId !== mark.mutationId);
          writeQueue(next);
          if (active.current) setQueued(next);
        }
        catch(error){
          if (!active.current) return;
          remaining.push(...readQueue());
          if(normalizeClientError(error).code==="ATTENDANCE_CONFLICT")
           setConflicts(previous=>[...previous.filter(x=>x.mutationId!==mark.mutationId),mark]);
          writeQueue(remaining);setQueued(remaining);
          setError(mutationErrorMessage(error, "Some attendance entries could not be synchronized"));
          return;
        }
      }
      if (!active.current) return;
      setQueued(readQueue());setNotice("Offline attendance synchronization completed.");
      setError("");
    }catch(error){
      if (!active.current) return;
      setQueued([]); setConflicts([]);
      setError(mutationErrorMessage(error, "Verify your attendance workspace before synchronizing"));
    }finally{syncingRef.current = false; if (active.current) setSyncing(false);}
  },[readQueue, writeQueue, programId, workspace.identity, selectedProgram.siteId]);
  useEffect(()=>{
    window.addEventListener("online",synchronize);
    if(navigator.onLine)void synchronize();
    return ()=>window.removeEventListener("online",synchronize);
  },[synchronize]);
  async function load() {
    await rosterQuery.refetch();
    setError("");
  }

  const mark = async (student: RosterStudent, status: (typeof statusOptions)[number]) => {
    const change:OfflineMark={studentProfileId:student.studentProfileId,programId:student.programId,date,status,
      mutationId:crypto.randomUUID(),note:correctionNotes[student.programId+":"+student.studentProfileId]??"",
      expectedPreviousEventId:student.attendanceEventId, queueContext: workspace.identity};
    setBusy(change.mutationId);setNotice("");
    try {
      if(!navigator.onLine){
        savePending(change);
        setNotice("Offline: attendance entry saved on this device. It will synchronize when connected.");
      }else{
        await markExpectedOnsiteAttendance({data:change});
        setNotice(student.studentName+" marked "+status+".");
        await load();
      }
    }catch(cause){
      if(!navigator.onLine){
        try {
          savePending(change);
          setNotice("Offline: entry saved in this tab for synchronization.");
        } catch { setError("Offline attendance could not be saved. Keep this page open and reconnect before recording the change."); }
      }else{
        setError(mutationErrorMessage(cause, "Unable to record attendance"));
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
      await load();
    } catch (cause) {
      setNotice(mutationErrorMessage(cause, "Unable to review excuse"));
    } finally {
      setBusy("");
    }
  };

  const marked = students.filter(student => student.status !== "unmarked" && student.status !== "expected").length;

  return <WorkspaceShell width="standard" eyebrow="Attendance" title="Daily attendance" subtitle={selectedProgram.name + " · " + selectedProgram.timezone}>
      <label className="mt-4 block text-sm font-semibold">School Program
        <select value={programId} onChange={event => void navigate({ search: { programId: event.target.value } })} className="mt-2 w-full rounded border bg-background p-3">
          {workspace.programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
        </select>
      </label>
      {programId && <div role="status" className="mt-4 rounded-lg border p-3 text-sm">
        Showing the expected onsite roster for the selected Program. {workspace.canReviewExcuses
          ? "Pending guardian excuses still cover all students in your authorized review queue."
          : "Guardian excuse review is not available in this workspace."}
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
      {excusesError && <QueryState error={excusesError.message}
        onRetry={excusesError.retryable ? () => void rosterQuery.refetch() : undefined}
        retrying={rosterQuery.isFetching} />}
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
        <button type="button" onClick={()=>{setConflicts([]);void load();}}
          className="mt-2 rounded border px-3 py-2 text-xs">Refresh school records</button>
      </div>}
      {queued.length>0&&<div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
        <span>{queued.length} attendance {queued.length===1?"entry":"entries"} stored on this device pending synchronization.</span>
        <button type="button" disabled={syncing||!navigator.onLine} onClick={()=>void synchronize()}
          className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">
          {syncing?"Synchronizing…":"Synchronize now"}
        </button>
      </div>}

      {error && <p role="alert" className="mt-8 rounded-lg border p-4 text-sm">{error}</p>}
      <QueryState loading={rosterQuery.isPending && !error ? "Loading attendance roster..." : undefined}
        error={!error && rosterQuery.error
          ? normalizeClientError(rosterQuery.error, "Unable to load attendance roster.").message : undefined}
        onRetry={!error && rosterQuery.isError && normalizeClientError(rosterQuery.error).retryable
          ? () => void rosterQuery.refetch() : undefined}
        retrying={rosterQuery.isFetching} />
      {!rosterQuery.isPending && !rosterQuery.isError && !error && <>
        {search.student&&<Link to="/staff/attendance" search={{programId,date}} className="mt-4 inline-block text-sm underline">Full attendance roster</Link>}
        {search.student&&!students.length&&<p role="status" className="mt-4 rounded border p-4 text-sm">This student is unavailable in your authorized attendance roster for this date.</p>}
        <AttendanceConfigurationNotice programs={programs} canConfigure={canConfigureAcademicYear} date={date}/>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Roster summary">
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Expected onsite</p><p className="mt-1 text-2xl font-semibold">{students.length}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Marked</p><p className="mt-1 text-2xl font-semibold">{marked}</p></div>
          {workspace.canReviewExcuses&&<div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Pending excuses</p><p className="mt-1 text-2xl font-semibold">{excuses.length}</p></div>}
        </div>
        {students.length === 0 && <p className="mt-8 text-sm">No students have a configured onsite attendance expectation for this date and your verified staff assignments.</p>}
        {students.length > 0 && <div className="mt-8 grid gap-4">
          {students.map(student => <section key={student.programId+":"+student.studentProfileId} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold"><Link to="/staff/attendance" search={{programId,date,student:student.studentProfileId}} className="underline">{student.studentName}</Link></h2>
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
        {workspace.canReviewExcuses&&<>
        <h2 className="mt-10 font-serif text-2xl">Pending excuses</h2>
        {!excusesError&&excuses.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No guardian excuses are waiting for review.</p>}
        {!excusesError&&excuses.length > 0 && <div className="mt-4 grid gap-4">
          {excuses.map(excuse => <section key={excuse.excuseId} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{excuse.studentName}</h3>
                <p className="text-xs text-muted-foreground">
                  Marked {excuse.eventStatus} on {formatTimestamp(excuse.expectedAt,excuse.timezone,{dateStyle:"medium"})} · submitted {formatTimestamp(excuse.submittedAt,excuse.timezone,{dateStyle:"medium"})} ({excuse.timezone})
                </p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs">Submitted</span>
            </div>
            <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{excuse.reason}</p>
            <ExcuseAttachments attendanceEventId={excuse.attendanceEventId}
              attachments={excuse.attachments} disabled={busy !== ""} />
            {!excuse.canReview && <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-400">Attendance was subsequently corrected. This earlier excuse cannot change the current mark. A registrar can close it with a reason.</p>}
            {excuse.canClose && excuse.currentAttendanceEventId &&
              <ObsoleteExcuseClosure excuse={excuse} onSaved={() => load()} />}
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
      </>}
  </WorkspaceShell>;
}

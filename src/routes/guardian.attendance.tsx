import { EmptyState, WorkspaceShell, StatCard, StatusBadge } from "@/components/workspace";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { listGuardianEffectiveAbsences, submitEffectiveAttendanceExcuse } from "@/modules/attendance/onsite-attendance-workflow.functions";
import { createExcuseAttachmentUpload, attachDocumentToExcuse, listExcuseAttachmentCounts } from "@/modules/learning/submission-attachments.functions";
import { attachmentAccept, attachmentMimeForFileName } from "@/modules/learning/attachment-mimes";
import { GuardianPickupPanel } from "@/components/operations/GuardianPickupPanel";
import { createPrivateUploadTask, documentUploadPolicy } from "@/platform/storage/private-upload";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { formatTimestamp } from "@/modules/calendar/timezone";
import { plural } from "@/lib/format";

// Shared with the server-side excuse attachment validation (attachment-mimes).
const excuseAttachmentAccept = attachmentAccept;
const excuseAttachmentMime = attachmentMimeForFileName;
const formatStatus=(status:string)=>status.replaceAll("_"," ").replace(/^\w/,letter=>letter.toUpperCase());

export const Route = createFileRoute("/guardian/attendance")({
 validateSearch:(search:Record<string,unknown>):{student?:string;attendance?:string}=>({
  student:typeof search.student==="string"?search.student:undefined,
  attendance:typeof search.attendance==="string"?search.attendance:undefined,
 }),
 component: () => <GuardianAttendancePage key={JSON.stringify(Route.useSearch())}/>,
});

type Absence = Awaited<ReturnType<typeof listGuardianEffectiveAbsences>>["absences"][number];

function GuardianAttendancePage() {
  const {student,attendance}=Route.useSearch();
  const [absences, setAbsences] = useState<Absence[]>([]);
  const requestVersion = useRef(0);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [excuseFiles, setExcuseFiles] = useState<Record<string, File | null>>({});
  const uploads = useRef(new Map<string,{file:File;task:{run:()=>Promise<unknown>}}>());

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const result = await listGuardianEffectiveAbsences({data:{studentPersonId:student}});
      if (version !== requestVersion.current) return;
      setAbsences(result.absences);
      const excusedIds = result.absences.filter(absence => absence.excuse).map(absence => absence.attendanceEventId);
      if (excusedIds.length) {
        // Counts are optional decoration: a document-service problem must never
        // conceal attendance cases or prevent a family from submitting an excuse.
        try {
          const counts = await listExcuseAttachmentCounts({ data: { attendanceEventIds: excusedIds } });
          if (version === requestVersion.current) setDocCounts(Object.fromEntries(counts.counts.map(count => [count.attendanceEventId, count.count])));
        } catch {
          if (version === requestVersion.current) setDocCounts({});
        }
      } else {
        if (version === requestVersion.current) setDocCounts({});
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [student]);
  const mutation = useMutationFeedback(load);
  const busy = mutation.pending || mutation.refreshFailed;

  useEffect(() => {
    // Clear drafts when switching children to avoid cross-child form state.
    setReasons({});
    setExcuseFiles({});
    setNotice("");
    void load().catch(cause => {
      setAbsences([]);
      setError(mutationErrorMessage(cause, "Unable to load attendance."));
    });
  }, [load]);

  const submit = async (absence: Absence) => {
    setNotice("");
    setError("");
    await mutation.run(async () => {
      await submitEffectiveAttendanceExcuse({
        data: { attendanceEventId: absence.attendanceEventId, reason: reasons[absence.attendanceEventId] ?? "" },
      });
    }, { successMessage: `Excuse submitted for ${absence.studentName}. You can attach a supporting document below.`,
      commandErrorMessage: "Unable to submit excuse" });
  };

  const attachDocument = async (absence: Absence) => {
    const file = excuseFiles[absence.attendanceEventId];
    if (!file) return;
    setNotice("");
    setError("");
    await mutation.run(async () => {
      const contentType = excuseAttachmentMime(file.name);
      if (!contentType) throw new Error("Unsupported file type. Use PDF, PNG or JPG.");
      let attempt=uploads.current.get(absence.attendanceEventId);
      if(attempt?.file!==file){
        attempt={file,task:createPrivateUploadTask({file,contentType,policy:documentUploadPolicy,
          begin:()=>createExcuseAttachmentUpload({data:{
            attendanceEventId:absence.attendanceEventId,fileName:file.name,contentType,sizeBytes:file.size,
          }}),
          finish:upload=>attachDocumentToExcuse({data:{attendanceEventId:absence.attendanceEventId,documentId:upload.documentId}}),
        })};
        uploads.current.set(absence.attendanceEventId,attempt);
      }
      await attempt.task.run();
      uploads.current.delete(absence.attendanceEventId);
      setExcuseFiles(current => ({ ...current, [absence.attendanceEventId]: null }));
      setDocCounts(current => ({ ...current, [absence.attendanceEventId]: (current[absence.attendanceEventId] ?? 0) + 1 }));
    }, { successMessage: `Document attached for ${absence.studentName}.`,
      commandErrorMessage: "Unable to attach document. Retry to finish without uploading the file again." });
  };

  const needsExcuse = absences.filter(absence => !absence.excuse &&
    (absence.status === "absent" || absence.status === "tardy"));

  return <WorkspaceShell width="wide" eyebrow="Family" title="Attendance & excuses"
    subtitle={`Review recent attendance cases and submit explanations for authorized school review. Submitted excuses do not automatically change attendance.${student?" Showing the selected child.":""}`}
    breadcrumbs={<><Link to="/home" search={{student}} className="underline focus-visible:outline-2">Family home</Link><span>/</span><span>Attendance</span></>}>
      {notice && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{notice}</p>}
      <MutationFeedback state={mutation} className="mt-4" pendingMessage="Saving attendance information..."/>
      {error && <p role="alert" className="mt-8 rounded-lg border p-4 text-sm">{error}</p>}
      {loading && !error && <p role="status" className="mt-8 text-sm">Loading attendance…</p>}
      {!loading && !error && <>
        {attendance&&<Link to="/guardian/attendance" search={{student}} className="mt-4 inline-flex min-h-11 items-center text-sm underline focus-visible:outline-2">View all attendance for this child</Link>}
        {attendance&&!absences.some(item=>item.relatedAttendanceEventIds.includes(attendance))&&<p role="alert" className="mt-4 rounded-xl border p-4">This attendance record is unavailable in the current view.</p>}
        <div className="mt-6 grid gap-3 min-[480px]:grid-cols-3" aria-label="Attendance summary">
          <StatCard label="Recent attendance cases" value={absences.length}/>
          <StatCard label="Needs an excuse" value={needsExcuse.length} className={needsExcuse.length>0?"border-warning/50":undefined}/>
          <StatCard label="Excuses submitted" value={absences.filter(absence => absence.excuse).length}/>
        </div>
        {absences.length === 0 && <EmptyState className="mt-8 bg-card" title="No recent absence or tardy cases were found for your students."/>}
        {absences.length > 0 && <div className="mt-8 grid gap-4">
          {absences.filter(item=>!attendance||item.relatedAttendanceEventIds.includes(attendance)).map(absence => <section key={absence.attendanceEventId} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{absence.studentName}</h2>
                <p className="text-xs text-muted-foreground">{formatTimestamp(absence.expectedAt,absence.timezone,{dateStyle:"medium"})}</p>
              </div>
              <StatusBadge tone={
                absence.status==="present"||absence.excuse?.status==="approved"?"success":
                absence.excuse?.status==="rejected"?"danger":
                absence.excuse?"info":
                absence.status==="absent"||absence.status==="tardy"?"attention":"neutral"
              }>{absence.excuse ? `Excuse ${formatStatus(absence.excuse.status)}` : formatStatus(absence.status)}</StatusBadge>
            </div>
            {absence.status === "present" && <p className="mt-3 text-xs text-muted-foreground">The school corrected this attendance case to present. No excuse is required.</p>}
            {absence.historicalExcuses.length > 0 && <div className="mt-3 space-y-2" aria-label="Earlier excuse history">
              <h3 className="text-sm font-semibold">Earlier excuses for this attendance case</h3>
              {absence.historicalExcuses.map(excuse => <div key={excuse.excuseId} className="rounded border p-3 text-sm">
                <p>Earlier excuse: {excuse.status}. This does not describe the current attendance mark.</p>
                <p className="mt-1">{excuse.reason}</p>
                {excuse.reviewNote && <p className="mt-1">School note: {excuse.reviewNote}</p>}
              </div>)}
            </div>}
            {absence.excuse && <div className="mt-3">
              <p className="rounded-lg bg-muted p-3 text-sm">Your excuse: {absence.excuse.reason}</p>
              <p className="mt-2 text-xs text-muted-foreground">{plural(docCounts[absence.attendanceEventId] ?? 0, "document")} attached</p>
              {absence.excuse.status === "approved" && <p className="mt-2 text-sm">Approved — this day now counts as excused.</p>}
              {absence.excuse.status === "rejected" && <div className="mt-2 rounded-lg border p-3 text-sm">
                <p className="font-semibold">The school rejected this excuse.</p>
                {absence.excuse.reviewNote && <p className="mt-2 whitespace-pre-wrap">School note: {absence.excuse.reviewNote}</p>}
                <p className="mt-2 text-muted-foreground">Review the reason with your school if this attendance mark still needs to be corrected. This reviewed excuse cannot be submitted again from this page.</p>
                <Link to="/messages" className="mt-3 inline-block font-semibold underline">Contact the school in Family inbox</Link>
              </div>}
              {absence.excuse.status === "submitted" && <div className="mt-2">
                <p className="text-sm text-muted-foreground">Waiting for the school to review.</p>
                <label className="mt-3 block text-sm font-semibold">
                  Supporting document <span className="font-normal text-muted-foreground">(optional · PDF, PNG or JPG · up to 10 MB)</span>
                  <input
                    key={`${absence.attendanceEventId}:${docCounts[absence.attendanceEventId] ?? 0}`}
                    type="file"
                    accept={excuseAttachmentAccept}
                    disabled={busy}
                    className="mt-2 w-full rounded-lg border bg-background p-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
                    onChange={event => setExcuseFiles(current => ({ ...current, [absence.attendanceEventId]: event.target.files?.[0] ?? null }))}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !excuseFiles[absence.attendanceEventId]}
                  className="mt-2 inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline-2 disabled:opacity-50"
                  onClick={() => attachDocument(absence)}
                >Attach document</button>
              </div>}
            </div>}
            {!absence.excuse && (absence.status === "absent" || absence.status === "tardy") && <div className="mt-3">
              <label className="block text-sm font-semibold">
                Excuse reason
                <textarea
                  className="mt-2 w-full rounded-lg border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  rows={3}
                  value={reasons[absence.attendanceEventId] ?? ""}
                  onChange={event => setReasons(current => ({ ...current, [absence.attendanceEventId]: event.target.value }))}
                  placeholder="Tell the school why your student was absent"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                className="mt-3 inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline-2 disabled:opacity-50"
                onClick={() => submit(absence)}
              >Submit excuse</button>
            </div>}
          </section>)}
        </div>}
      </>}
      <GuardianPickupPanel studentPersonId={student} />
  </WorkspaceShell>;
}

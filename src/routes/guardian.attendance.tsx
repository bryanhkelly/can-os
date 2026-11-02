import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, QueryState, StatCard, StatusBadge, WorkspaceShell } from "@/components/workspace";
import { listGuardianEffectiveAbsences, submitEffectiveAttendanceExcuse } from "@/modules/attendance/onsite-attendance-workflow.functions";
import { createExcuseAttachmentUpload, attachDocumentToExcuse, listExcuseAttachmentCounts } from "@/modules/learning/submission-attachments.functions";
import { attachmentContentType, PrivateUploadCompletion, validateUploadFile, type PrivateUpload } from "@/platform/storage/private-upload";
import { normalizeClientError } from "@/lib/client-error";

const excuseAttachmentAccept = ".pdf,.png,.jpg,.jpeg";

export const Route = createFileRoute("/guardian/attendance")({
 validateSearch:(search:Record<string,unknown>):{student?:string;attendance?:string}=>({
  student:typeof search.student==="string"?search.student:undefined,
  attendance:typeof search.attendance==="string"?search.attendance:undefined,
 }),
 component: GuardianAttendancePage,
});

type Absence = Awaited<ReturnType<typeof listGuardianEffectiveAbsences>>["absences"][number];

function GuardianAttendancePage() {
  const {student,attendance}=Route.useSearch();
  return <GuardianAttendanceView key={student ?? "all-students"} student={student} attendance={attendance}/>;
}

function GuardianAttendanceView({student,attendance}:{student?:string;attendance?:string}) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [interactive, setInteractive] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [excuseFiles, setExcuseFiles] = useState<Record<string, File | null>>({});
  const pendingUploads = useRef(new Map<string, PrivateUploadCompletion<PrivateUpload & { documentId: string }>>());
  const uploadAbort = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const active = useRef(false);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await listGuardianEffectiveAbsences({data:{studentPersonId:student}});
      if (!active.current || currentRequest !== requestId.current) return;
      const excusedIds = result.absences.filter(absence => absence.excuse).map(absence => absence.attendanceEventId);
      let nextDocCounts: Record<string, number> = {};
      if (excusedIds.length) {
        const counts = await listExcuseAttachmentCounts({ data: { attendanceEventIds: excusedIds } });
        if (!active.current || currentRequest !== requestId.current) return;
        nextDocCounts = Object.fromEntries(counts.counts.map(count => [count.attendanceEventId, count.count]));
      }
      if (!active.current || currentRequest !== requestId.current) return;
      setAbsences(result.absences);
      setDocCounts(nextDocCounts);
    } catch {
      if (!active.current || currentRequest !== requestId.current) return;
      setAbsences([]);
      setDocCounts({});
      setError("Sign in with an authorized guardian account to review attendance.");
    } finally {
      if (active.current && currentRequest === requestId.current) setLoading(false);
    }
  }, [student]);

  useEffect(() => {
    setInteractive(true);
    active.current = true;
    void load();
    return () => {
      active.current = false;
      requestId.current += 1;
    };
  }, [load]);
  useEffect(() => () => uploadAbort.current?.abort(), []);

  const submit = async (absence: Absence) => {
    setBusy(absence.attendanceEventId);
    setNotice("");
    try {
      await submitEffectiveAttendanceExcuse({
        data: { attendanceEventId: absence.attendanceEventId, reason: reasons[absence.attendanceEventId] ?? "" },
      });
      if (!active.current) return;
      setNotice(`Excuse submitted for ${absence.studentName}. You can attach a supporting document below.`);
      await load();
    } catch (cause) {
      if (active.current) setNotice(cause instanceof Error ? cause.message : "Unable to submit excuse");
    } finally {
      if (active.current) setBusy("");
    }
  };

  const attachDocument = async (absence: Absence) => {
    const file = excuseFiles[absence.attendanceEventId];
    if (!file) return;
    const controller = new AbortController();
    uploadAbort.current = controller;
    setBusy(`${absence.attendanceEventId}:attach`);
    setNotice("");
    try {
      const contentType = attachmentContentType(file.name);
      validateUploadFile(file, contentType);
      let completion = pendingUploads.current.get(absence.attendanceEventId);
      if (!completion) {
        completion = new PrivateUploadCompletion<PrivateUpload & { documentId: string }>();
        pendingUploads.current.set(absence.attendanceEventId, completion);
      }
      await completion.run(file,
        () => createExcuseAttachmentUpload({
          data: { attendanceEventId: absence.attendanceEventId, fileName: file.name, contentType, sizeBytes: file.size },
        }),
        upload => attachDocumentToExcuse({
          data: { attendanceEventId: absence.attendanceEventId, documentId: upload.documentId },
        }),
        controller.signal);
      pendingUploads.current.delete(absence.attendanceEventId);
      if (!active.current) return;
      setNotice(`Document attached for ${absence.studentName}.`);
      setExcuseFiles(current => ({ ...current, [absence.attendanceEventId]: null }));
      setDocCounts(current => ({ ...current, [absence.attendanceEventId]: (current[absence.attendanceEventId] ?? 0) + 1 }));
    } catch (cause) {
      if (active.current) setNotice(normalizeClientError(cause, { fallback: "Unable to attach document." }).message);
    } finally {
      if (uploadAbort.current === controller) uploadAbort.current = null;
      if (active.current) setBusy("");
    }
  };

  const needsExcuse = absences.filter(absence => !absence.excuse &&
    (absence.status === "absent" || absence.status === "tardy"));

  return (
    <WorkspaceShell
      width="wide"
      eyebrow="CAN OS · Family"
      title="Attendance & excuses"
      subtitle={`Review recent absences and submit an excuse for the school to review.${student ? " Showing the selected child." : ""}`}
      actions={<Link to="/guardian" className="rounded-lg border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">Family home</Link>}
    >
      {notice && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{notice}</p>}
      <QueryState loading={loading ? "Loading attendance…" : ""} error={error}>
        <>
          {attendance && <Link to="/guardian/attendance" search={{ student }} className="mt-4 inline-block text-sm underline focus-visible:outline-2">View all attendance for this child</Link>}
          {attendance && !absences.some(item => item.relatedAttendanceEventIds.includes(attendance)) && <p role="alert" className="mt-4 rounded-xl border p-4">This attendance record is unavailable in the current view.</p>}
          <div className="mt-6 grid gap-3 min-[420px]:grid-cols-3" aria-label="Attendance summary">
            <StatCard label="Recent attendance cases" value={absences.length}/>
            <StatCard label="Needs an excuse" value={needsExcuse.length} className={needsExcuse.length ? "border-amber-500/50" : undefined}/>
            <StatCard label="Excuses submitted" value={absences.filter(absence => absence.excuse).length}/>
          </div>
          {absences.length === 0 && <EmptyState className="mt-8 bg-card" title="No recent absence or tardy cases were found for your students."/>}
          {absences.length > 0 && <div className="mt-8 grid gap-4">
          {absences.filter(item=>!attendance||item.relatedAttendanceEventIds.includes(attendance)).map(absence => <section key={absence.attendanceEventId} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{absence.studentName}</h2>
                <p className="text-xs text-muted-foreground">{new Date(absence.expectedAt).toLocaleDateString()}</p>
              </div>
              <StatusBadge tone={absence.excuse?.status === "approved" || absence.status === "present" ? "success" : absence.excuse?.status === "rejected" || needsExcuse.includes(absence) ? "attention" : "neutral"}>
                {absence.excuse ? `Excuse ${absence.excuse.status}` : absence.status}
              </StatusBadge>
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
              <p className="mt-2 text-xs text-muted-foreground">{docCounts[absence.attendanceEventId] ?? 0} document(s) attached</p>
              {absence.excuse.status === "approved" && <p className="mt-2 text-sm">Approved — this day now counts as excused.</p>}
              {absence.excuse.status === "rejected" && <p className="mt-2 text-sm">Rejected by the school.{absence.excuse.reviewNote ? ` Note: ${absence.excuse.reviewNote}` : ""}</p>}
              {absence.excuse.status === "submitted" && <div className="mt-2">
                <p className="text-sm text-muted-foreground">Waiting for the school to review.</p>
                <label className="mt-3 block text-sm font-semibold">
                  Supporting document                   <span className="font-normal text-muted-foreground">(optional · PDF, PNG or JPEG · up to 10 MB)</span>
                  <input
                    key={`${absence.attendanceEventId}:${docCounts[absence.attendanceEventId] ?? 0}`}
                    type="file"
                    accept={excuseAttachmentAccept}
                    disabled={busy !== "" || !interactive}
                    className="mt-2 w-full rounded-lg border bg-background p-2 text-xs focus-visible:outline-2"
                    onChange={event => setExcuseFiles(current => ({ ...current, [absence.attendanceEventId]: event.target.files?.[0] ?? null }))}
                  />
                </label>
                <button
                  type="button"
                  disabled={!interactive || busy !== "" || !excuseFiles[absence.attendanceEventId]}
                  className="mt-2 rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline-2 disabled:opacity-50"
                  onClick={() => attachDocument(absence)}
                >Attach document</button>
              </div>}
            </div>}
            {!absence.excuse && (absence.status === "absent" || absence.status === "tardy") && <div className="mt-3">
              <label className="block text-sm font-semibold">
                Excuse reason
                <textarea
                  className="mt-2 w-full rounded-lg border bg-background p-3 text-sm focus-visible:outline-2"
                  rows={3}
                  disabled={!interactive || busy !== ""}
                  value={reasons[absence.attendanceEventId] ?? ""}
                  onChange={event => setReasons(current => ({ ...current, [absence.attendanceEventId]: event.target.value }))}
                  placeholder="Tell the school why your student was absent"
                />
              </label>
              <button
                type="button"
                disabled={!interactive || busy !== ""}
                className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline-2 disabled:opacity-50"
                onClick={() => submit(absence)}
              >Submit excuse</button>
            </div>}
          </section>)}
        </div>}
        </>
      </QueryState>
    </WorkspaceShell>
  );
}

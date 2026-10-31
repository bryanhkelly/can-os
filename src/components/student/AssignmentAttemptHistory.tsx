import { useState } from "react";
import { getSyntheticAssignmentHistory } from "@/modules/student-experience/assignments.functions";
import { listSubmissionAttachments, getSubmissionAttachmentDownload } from "@/modules/learning/submission-attachments.functions";

type Attempts = Awaited<ReturnType<typeof getSyntheticAssignmentHistory>>;

export function AssignmentAttemptHistory({ assessmentId }: { assessmentId: string }) {
  const [attempts, setAttempts] = useState<Attempts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true); setError("");
    try { setAttempts(await getSyntheticAssignmentHistory({ data: { assessmentId } })); }
    catch { setError("Unable to load your earlier attempts. Try again."); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 rounded-lg border p-4" aria-label="Submission history">
    <h3 className="text-sm font-semibold">Submission history</h3>
    {!attempts && <button type="button" disabled={busy} onClick={load} className="mt-3 text-sm underline">
      {busy ? "Loading attempts…" : "Review responses and feedback"}
    </button>}
    {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    {attempts?.map(attempt => <details key={attempt.attempt} className="mt-3 rounded border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Attempt {attempt.attempt} · {attempt.status}</summary>
      {attempt.submittedAt && <p className="mt-2 text-xs">Submitted {new Date(attempt.submittedAt).toLocaleString()}</p>}
      <p className="mt-3 text-xs font-semibold">Your saved response</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{attempt.text || "No written response recorded."}</p>
      {attempt.score !== null && <p className="mt-3 text-sm">Score: {attempt.score}</p>}
      {attempt.feedback && <><p className="mt-3 text-xs font-semibold">Teacher feedback</p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{attempt.feedback}</p></>}
      <AttemptFiles assessmentId={assessmentId} attemptNumber={attempt.attempt}/>
    </details>)}
  </section>;
}

function AttemptFiles({assessmentId,attemptNumber}:{assessmentId:string;attemptNumber:number}) {
  const [files,setFiles]=useState<{documentId:string;fileName:string}[]|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function load() {
    setBusy(true);setError("");
    try {setFiles((await listSubmissionAttachments({data:{assessmentId,attemptNumber}})).attachments);}
    catch {setError("Unable to load files for this attempt.");}
    finally {setBusy(false);}
  }
  async function download(documentId:string) {
    setError("");
    try {window.location.assign((await getSubmissionAttachmentDownload({data:{assessmentId,attemptNumber,documentId}})).downloadUrl);}
    catch {setError("Unable to open this file. Your enrollment or access may have changed.");}
  }
  return <div className="mt-3 text-sm">
    {!files&&<button type="button" disabled={busy} className="underline" onClick={load}>{busy?"Loading files…":"Review files for this attempt"}</button>}
    {files?.length===0&&<p>No verified attachments on this attempt.</p>}
    {files?.map(file=><button type="button" key={file.documentId} onClick={()=>download(file.documentId)} className="mt-1 block underline">{file.fileName}</button>)}
    {error&&<p role="alert" className="mt-2">{error}</p>}
  </div>;
}

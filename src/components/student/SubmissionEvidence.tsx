import { useEffect, useState } from "react";
import { getSubmissionReview, getTeacherSubmissionAttachment } from "@/modules/learning/gradebook.functions";
import { SubmissionAnnotations } from "@/components/learning/SubmissionAnnotations";

export function SubmissionEvidence({ submissionId, historical = false }: { submissionId: string; historical?: boolean }) {
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [review, setReview] = useState<Awaited<ReturnType<typeof getSubmissionReview>> | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    let active = true;
    setReview(null); setError("");
    getSubmissionReview({ data: { submissionId } }).then(result => {
      if (active) setReview(result);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load submitted work.");
    });
    return () => { active = false; };
  }, [submissionId]);
  async function download(documentId: string) {
    setOpening(true); setError("");
    try {
      const result = await getTeacherSubmissionAttachment({ data: { submissionId, documentId } });
      window.location.assign(result.downloadUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open this attachment.");
    } finally { setOpening(false); }
  }
  return <section aria-label="Submitted work" className="mb-5 space-y-4 border-b pb-5">
    {error && <p role="alert" className="rounded-lg border border-red-400 p-3 text-sm">{error}</p>}
    {!review && !error && <p role="status" className="text-sm">Loading submitted work...</p>}
    {review && <>
      <p className="text-sm text-muted-foreground">Attempt {review.attemptNumber}{review.submittedAt ? ` · Submitted ${new Date(review.submittedAt).toLocaleString()}` : ""}</p>
      {historical && <div className="rounded-lg border p-3 text-sm">
        <p className="font-semibold">Previous attempt · {review.score !== null ? review.score+" points" : "Not scored"}</p>
        {review.feedbackComment && <p className="mt-2 whitespace-pre-wrap">{review.feedbackComment}</p>}
        <p className="mt-2 text-xs text-muted-foreground">Read-only history. Grading below applies to the current submission.</p>
      </div>}
      <div className="max-h-96 overflow-y-auto rounded-lg border bg-muted/40 p-4">
        <h3 className="text-sm font-semibold">Student response</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{review.responseText || "No text response on this attempt. Check its attached files."}</p>
      </div>
      {review.attachments.length > 0 && <div>
        <h3 className="text-sm font-semibold">Verified attachments</h3>
        <ul className="mt-2 space-y-2">{review.attachments.map(file => <li key={file.id}>
          <button type="button" disabled={opening} onClick={() => void download(file.id)} className="text-sm underline disabled:opacity-50">{file.fileName}</button>
        </li>)}</ul>
      </div>}
      {!historical && review.attempts.length > 1 && <details>
        <summary className="cursor-pointer text-sm font-semibold">Submission history</summary>
        <ul className="mt-2 space-y-2 text-sm">{review.attempts.map(attempt => <li key={attempt.id}>
          Attempt {attempt.attemptNumber} · {attempt.status}{attempt.score !== null ? ` · ${attempt.score} points` : ""}
          {attempt.id !== submissionId && ["submitted", "graded", "returned"].includes(attempt.status) &&
            <button type="button" aria-expanded={historyId === attempt.id} onClick={() => setHistoryId(current => current === attempt.id ? null : attempt.id)}
              className="ml-3 underline">Review attempt {attempt.attemptNumber}</button>}
        </li>)}</ul>
        {historyId && <div className="mt-4 rounded-lg border p-4" aria-label="Previous submission evidence">
          <SubmissionEvidence key={historyId} submissionId={historyId} historical/>
        </div>}
      </details>}
      <SubmissionAnnotations key={submissionId} submissionId={submissionId} responseText={historical ? undefined : review.responseText}/>
    </>}
  </section>;
}

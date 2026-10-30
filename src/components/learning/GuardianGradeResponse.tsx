import { useEffect, useState } from "react";
import {
  getGuardianGradeResponse, requestGuardianGradeResponse,
} from "@/modules/learning/guardian-grade-response.functions";

type ResponseState = Awaited<ReturnType<typeof getGuardianGradeResponse>>["response"];

/**
 * One related guardian's question about a released grade. School staff respond
 * through their existing scoped operations queue; parent sees its status here.
 */
export function GuardianGradeResponse({ submissionId }: { submissionId: string }) {
  const [current, setCurrent] = useState<ResponseState>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    getGuardianGradeResponse({ data: { submissionId } })
      .then(result => { if (live) setCurrent(result.response); })
      .catch(() => { if (live) setError("School follow-up is unavailable for this grade."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [submissionId]);

  async function request(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      const result = await requestGuardianGradeResponse({ data: { submissionId, message } });
      const updated = await getGuardianGradeResponse({ data: { submissionId } });
      setCurrent(updated.response);
      setNotice(result.created ? "Your question was sent to the school." : "Your existing question is already recorded.");
      setMessage("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit your question.");
    } finally { setBusy(false); }
  }

  return <section className="mt-5 rounded-lg border p-4" aria-label="School grade follow-up">
    <h3 className="font-semibold">Ask the school about this grade</h3>
    <p className="mt-1 text-xs text-muted-foreground">Your question creates a school follow-up. It does not change the grade.</p>
    {loading ? <p className="mt-3 text-sm" role="status">Checking school response…</p> :
      current ? <div className="mt-3 space-y-2 text-sm">
        <p><strong>School response status:</strong> {current.status.replaceAll("_"," ")}</p>
        {current.requestMessage && <p className="whitespace-pre-wrap text-muted-foreground">Your question: {current.requestMessage}</p>}
        {current.resolutionNote && <p className="rounded-lg bg-muted p-3 whitespace-pre-wrap">School response: {current.resolutionNote}</p>}
      </div> : <form className="mt-3 space-y-3" onSubmit={request}>
        <label className="block text-sm font-medium">Your question
          <textarea className="mt-2 w-full rounded-lg border bg-background p-3" rows={3}
            value={message} minLength={10} maxLength={1000} required
            onChange={event => setMessage(event.target.value)}
            placeholder="What would you like the school to explain or follow up on?"/>
        </label>
        <button type="submit" disabled={busy}
          className="rounded-lg border bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">
          {busy ? "Sending…" : "Request school follow-up"}
        </button>
      </form>}
    {error && <p className="mt-3 text-sm" role="alert">{error}</p>}
    {notice && <p className="mt-3 text-sm" role="status">{notice}</p>}
  </section>;
}

function PreviousGradeResponse({ submissionId, attemptNumber }: { submissionId: string; attemptNumber: number }) {
  const [open, setOpen] = useState(false);
  return <details className="mt-4 rounded-lg border p-3" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-semibold">School follow-up for released attempt {attemptNumber}</summary>
    {open && <GuardianGradeResponse submissionId={submissionId}/>}
  </details>;
}

/** Keep accountable answers available after a revision creates a newer attempt. */
export function GuardianGradeResponseHistory({ attempts, currentSubmissionId }: {
  attempts: readonly { submissionId: string; attemptNumber: number }[];
  currentSubmissionId: string | null;
}) {
  return <>{attempts.map(attempt=>attempt.submissionId===currentSubmissionId
    ? <GuardianGradeResponse key={attempt.submissionId} submissionId={attempt.submissionId}/>
    : <PreviousGradeResponse key={attempt.submissionId} {...attempt}/>)}</>;
}

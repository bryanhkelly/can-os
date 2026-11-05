import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
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
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedRequest, setSavedRequest] = useState(false);
  const mutation=useMutationFeedback(async()=>{
    const updated=await getGuardianGradeResponse({data:{submissionId}});
    setCurrent(updated.response);
    setSavedRequest(Boolean(updated.response));
  });
  const busy=mutation.pending||mutation.refreshFailed;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    getGuardianGradeResponse({ data: { submissionId } })
      .then(result => { if (live) { setCurrent(result.response); setSavedRequest(Boolean(result.response)); } })
      .catch(() => { if (live) setError("School follow-up is unavailable for this grade."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [submissionId]);

  async function refresh() {
    if (mutation.pending || loading) return;
    if (mutation.refreshFailed) {
      await mutation.retryRefresh();
      return;
    }
    setLoading(true); setError("");
    try {
      const result = await getGuardianGradeResponse({ data: { submissionId } });
      setCurrent(result.response);
      setSavedRequest(Boolean(result.response));
    } catch {
      setError("Could not refresh the school's response. Your existing question was not changed.");
    } finally { setLoading(false); }
  }

  async function request(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if(message.trim().length<10)return;
    setError("");
    await mutation.run(async()=>{
      const result = await requestGuardianGradeResponse({ data: { submissionId, message } });
      // The write has succeeded: a transient status-read failure must not
      // invite the family to submit a second request.
      setSavedRequest(true);
      setMessage("");
      setAttempted(false);
      return result;
    },{successMessage:result=>result.created?"Your question was sent to the school.":"Your existing question is already recorded.",
      commandErrorMessage:"Unable to submit your question."});
  }

  return <section className="mt-5 rounded-lg border p-4" aria-label="School grade follow-up">
    <h3 className="font-semibold">Ask the school about this grade</h3>
    <p className="mt-1 text-xs text-muted-foreground">Your question creates a school follow-up. It does not change the grade.</p>
    <button type="button" onClick={() => void refresh()} disabled={mutation.pending || loading}
      className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
      {loading ? "Checking…" : "Refresh school response"}
    </button>
    {loading ? <p className="mt-3 text-sm" role="status">Checking school response…</p> :
      current ? <div className="mt-3 space-y-2 text-sm">
        <p><strong>School response status:</strong> {current.status==="resolved" ? "School responded" : "Awaiting school response"}</p>
        <p className="text-xs text-muted-foreground">Last updated {new Date(current.updatedAt).toLocaleString()}</p>
        {current.requestMessage && <p className="whitespace-pre-wrap text-muted-foreground">Your question: {current.requestMessage}</p>}
        {current.resolutionNote && <p className="rounded-lg bg-muted p-3 whitespace-pre-wrap">School response: {current.resolutionNote}</p>}
      </div> : savedRequest ? (
        <p className="mt-3 text-sm" role="status">Your question is recorded. Refresh the school response to see its current status.</p>
      ) : <form noValidate className="mt-3 space-y-3" onSubmit={request}>
        <Field label="Your question" className="text-sm" required
          error={attempted&&message.trim().length<10?"Enter at least 10 characters describing your question.":undefined}>
          <Textarea rows={3} minLength={10} maxLength={1000} value={message}
            onChange={event => setMessage(event.target.value)}
            placeholder="What would you like the school to explain or follow up on?"/>
        </Field>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? "Sending…" : "Request school follow-up"}
        </Button>
      </form>}
    {error && <p className="mt-3 text-sm" role="alert">{error}</p>}
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Sending school follow-up..."/>
  </section>;
}

function PreviousGradeResponse({ submissionId, attemptNumber, focusSubmissionId }: {
  submissionId: string; attemptNumber: number; focusSubmissionId?: string;
}) {
  const focused = submissionId === focusSubmissionId;
  const [open, setOpen] = useState(focused);
  useEffect(() => { if (focused) setOpen(true); }, [focused]);
  return <details open={open} className="mt-4 rounded-lg border p-3" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-semibold">School follow-up for released attempt {attemptNumber}</summary>
    {open && <GuardianGradeResponse submissionId={submissionId}/>}
  </details>;
}

/** Keep accountable answers available after a revision creates a newer attempt. */
export function GuardianGradeResponseHistory({ attempts, currentSubmissionId, focusSubmissionId }: {
  attempts: readonly { submissionId: string; attemptNumber: number }[];
  currentSubmissionId: string | null;
  focusSubmissionId?: string;
}) {
  return <>{attempts.map(attempt=>attempt.submissionId===currentSubmissionId
    ? <GuardianGradeResponse key={attempt.submissionId} submissionId={attempt.submissionId}/>
    : <PreviousGradeResponse key={attempt.submissionId} {...attempt} focusSubmissionId={focusSubmissionId}/>)}</>;
}

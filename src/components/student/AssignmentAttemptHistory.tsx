import { useState } from "react";
import { getSyntheticAssignmentHistory } from "@/modules/student-experience/assignments.functions";

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
    </details>)}
  </section>;
}

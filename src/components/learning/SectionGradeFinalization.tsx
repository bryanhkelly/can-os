import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { QueryState } from "@/components/workspace";
import {
  correctSectionGrade,
  finalizeSectionGrades,
  getSectionGradeFinalization,
} from "@/modules/learning/report-cards.functions";

type Model = Awaited<ReturnType<typeof getSectionGradeFinalization>>;
type FinalizedGrade = Model["grades"][number];
type Preview = Extract<Awaited<ReturnType<typeof finalizeSectionGrades>>, {preview:true}>;

/**
 * Gradebook panel that closes a grading period (finalizeSectionGrades) and
 * corrects finalized grades (correctSectionGrade). The server functions are
 * the only authorization gate: this panel renders controls and reports the
 * server's verdicts, it never decides eligibility itself.
 */
export function SectionGradeFinalization({ sectionId }: { sectionId: string }) {
  return <SectionGradeFinalizationForm key={sectionId} sectionId={sectionId} />;
}

function SectionGradeFinalizationForm({ sectionId }: { sectionId: string }) {
  const [preview,setPreview]=useState<Preview|null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [periodId, setPeriodId] = useState("");
  const [correctingId, setCorrectingId] = useState("");
  const [correctionPercentage, setCorrectionPercentage] = useState("");
  const [correctionLetter, setCorrectionLetter] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    setReadError("");
    try {
      const current = await getSectionGradeFinalization({ data: { sectionId } });
      if (request === requestSequence.current) {
        setModel(current);
        setPeriodId((selected) =>
          current.gradingPeriods.some((period) => period.id === selected)
            ? selected
            : current.gradingPeriods[0]?.id ?? "");
      }
    } catch (cause) {
      if (request === requestSequence.current) setReadError(
        cause instanceof Error ? cause.message : "Unable to load grading periods for this section.");
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, [sectionId]);
  useEffect(() => {
    void refresh();
    return () => { requestSequence.current++; };
  }, [refresh]);

  const finalize = async () => {
    if (busy || loading || !periodId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await finalizeSectionGrades({ data: { sectionId, gradingPeriodId: periodId } });
      if(result.finalized===undefined || result.skipped===undefined)
        throw new Error("Finalization did not return a grade receipt. Reload the period before continuing.");
      setPreview(null);
      setNotice(`Finalized ${result.finalized} grade${result.finalized === 1 ? "" : "s"}; ` +
        `${result.skipped} enrolled student${result.skipped === 1 ? "" : "s"} skipped ` +
        "(already finalized or unfinished scoreable work in the period window). Finalized grades now appear on student and guardian report cards and transcripts.");
      // A refresh error is shown separately; it must not imply finalization failed.
      await refresh();
      // Keep the remaining unfinished work visible after a partial closeout.
      // The server preview excludes grades already finalized in this period.
      if (result.skipped > 0) {
        try {
          const remaining = await finalizeSectionGrades({ data: { sectionId, gradingPeriodId: periodId, previewOnly: true } });
          if ("preview" in remaining && remaining.preview) setPreview(remaining);
        } catch {
          // The successful finalization receipt remains authoritative.
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to finalize grades for this grading period.");
    } finally { setBusy(false); }
  };

  const reviewBlockers = async () => {
    if(busy||loading||!periodId)return;
    setBusy(true);setError("");setNotice("");setPreview(null);
    try{
      const result=await finalizeSectionGrades({data:{sectionId,gradingPeriodId:periodId,previewOnly:true}});
      if("preview" in result && result.preview)setPreview(result);
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to review grading-period work.");}
    finally{setBusy(false);}
  };

  const correct = async (grade: FinalizedGrade) => {
    if (busy || loading) return;
    const percentage = correctionPercentage.trim();
    const letter = correctionLetter.trim();
    const reason = correctionReason.trim();
    if (reason.length < 5) {
      setError("Describe the reason for the correction in at least five characters; it is recorded with the grade and shared with the student and guardians.");
      return;
    }
    if (!percentage && !letter) {
      setError("Enter a corrected percentage and/or letter grade.");
      return;
    }
    if (percentage && (!Number.isFinite(Number(percentage)) || Number(percentage) < 0 || Number(percentage) > 100)) {
      setError("Enter a percentage between 0 and 100.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await correctSectionGrade({ data: {
        sectionGradeId: grade.id,
        ...(percentage ? { percentage: Number(percentage) } : {}),
        ...(letter ? { letterGrade: letter } : {}),
        reason,
      } });
      setNotice(result.corrected
        ? `Corrected the finalized grade for ${grade.studentName}. The correction is recorded in the grade history and the student and guardians are notified; already-issued transcripts keep their original snapshot.`
        : "The finalized grade already has these values. No new correction or notifications were created.");
      setCorrectingId("");
      setCorrectionPercentage("");
      setCorrectionLetter("");
      setCorrectionReason("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record the correction.");
    } finally { setBusy(false); }
  };

  const periods = model?.gradingPeriods ?? [];
  const grades = model?.grades ?? [];
  const periodGrades = grades.filter((grade) => grade.gradingPeriodId === periodId);
  const submittedBlockers = preview?.blockers.filter((item) => item.status === "submitted") ?? [];
  const firstSubmittedBlocker=submittedBlockers[0];
  const followUpBlockers = preview?.blockers.filter((item) => item.status !== "submitted") ?? [];
  const finalizedForPeriod = (id: string) => grades.filter((grade) => grade.gradingPeriodId === id).length;

  return <section aria-label="Grading period finalization" className="mt-8 rounded-xl border bg-card p-5">
    <h2 className="text-lg font-semibold">Close grading period / finalize grades</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Finalizing a grading period computes each enrolled student&apos;s percentage from their latest submission, when graded,
      for each published or closed assessment due inside the period window, converts it to a letter
      grade with the school&apos;s active grade scale, and publishes the result to report cards and transcripts.
      Students with any unfinished scoreable work are skipped. Finalized grades are immutable: re-running
      finalization never recomputes them, and later changes go through a recorded correction instead.
    </p>
    {error && <p role="alert" className="mt-4 rounded-lg border p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{notice}</p>}
    <QueryState loading={loading ? "Loading grading periods…" : undefined}
      error={readError || undefined} onRetry={() => void refresh()} retrying={busy || loading}>
      {model?.connected && model.section && <>
        {!model.gradeScaleConfigured && <p role="status" className="mt-4 rounded-lg border p-3 text-sm text-amber-800">
          The school year has no configured grade scale, so finalization cannot compute letter grades until the school configures one.
        </p>}
        {periods.length === 0 && <p className="mt-4 text-sm">No grading periods are configured for this section&apos;s term.</p>}
        {periods.length > 0 && <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-64 text-sm font-semibold">Grading period
            <select aria-label="Grading period to finalize" value={periodId} disabled={busy}
              onChange={(event) => {setPeriodId(event.target.value);setPreview(null);setCorrectingId("");setCorrectionPercentage("");setCorrectionLetter("");setCorrectionReason("");setError("");}}
              className="mt-2 block w-full rounded-lg border bg-background p-3 font-normal">
              {periods.map((period) => <option key={period.id} value={period.id}>
                {period.name} ({new Date(`${period.startsOn}T00:00:00`).toLocaleDateString()} – {new Date(`${period.endsOn}T00:00:00`).toLocaleDateString()})
                {" · "}{finalizedForPeriod(period.id)} of {model.enrolledStudents} finalized
              </option>)}
            </select>
          </label>
          <button type="button" disabled={busy||!periodId} onClick={()=>void reviewBlockers()}
            className="rounded-lg border px-4 py-3 text-sm font-semibold disabled:opacity-50">Review unfinished work</button>
          <button type="button" disabled={busy || !periodId} onClick={() => void finalize()}
            className="rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-50">
            {busy ? "Working…" : "Finalize grades"}
          </button>
        </div>}
        {preview&&<section aria-label="Grading period unfinished work" className="mt-4 rounded-lg border p-4 text-sm">
          <p>{preview.eligible} students ready to finalize. Review is a current snapshot; finalization rechecks the records.</p>
          <p className="mt-2 font-semibold">{submittedBlockers.length} submission{submittedBlockers.length===1?"":"s"} to grade · {followUpBlockers.length} assignment{followUpBlockers.length===1?"":"s"} needing student follow-up</p>
          {firstSubmittedBlocker&&<p className="mt-2"><Link to="/teacher/gradebook" search={{section:sectionId,student:firstSubmittedBlocker.studentProfileId,assessment:firstSubmittedBlocker.assessmentId}} className="underline font-semibold">Grade the first pending submission</Link></p>}
          {preview.blockers.length===0?<p className="mt-2">No unfinished scoreable assignments found for students awaiting finalization.</p>:
            <ul className="mt-3 space-y-2">{preview.blockers.map(item=><li key={item.studentProfileId+":"+item.assessmentId}>
              {item.status==="submitted"
                ?<Link to="/teacher/gradebook" search={{section:sectionId,student:item.studentProfileId,assessment:item.assessmentId}} className="underline">
                  {item.studentName} · {item.assessmentTitle}</Link>
                :<span className="font-semibold">{item.studentName} · {item.assessmentTitle}</span>}
              {" · "+(item.status==="submitted"?"Awaiting grading":item.status==="returned"?"Awaiting revision":item.status==="graded"?"Score needs review":"Not submitted")}
            </li>)}</ul>}
          {preview.blockers.some(item=>item.status!=="submitted")&&<p className="mt-3">For unsubmitted or returned work, follow up with the student before finalizing. <Link to="/teacher/missing-work" className="underline">Review overdue missing work and create follow-ups</Link></p>}
        </section>}
        <h3 className="mt-6 text-sm font-semibold">Finalized grades for this section</h3>
        {periodGrades.length === 0 && <p className="mt-2 text-sm text-muted-foreground">
          No finalized grades for the selected grading period. Review unfinished work above before publishing report-card grades.
        </p>}
        {periodGrades.length > 0 && <ul className="mt-3 space-y-3">
          {periodGrades.map((grade) => {
            const period = periods.find((item) => item.id === grade.gradingPeriodId);
            const correcting = correctingId === grade.id;
            return <li key={grade.id} className="rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  <span className="font-semibold">{grade.studentName}</span>
                  {" · "}{period?.name ?? "Grading period"}{" · "}
                  {grade.letterGrade ?? "—"}{grade.percentage !== null ? ` (${grade.percentage}%)` : ""}
                  {" · finalized "}{grade.finalizedAt ? new Date(grade.finalizedAt).toLocaleDateString() : "—"}
                  {grade.corrections > 0 && ` · ${grade.corrections} recorded correction${grade.corrections === 1 ? "" : "s"}`}
                </p>
                {!correcting && <button type="button" disabled={busy}
                  onClick={() => { setCorrectingId(grade.id); setError(""); setNotice(""); }}
                  className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Correct grade
                </button>}
              </div>
              {correcting && <div className="mt-3 grid gap-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  A correction supersedes the finalized grade in place and appends the previous values with your
                  reason to an append-only history. The student and academic guardians are notified. If only a
                  percentage is entered, the letter grade is derived from the grade scale recorded at
                  finalization. Transcripts already issued keep their original snapshot.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold">Corrected percentage (0–100, optional)
                    <input aria-label={`Corrected percentage for ${grade.studentName}`} type="number" min={0} max={100} step="0.01"
                      value={correctionPercentage} disabled={busy}
                      onChange={(event) => setCorrectionPercentage(event.target.value)}
                      className="mt-1 w-full rounded border bg-background p-2 font-normal" />
                  </label>
                  <label className="text-xs font-semibold">Corrected letter grade (optional)
                    <input aria-label={`Corrected letter grade for ${grade.studentName}`} maxLength={10}
                      value={correctionLetter} disabled={busy}
                      onChange={(event) => setCorrectionLetter(event.target.value)}
                      className="mt-1 w-full rounded border bg-background p-2 font-normal" />
                  </label>
                </div>
                <label className="text-xs font-semibold">Reason (recorded and shared with the student and guardians)
                  <textarea aria-label={`Correction reason for ${grade.studentName}`} rows={2} minLength={5} maxLength={500}
                    value={correctionReason} disabled={busy}
                    onChange={(event) => setCorrectionReason(event.target.value)}
                    className="mt-1 w-full rounded border bg-background p-2 font-normal" />
                </label>
                <div className="flex gap-3">
                  <button type="button" disabled={busy || correctionReason.trim().length < 5 ||
                      (!correctionPercentage.trim() && !correctionLetter.trim())}
                    onClick={() => void correct(grade)}
                    className="rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-50">
                    Record correction
                  </button>
                  <button type="button" disabled={busy}
                    onClick={() => { setCorrectingId(""); setCorrectionPercentage(""); setCorrectionLetter(""); setCorrectionReason(""); }}
                    className="rounded-lg border px-4 py-2 text-xs disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </div>}
            </li>;
          })}
        </ul>}
      </>}
    </QueryState>
  </section>;
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
 createAssessment,
 manageAssessment,
 returnSubmissionForRevision,
 getGradebook,
 getGradebookSections,
 gradeSubmission,
} from "@/modules/learning/gradebook.functions";
import { scoreRubric, type CriterionGrade } from "@/modules/student-experience/rubric";

export const Route = createFileRoute("/teacher/gradebook")({ component: TeacherGradebookPage });

type Section = Awaited<ReturnType<typeof getGradebookSections>>["sections"][number];
type Gradebook = Awaited<ReturnType<typeof getGradebook>>;
type Cell = Gradebook["cells"][number];
type Assessment = Gradebook["assessments"][number];

function TeacherGradebookPage() {
 const [sections, setSections] = useState<Section[]>([]);
 const [selected, setSelected] = useState("");
 const [gradebook, setGradebook] = useState<Gradebook | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const [notice, setNotice] = useState("");
 const [busy, setBusy] = useState(false);
 const [gradingKey, setGradingKey] = useState("");
 const [detailKey, setDetailKey] = useState("");
 const [score, setScore] = useState("");
 const [comment, setComment] = useState("");
 const [rubricInputs, setRubricInputs] = useState<Record<string, string>>({});
 const gridRef = useRef<HTMLDivElement | null>(null);
 const [title, setTitle] = useState("");
 const [points, setPoints] = useState("");
 const [due, setDue] = useState("");
 const [assessmentDueDates,setAssessmentDueDates]=useState<Record<string,string>>({});

 useEffect(() => {
  let active = true;
  getGradebookSections().then(result => {
   if (!active) return;
   setSections(result.sections);
   setSelected(result.sections[0]?.id ?? "");
   if (!result.sections.length) setLoading(false);
  }).catch(() => {
   if (active) { setError("Sign in with an authorized teacher account to view the gradebook."); setLoading(false); }
  });
  return () => { active = false; };
 }, []);

 const loadGradebook = (sectionId: string) => {
  setLoading(true);
  setError("");
  setGradingKey("");
  return getGradebook({ data: { sectionId } }).then(result => {
   setGradebook(result);
   setLoading(false);
  }).catch(() => {
   setGradebook(null);
   setError("Unable to load the gradebook for this section.");
   setLoading(false);
  });
 };

 useEffect(() => {
  if (!selected) { setGradebook(null); return; }
  let active = true;
  setLoading(true);
  setError("");
  setGradingKey("");
  getGradebook({ data: { sectionId: selected } }).then(result => {
   if (active) { setGradebook(result); setLoading(false); }
  }).catch(() => {
   if (active) { setGradebook(null); setError("Unable to load the gradebook for this section."); setLoading(false); }
  });
  return () => { active = false; };
 }, [selected]);

 const cellFor = (studentProfileId: string, assessmentId: string): Cell | undefined =>
  gradebook?.cells.find(cell => cell.studentProfileId === studentProfileId && cell.assessmentId === assessmentId);

 const submitGrade = async (cell: Cell, assessment: Assessment) => {
  const payload: { submissionId: string; score?: number; feedbackComment: string; rubricScores?: CriterionGrade[] } = {
   submissionId: cell.submissionId,
   feedbackComment: comment,
  };
  if (assessment.rubric.length) {
   const grades = assessment.rubric.map(criterion => ({ id: criterion.id, points: Number(rubricInputs[criterion.id]) }));
   try {
   scoreRubric(assessment.rubric, grades);
   } catch (cause) {
   setNotice(cause instanceof Error ? cause.message : "Enter a valid score for every criterion.");
   return;
   }
   payload.rubricScores = grades;
  } else {
   const value = Number(score);
   if (!Number.isFinite(value)) { setNotice("Enter a numeric score."); return; }
   payload.score = value;
  }
  setBusy(true);
  setNotice("");
  try {
   await gradeSubmission({ data: payload });
   setNotice("Grade posted.");
   setGradingKey("");
   setScore("");
   setComment("");
   setRubricInputs({});
   if (selected) await loadGradebook(selected);
  } catch (cause) {
   setNotice(cause instanceof Error ? cause.message : "Unable to post the grade.");
  } finally {
   setBusy(false);
  }
 };

 /** Live rubric total for the grading panel; null until every criterion is valid. */
 const liveRubricTotal = (assessment: Assessment): number | null => {
  if (!assessment.rubric.length) return null;
  try {
   const grades = assessment.rubric.map(criterion => ({ id: criterion.id, points: Number(rubricInputs[criterion.id]) }));
   return scoreRubric(assessment.rubric, grades).earned;
  } catch {
   return null;
  }
 };

 /** Arrow-key movement across the grade grid. */
 const onCellKeyDown = (event: React.KeyboardEvent, row: number, col: number) => {
  const delta: Record<string, [number, number]> = {
   ArrowUp: [-1, 0],
   ArrowDown: [1, 0],
   ArrowLeft: [0, -1],
   ArrowRight: [0, 1],
  };
  const move = delta[event.key];
  if (!move) return;
  event.preventDefault();
  gridRef.current
   ?.querySelector<HTMLElement>(`[data-cell="${row + move[0]}:${col + move[1]}"]`)
   ?.focus();
 };

 const submitAssessment = async () => {
  const pointsValue = Number(points);
  if (!title.trim() || !Number.isFinite(pointsValue)) { setNotice("Enter a title and a numeric point value."); return; }
  setBusy(true);
  setNotice("");
  try {
   const result = await createAssessment({ data: {
    sectionId: selected,
    title,
    pointsPossible: pointsValue,
    ...(due ? { dueAt: new Date(`${due}T23:59:00`).toISOString() } : {}),
   } });
   setNotice(result.status === "published" ? "Assessment published and assigned to enrolled students." : "Assessment saved as a draft.");
   setTitle("");
   setPoints("");
   setDue("");
   if (selected) await loadGradebook(selected);
  } catch (cause) {
   setNotice(cause instanceof Error ? cause.message : "Unable to create the assessment.");
  } finally {
   setBusy(false);
  }
 };

 async function changeAssessment(id:string,action:"publish"|"close"|"reopen"|"reschedule"){
  const date=assessmentDueDates[id];
  if((action==="publish"||action==="reschedule")&&!date){
   setNotice("Select a future due date first.");return;
  }
  setBusy(true);setNotice("");
  try{
   const result=await manageAssessment({data:{
    assessmentId:id,action,
    ...(date?{dueAt:new Date(date+"T23:59:00").toISOString()}:{})
   }});
   setNotice("Assessment "+result.status+".");
   if(selected)await loadGradebook(selected);
  }catch(cause){setNotice(cause instanceof Error?cause.message:"Unable to update assessment");}
  finally{setBusy(false);}
 }
 async function returnForRevision(submissionId:string){
  setBusy(true);setNotice("");
  try{
   await returnSubmissionForRevision({data:{submissionId}});
   setNotice("Assignment returned to student for revision.");
   setDetailKey("");
   if(selected)await loadGradebook(selected);
  }catch(cause){setNotice(cause instanceof Error?cause.message:"Unable to return assignment");}
  finally{setBusy(false);}
 }

 const cellLabel = (cell: Cell | undefined, assessment: Assessment) => {
  if (!cell) return { text: "—", tone: "text-muted-foreground" };
  if (cell.status === "graded" || cell.status === "returned") {
   return { text: `${cell.score ?? "—"} / ${assessment.pointsPossible ?? "—"}`, tone: "font-semibold" };
  }
  if (cell.status === "submitted") {
   return { text: cell.timeliness === "late" ? "Submitted · late" : "Submitted", tone: "font-semibold" };
  }
  if (cell.timeliness === "missing") return { text: "Missing", tone: "text-muted-foreground" };
  if (cell.timeliness === "excused") return { text: "Excused", tone: "text-muted-foreground" };
  return { text: "Assigned", tone: "text-muted-foreground" };
 };

 return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
  <div className="mx-auto max-w-6xl">
   <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Teacher</p>
   <h1 className="mt-2 font-serif text-4xl">Gradebook</h1>
   <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Review submissions and post grades for the sections you teach.</p>
   {sections.length > 0 && <label className="mt-8 block max-w-sm text-sm font-semibold">
    Section
    <select className="mt-2 w-full rounded-lg border bg-background p-3" value={selected} onChange={event => setSelected(event.target.value)}>
     {sections.map(section => <option key={section.id} value={section.id}>{section.title} ({section.code})</option>)}
    </select>
   </label>}
   {loading && <p className="mt-8 text-sm" role="status">Loading gradebook…</p>}
   {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
   {notice && <p className="mt-8 rounded-lg border p-4 text-sm" role="status">{notice}</p>}
   {!loading && !error && sections.length === 0 && <p className="mt-8 text-sm">No sections are assigned to your account.</p>}

   {!loading && !error && gradebook?.connected && gradebook.section && <>
    <section className="mt-8 rounded-xl border bg-card p-5" aria-label="New assessment">
     <h2 className="text-lg font-semibold">New assessment</h2>
     <div className="mt-4 grid gap-4 sm:grid-cols-3">
      <label className="text-sm font-semibold">Title
       <input className="mt-2 w-full rounded-lg border bg-background p-3" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="e.g. Chapter 4 quiz" />
      </label>
      <label className="text-sm font-semibold">Points possible
       <input className="mt-2 w-full rounded-lg border bg-background p-3" type="number" min={1} max={1000} value={points} onChange={event => setPoints(event.target.value)} />
      </label>
      <label className="text-sm font-semibold">Due date
       <input className="mt-2 w-full rounded-lg border bg-background p-3" type="date" value={due} onChange={event => setDue(event.target.value)} />
      </label>
     </div>
     <p className="mt-3 text-xs text-muted-foreground">Assessments with a due date are published and assigned to enrolled students; without one they are saved as drafts.</p>
     <button disabled={busy} onClick={submitAssessment} className="mt-4 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Create assessment</button>
    </section>

    {gradebook.assessments.length === 0 && <p className="mt-8 text-sm">No published assessments yet. Create one above to start grading.</p>}
    {gradebook.assessments.length > 0 && <div ref={gridRef} className="mt-8 overflow-x-auto rounded-xl border bg-card">
     <table className="w-full border-collapse text-sm">
      <thead>
       <tr className="border-b text-left">
        <th className="p-3 font-semibold">Student</th>
        {gradebook.assessments.map(assessment => <th key={assessment.id} className="min-w-32 p-3 font-semibold">
         <span className="block">{assessment.title}</span>
         <span className="block text-xs font-normal text-muted-foreground">
          {assessment.dueAt ? `Due ${new Date(assessment.dueAt).toLocaleDateString()}` : "No due date"} · {assessment.pointsPossible ?? "—"} pts
          {assessment.rubric.length > 0 && ` · ${assessment.rubric.length} criteria`}
         </span>
        </th>)}
       </tr>
      </thead>
      <tbody>
       {gradebook.students.map((student, rowIndex) => <tr key={student.studentProfileId} className="border-b last:border-0">
        <th className="p-3 text-left font-semibold">{student.displayName}</th>
        {gradebook.assessments.map((assessment, colIndex) => {
         const cell = cellFor(student.studentProfileId, assessment.id);
         const key = `${student.studentProfileId}:${assessment.id}`;
         const label = cellLabel(cell, assessment);
         const gradeable = cell?.status === "submitted";
         const reviewable = !!cell && (cell.status === "graded" || cell.status === "returned");
         const open = gradingKey === key && gradeable;
         const detail = detailKey === key && reviewable && !open;
         return <td key={assessment.id} className="p-3 align-top">
          {open && cell ? <div className="grid w-56 gap-2" onKeyDown={event => { if (event.key === "Escape") { setGradingKey(""); } }}>
           {assessment.rubric.length > 0 ? <>
            {assessment.rubric.map((criterion, criterionIndex) => <label key={criterion.id} className="block text-xs font-semibold">
             {criterion.label} <span className="font-normal text-muted-foreground">(0–{criterion.maxPoints})</span>
             {criterion.description && <span className="block font-normal text-muted-foreground">{criterion.description}</span>}
             <input
              autoFocus={criterionIndex === 0}
              className="mt-1 w-24 rounded-lg border bg-background p-2"
              type="number" min={0} max={criterion.maxPoints}
              value={rubricInputs[criterion.id] ?? ""}
              onChange={event => setRubricInputs(current => ({ ...current, [criterion.id]: event.target.value }))}
             />
            </label>)}
            <p className="text-xs font-semibold" role="status">
             Total: {liveRubricTotal(assessment) ?? "—"} / {assessment.pointsPossible ?? "—"}
            </p>
           </> : <label className="text-xs font-semibold">Score (0–{assessment.pointsPossible ?? "—"})
            <input autoFocus className="mt-1 w-24 rounded-lg border bg-background p-2" type="number" min={0} max={Number(assessment.pointsPossible ?? 0)} value={score} onChange={event => setScore(event.target.value)} />
           </label>}
           <label className="text-xs font-semibold">Feedback comment
            <textarea className="mt-1 w-48 rounded-lg border bg-background p-2" rows={2} maxLength={4000} value={comment} onChange={event => setComment(event.target.value)} />
           </label>
           <div className="flex gap-2">
            <button disabled={busy} onClick={() => submitGrade(cell, assessment)} className="rounded-lg border px-3 py-1 text-xs font-semibold disabled:opacity-50">Post grade</button>
            <button disabled={busy} onClick={() => { setGradingKey(""); setScore(""); setComment(""); setRubricInputs({}); }} className="rounded-lg border px-3 py-1 text-xs disabled:opacity-50">Cancel</button>
           </div>
          </div> : detail && cell ? <div className="grid w-56 gap-1.5 text-xs" onKeyDown={event => { if (event.key === "Escape") setDetailKey(""); }}>
           <p className="font-semibold">{cell.score ?? "—"} / {assessment.pointsPossible ?? "—"}{cell.gradedAt ? ` · graded ${new Date(cell.gradedAt).toLocaleDateString()}` : ""}</p>
           {cell.feedbackRubric.length > 0 && assessment.rubric.length > 0 && <ul className="grid gap-0.5">
            {assessment.rubric.map(criterion => {
             const awarded = cell.feedbackRubric.find(entry => entry.id === criterion.id);
             return <li key={criterion.id} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{criterion.label}</span>
              <span className="font-semibold">{awarded?.points ?? "—"} / {criterion.maxPoints}</span>
             </li>;
            })}
           </ul>}
           {cell.feedbackComment && <p className="text-muted-foreground">“{cell.feedbackComment}”</p>}
           <button onClick={() => setDetailKey("")} className="mt-1 w-fit rounded-lg border px-3 py-1 text-xs">Close</button>
          </div> : cell ? <button
           data-cell={`${rowIndex}:${colIndex}`}
           onKeyDown={event => onCellKeyDown(event, rowIndex, colIndex)}
           aria-label={`${student.displayName}, ${assessment.title}: ${label.text}${gradeable ? ". Open grading" : reviewable ? ". View grade" : ""}`}
           className={`rounded-lg border px-3 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${label.tone}`}
           onClick={() => {
            setNotice("");
            if (gradeable) { setGradingKey(key); setDetailKey(""); setScore(""); setComment(""); setRubricInputs({}); }
            else if (reviewable) { setDetailKey(current => current === key ? "" : key); setGradingKey(""); }
           }}
          >{label.text}{gradeable ? " · Grade" : reviewable ? " · View" : ""}</button>
           : <span data-cell={`${rowIndex}:${colIndex}`} tabIndex={-1} className={`inline-block rounded-lg px-3 py-1 text-xs ${label.tone}`}>{label.text}</span>}
         </td>;
        })}
       </tr>)}
       {gradebook.students.length === 0 && <tr><td className="p-5 text-sm text-muted-foreground" colSpan={gradebook.assessments.length + 1}>No active students are enrolled in this section.</td></tr>}
      </tbody>
     </table>
    </div>}
    {gradebook.assessments.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Tip: use arrow keys to move across the grid, Enter to open a cell, Escape to close a panel.</p>}
   </>}
  </div>
 </main>;
}

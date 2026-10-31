import { GradebookScoringEditor } from "@/components/learning/GradebookScoringEditor";
import { GradebookAssessmentComposer } from "@/components/learning/GradebookAssessmentComposer";
import { GradebookReviewedFeedback } from "@/components/learning/GradebookReviewedFeedback";
import { GradebookAssessmentHeader } from "@/components/learning/GradebookAssessmentHeader";
import { nextGradebookCell } from "@/components/learning/gradebook-grid-navigation";
import { GradebookOverview } from "@/components/learning/GradebookOverview";
import { GradebookReviewQueue } from "@/components/learning/GradebookReviewQueue";
import { MAX_ASSESSMENT_ATTEMPTS } from "@/domain/assessment-attempt-policy";
import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
 createAssessment,
 manageAssessment,
 returnSubmissionForRevision,
 getGradebook,
 getGradebookSections,
 gradeSubmission,
} from "@/modules/learning/gradebook.functions";
import { scoreRubric, type CriterionGrade } from "@/modules/learning/rubric";
import { validateAssessmentRubric } from "@/domain/teacher-assessment-rubric";
import { WorkspaceShell, WorkspacePanel } from "@/components/workspace";
import { SubmissionEvidence } from "@/components/student/SubmissionEvidence";
import { AssignmentConversation } from "@/components/learning/AssignmentConversation";
import { liveRubricTotal } from "@/components/learning/live-rubric-total";
import { prioritizeSubmittedReviews, adjacentReviews } from "@/components/learning/gradebook-review-queue";
import { GradebookSectionSelector } from "@/components/learning/GradebookSectionSelector";
import { SectionGradeFinalization } from "@/components/learning/SectionGradeFinalization";

export const Route = createFileRoute("/teacher/gradebook")({
 validateSearch:(search:Record<string,unknown>):{section?:string;assessment?:string;student?:string;lesson?:string;kind?:string}=>({
  section:typeof search.section==="string"?search.section:undefined,
  assessment:typeof search.assessment==="string"?search.assessment:undefined,
  student:typeof search.student==="string"?search.student:undefined,
  lesson:typeof search.lesson==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(search.lesson)?search.lesson:undefined,
  kind:typeof search.kind==="string"&&["homework","classwork","quiz","test","project","discussion"].includes(search.kind)?search.kind:undefined,
 }),
 component:()=> <TeacherGradebookPage key={JSON.stringify(Route.useSearch())}/>,
});

type Section = Awaited<ReturnType<typeof getGradebookSections>>["sections"][number];
type Gradebook = Awaited<ReturnType<typeof getGradebook>>;
type Cell = Gradebook["cells"][number];
type Assessment = Gradebook["assessments"][number];

function TeacherGradebookPage() {
 const search=Route.useSearch();
 const navigate=Route.useNavigate();
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
 const [instructions, setInstructions] = useState("");
 const [newRubric, setNewRubric] = useState<Array<{id:string;label:string;maxPoints:string;description:string}>>([]);
 const rubricSequence=useRef(0);
 const [points, setPoints] = useState("");
 const [maxAttempts, setMaxAttempts] = useState("");
 const [due, setDue] = useState("");
 const [releaseAt,setReleaseAt]=useState("");
 const [closeAt,setCloseAt]=useState("");
 const [publishConfirmed,setPublishConfirmed]=useState(false);
 const [assignmentKind,setAssignmentKind]=useState<"homework"|"classwork"|"quiz"|"test"|"project"|"discussion">(
  (search.kind as "homework"|"classwork"|"quiz"|"test"|"project"|"discussion"|undefined)??"classwork");
 const [curriculumLessonId,setCurriculumLessonId]=useState(search.lesson??"");
 const [assessmentDueDates,setAssessmentDueDates]=useState<Record<string,string>>({});
 const reviewKey=gradingKey||detailKey;
 const reviewCell=gradebook?.cells.find(cell=>`${cell.studentProfileId}:${cell.assessmentId}`===reviewKey);
 const reviewAssessment=gradebook?.assessments.find(item=>item.id===reviewCell?.assessmentId);
 const reviewStudent=gradebook?.students.find(item=>item.studentProfileId===reviewCell?.studentProfileId);
 // Prioritize work awaiting a grade; reviewed history remains in the grid.
 const reviewQueue=prioritizeSubmittedReviews(gradebook?.cells??[]);
 const pendingReviewCount=reviewQueue.length;
 const reviewIndex=reviewQueue.findIndex(cell=>cell.submissionId===reviewCell?.submissionId);
 const {previous:previousReview,next:nextReview}=adjacentReviews(reviewQueue,reviewCell?.submissionId);

 useEffect(()=>{
  const draft=reviewCell?.gradingDraft;
  setScore(draft?.score??"");
  setComment(draft?.comment??"");
  setRubricInputs(Object.fromEntries((draft?.rubricScores??[]).map(item=>[item.id,String(item.points)])));
 },[reviewCell?.submissionId]);

 useEffect(() => {
  let active = true;
  getGradebookSections().then(result => {
   if (!active) return;
   setSections(result.sections);
   if(search.section&&!result.sections.some(section=>section.id===search.section)){
    setError("This section is unavailable in your current teacher workspace.");
    setLoading(false);
    return;
   }
   setSelected(search.section??result.sections[0]?.id??"");
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
  setDetailKey("");
  getGradebook({ data: { sectionId: selected } }).then(result => {
   if (active) {
    setGradebook(result); setLoading(false);
    if(search.assessment&&!result.assessments.some(item=>item.id===search.assessment)){
     setError("This assessment is unavailable in the selected section.");return;
    }
    if(search.student&&!result.students.some(item=>item.studentProfileId===search.student)){
     setError("This student is unavailable in the selected section.");return;
    }
    const target=result.cells.find(cell=>cell.assessmentId===search.assessment&&cell.studentProfileId===search.student);
    if(target){
     const key=`${target.studentProfileId}:${target.assessmentId}`;
     if(target.status==="submitted")setGradingKey(key);
     else if(target.status==="graded"||target.status==="returned")setDetailKey(key);
    }
   }
  }).catch(() => {
   if (active) { setGradebook(null); setError("Unable to load the gradebook for this section."); setLoading(false); }
  });
  return () => { active = false; };
 }, [selected, search.assessment, search.student]);

 const cellFor = (studentProfileId: string, assessmentId: string): Cell | undefined =>
  gradebook?.cells.find(cell => cell.studentProfileId === studentProfileId && cell.assessmentId === assessmentId);

 const submitGrade = async (cell: Cell, assessment: Assessment, draftOnly=false) => {
  const payload: { submissionId: string; score?: number; feedbackComment: string; rubricScores?: CriterionGrade[]; draftOnly?:boolean } = {
   submissionId: cell.submissionId,
   feedbackComment: comment,
  };
  if(draftOnly)payload.draftOnly=true;
  if (assessment.rubric.length) {
   if(assessment.rubric.some(criterion=>!rubricInputs[criterion.id]?.trim())){
    setNotice("Enter a score for every rubric criterion.");return;
   }
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
   if (!score.trim() || !Number.isFinite(value)) { setNotice("Enter a numeric score."); return; }
   payload.score = value;
  }
  setBusy(true);
  setNotice("");
  try {
   await gradeSubmission({ data: payload });
   if(draftOnly){
    setNotice("Grading draft saved. The score and feedback have not been released to the student or family.");
    // Reflect the persisted draft in the queue without closing the review.
    if(selected){
     try{
      const refreshed=await getGradebook({data:{sectionId:selected}});
      setGradebook(refreshed);
     }catch{
      setNotice("Grading draft saved, but the gradebook could not refresh. Reopen this submission to see the saved draft.");
     }
    }
    return;
   }
   setNotice("Grade posted.");
   setGradingKey("");
   setDetailKey("");
   setScore("");
   setComment("");
   setRubricInputs({});
   // Refresh the canonical queue before advancing. A classmate may have
   // submitted new work while the teacher was grading this attempt.
   if (selected) {
    try {
     const refreshed=await getGradebook({data:{sectionId:selected}});
     setGradebook(refreshed);
     const pending=refreshed.cells.filter(item=>item.status==="submitted"&&item.submissionId!==cell.submissionId);
     const next=pending.find(item=>item.gradingDraft)??pending[0];
     void navigate({search:next
      ?{section:selected,assessment:next.assessmentId,student:next.studentProfileId}
      :{section:selected}});
    } catch {
     // Posting succeeded; do not imply the grade failed just because the
     // follow-up refresh was unavailable.
     setNotice("Grade posted. Refresh the gradebook to continue reviewing.");
     void navigate({search:{section:selected}});
    }
   }
  } catch (cause) {
   setNotice(cause instanceof Error ? cause.message : draftOnly?"Unable to save grading draft.":"Unable to post the grade.");
  } finally {
   setBusy(false);
  }
 };

 const liveRubricScore = (assessment: Assessment) => liveRubricTotal(assessment.rubric, rubricInputs);

 /** Arrow-key movement across the currently visible, authorized grade grid. */
 const onCellKeyDown = (event: React.KeyboardEvent, row: number, col: number) => {
  const next = nextGradebookCell(
   event.key, row, col,
   gradebook?.students.filter(item=>!search.student||item.studentProfileId===search.student).length??0,
   gradebook?.assessments.filter(item=>!search.assessment||item.id===search.assessment).length??0,
  );
  if (!next) return;
  event.preventDefault();
  gridRef.current
   ?.querySelector<HTMLElement>(`[data-cell="${next.row}:${next.column}"]`)
   ?.focus();
 };

 const submitAssessment = async (publishNow:boolean) => {
  if(publishNow&&(!due||!publishConfirmed)){
   setNotice("Select a due date and confirm before publishing to students.");return;
  }
  const pointsValue = Number(points);
  if (!title.trim() || !Number.isFinite(pointsValue) || pointsValue < 1 || pointsValue > 1000) {
   setNotice("Enter a title and a point value between 1 and 1000."); return;
  }
  const attemptLimit=maxAttempts.trim()?Number(maxAttempts):undefined;
  if(attemptLimit!==undefined&&(!Number.isInteger(attemptLimit)||attemptLimit<1||attemptLimit>MAX_ASSESSMENT_ATTEMPTS)){
   setNotice("Maximum attempts must be a whole number from 1 to "+MAX_ASSESSMENT_ATTEMPTS+".");return;
  }
  const rubricCriteria = newRubric.map(row=>({
   id:row.id,label:row.label.trim(),maxPoints:row.maxPoints.trim()?Number(row.maxPoints):NaN,
   ...(row.description.trim()?{description:row.description.trim()}:{}),
  }));
  try { validateAssessmentRubric(rubricCriteria,pointsValue); }
  catch(cause){setNotice(cause instanceof Error?cause.message:"Invalid scoring rubric.");return;}
  setBusy(true);
  setNotice("");
  try {
   const result = await createAssessment({ data: {
    sectionId: selected,
    title,
    instructions,
    pointsPossible: pointsValue,
    ...(attemptLimit!==undefined?{maxAttempts:attemptLimit}:{}),
    rubricCriteria,
    assignmentKind,
    publishNow,
    ...(curriculumLessonId?{curriculumLessonId}:{}),
    ...(due ? { dueAt: new Date(`${due}T23:59:00`).toISOString() } : {}),
    ...(releaseAt?{availableAt:new Date(releaseAt).toISOString()}:{}),
    ...(closeAt?{closesAt:new Date(closeAt).toISOString()}:{}),
   } });
   setNotice(result.status === "published" ? "Assessment published and assigned to enrolled students." : "Assessment saved as a draft.");
   setTitle("");
   setInstructions("");
   setNewRubric([]);
   setPoints("");
   setMaxAttempts("");
   setDue("");
   setReleaseAt("");setCloseAt("");
   setPublishConfirmed(false);
   setCurriculumLessonId("");
   if (selected) await loadGradebook(selected);
  } catch (cause) {
   setNotice(cause instanceof Error ? cause.message : "Unable to create the assessment.");
  } finally {
   setBusy(false);
  }
 };

 async function changeAssessment(id:string,action:"publish"|"close"|"reopen"|"reschedule"){
  const date=assessmentDueDates[id];
  const savedDueAt=gradebook?.assessments.find(item=>item.id===id)?.dueAt;
  if((action==="reschedule"&&!date)||(action==="publish"&&!date&&
    (!savedDueAt||new Date(savedDueAt)<=new Date()))){
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
  if (cell.status === "returned") {
   return { text: "Returned · awaiting revision", tone: "font-semibold" };
  }
  if (cell.status === "graded") {
   return { text: `${cell.score ?? "—"} / ${assessment.pointsPossible ?? "—"}`, tone: "font-semibold" };
  }
  if (cell.status === "submitted") {
   return { text: cell.timeliness === "late" ? "Submitted · late" : "Submitted", tone: "font-semibold" };
  }
  if (cell.timeliness === "missing") return { text: "Missing", tone: "text-muted-foreground" };
  if (cell.timeliness === "excused") return { text: "Excused", tone: "text-muted-foreground" };
  return { text: "Assigned", tone: "text-muted-foreground" };
 };

 return <WorkspaceShell width="wide" eyebrow="CAN OS · Teacher" title="Gradebook"
  subtitle="Review submitted work, apply the rubric and return meaningful feedback."
  breadcrumbs={<><Link to="/teacher" search={{gradeAction:undefined}} className="underline">Teacher Today</Link><span>/</span><span>Gradebook</span></>}>
   <WorkflowIntro eyebrow="Teaching · Assessment" title="Feedback that moves learning forward." description="Review submitted evidence, assess with the published rubric, and give each learner a clear next step. Grade changes stay in the authorized gradebook workflow." />
   {(search.assessment||search.student)&&<Link to="/teacher/gradebook" search={{section:selected||search.section}} className="mt-4 inline-block text-sm underline">View full section gradebook</Link>}
   {sections.length > 0 && <div className="mt-8 max-w-sm">
    <GradebookSectionSelector sections={sections} selectedId={selected} onSelect={section => void navigate({search:{section}})} />
   </div>}
   {loading && <p className="mt-8 text-sm" role="status">Loading gradebook…</p>}
   {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
   {notice && <p className="mt-8 rounded-lg border p-4 text-sm" role="status">{notice}</p>}
   {!loading && !error && sections.length === 0 && <p className="mt-8 rounded-lg border p-4 text-sm" role="status">No currently authorized teaching sections. A delegation, assignment, qualification or school agreement may be missing, revoked or expired. Historical grades and issued transcripts are unchanged; contact your school administrator if you believe access should continue.</p>}

   {!loading && !error && gradebook?.connected && gradebook.section && <>
    <GradebookOverview studentCount={gradebook.students.length} assessmentCount={gradebook.assessments.length} submittedCount={gradebook.cells.filter(cell=>cell.status==="submitted").length} showQueueEmpty={!reviewCell&&reviewQueue.length===0} />
    {!reviewCell&&reviewQueue.length>0&&<WorkspacePanel title={`Submission queue · ${pendingReviewCount} awaiting grading`} description="Choose a student submission to review and grade.">
     <GradebookReviewQueue cells={reviewQueue} students={gradebook.students} assessments={gradebook.assessments} sectionId={selected} />
    </WorkspacePanel>}
    {reviewCell&&reviewAssessment&&reviewStudent&&<div className="mt-6 grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
     <WorkspacePanel title="Submission queue" description="Select submitted or reviewed work.">
      <GradebookReviewQueue cells={reviewQueue} students={gradebook.students} assessments={gradebook.assessments} sectionId={selected} activeSubmissionId={reviewCell.submissionId} />
     </WorkspacePanel>
     <WorkspacePanel title={`${reviewStudent.displayName} · ${reviewAssessment.title}`} actions={<div className="flex gap-3 text-sm">
      {previousReview&&<Link to="/teacher/gradebook" search={{section:selected,assessment:previousReview.assessmentId,student:previousReview.studentProfileId}} className="underline">Previous</Link>}
      {reviewIndex>=0&&nextReview&&<Link to="/teacher/gradebook" search={{section:selected,assessment:nextReview.assessmentId,student:nextReview.studentProfileId}} className="underline">Next</Link>}
     </div>}>
      <SubmissionEvidence key={reviewCell.submissionId} submissionId={reviewCell.submissionId}/>
      <AssignmentConversation key={`conversation-${reviewCell.submissionId}`} assessmentId={reviewAssessment.id} studentPersonId={reviewStudent.personId}/>
      {reviewCell.status==="submitted"?<GradebookScoringEditor
        assessment={reviewAssessment} score={score} comment={comment} rubricInputs={rubricInputs}
        busy={busy} sectionId={selected} liveTotal={liveRubricScore(reviewAssessment)}
        onScoreChange={setScore} onCommentChange={setComment}
        onRubricChange={(id,value)=>setRubricInputs(current=>({...current,[id]:value}))}
        onSaveDraft={()=>void submitGrade(reviewCell,reviewAssessment,true)}
        onPostGrade={()=>void submitGrade(reviewCell,reviewAssessment)} />
      :<GradebookReviewedFeedback cell={reviewCell} assessment={reviewAssessment} busy={busy}
       onReturnForRevision={()=>void returnForRevision(reviewCell.submissionId)} />}
     </WorkspacePanel>
    </div>}
    <GradebookAssessmentComposer title={title} points={points} due={due}
      releaseAt={releaseAt} closeAt={closeAt} assignmentKind={assignmentKind}
      curriculumLessonId={curriculumLessonId} maxAttempts={maxAttempts} instructions={instructions}
      newRubric={newRubric} publishConfirmed={publishConfirmed} busy={busy}
      lessonContext={search.lesson} lessons={gradebook.curriculumLessons}
      onTitleChange={setTitle} onPointsChange={setPoints} onDueChange={setDue}
      onReleaseChange={setReleaseAt} onCloseChange={setCloseAt}
      onKindChange={setAssignmentKind} onLessonChange={setCurriculumLessonId}
      onAttemptsChange={setMaxAttempts} onInstructionsChange={setInstructions}
      onRubricChange={setNewRubric} onPublishConfirmedChange={setPublishConfirmed}
      onSubmit={publish=>void submitAssessment(publish)} />

    {gradebook.assessments.length === 0 && <p className="mt-8 text-sm">No assessments yet. Create one above to begin.</p>}
    {gradebook.assessments.length > 0 && <div ref={gridRef} className="mt-8 overflow-x-auto rounded-xl border bg-card">
     <table className="w-full border-collapse text-sm">
      <thead>
       <tr className="border-b text-left">
        <th className="p-3 font-semibold">Student</th>
        {gradebook.assessments.filter(item=>!search.assessment||item.id===search.assessment).map(assessment =>
         <GradebookAssessmentHeader key={assessment.id} assessment={assessment} busy={busy}
          dueDate={assessmentDueDates[assessment.id]??""}
          onDueDateChange={value=>setAssessmentDueDates(current=>({...current,[assessment.id]:value}))}
          onAction={action=>void changeAssessment(assessment.id,action)}
          onDraftSaved={async()=>{setNotice("Assignment draft saved. Publish when ready to assign it to students.");await loadGradebook(selected);}}
          onScheduleSaved={()=>loadGradebook(selected)}/>)}
       </tr>
      </thead>
      <tbody>
       {gradebook.students.filter(item=>!search.student||item.studentProfileId===search.student).map((student, rowIndex) => <tr key={student.studentProfileId} className="border-b last:border-0">
        <th className="p-3 text-left font-semibold">{student.displayName}</th>
        {gradebook.assessments.filter(item=>!search.assessment||item.id===search.assessment).map((assessment, colIndex) => {
         const cell = cellFor(student.studentProfileId, assessment.id);
         const key = `${student.studentProfileId}:${assessment.id}`;
         const label = cellLabel(cell, assessment);
         const gradeable = cell?.status === "submitted";
         const reviewable = !!cell && (cell.status === "graded" || cell.status === "returned");
         return <td key={assessment.id} className="p-3 align-top">
          {cell && (gradeable||reviewable) ? <button
           data-cell={`${rowIndex}:${colIndex}`}
           onKeyDown={event => onCellKeyDown(event, rowIndex, colIndex)}
           aria-label={`${student.displayName}, ${assessment.title}: ${label.text}${gradeable ? ". Open grading" : reviewable ? ". View grade" : ""}`}
           className={`rounded-lg border px-3 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${label.tone}`}
           onClick={() => {
            void navigate({search:{section:selected,assessment:assessment.id,student:student.studentProfileId}});
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
    {gradebook.assessments.length > 0 &&     <p className="mt-2 text-xs text-muted-foreground">Tip: use arrow keys to move across the grid and Enter to open submitted work for review.</p>}
    <SectionGradeFinalization sectionId={gradebook.section.id}/>
   </>}
 </WorkspaceShell>;
}

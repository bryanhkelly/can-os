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
import { WorkspaceShell, WorkspacePanel, StatCard, StatusBadge } from "@/components/workspace";
import { SubmissionEvidence } from "@/components/student/SubmissionEvidence";
import { AssignmentConversation } from "@/components/learning/AssignmentConversation";
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
 const reviewQueue=gradebook?.cells.filter(cell=>cell.status==="submitted")??[];
 const pendingReviewCount=reviewQueue.length;
 const reviewIndex=reviewQueue.findIndex(cell=>cell.submissionId===reviewCell?.submissionId);
 const previousReview=reviewIndex>0?reviewQueue[reviewIndex-1]:undefined;
 const nextReview=reviewIndex>=0?reviewQueue[reviewIndex+1]:undefined;

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
     const next=refreshed.cells.find(item=>item.status==="submitted"&&item.submissionId!==cell.submissionId);
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

 /** Live rubric total for the grading panel; null until every criterion is valid. */
 const liveRubricTotal = (assessment: Assessment): number | null => {
  if (!assessment.rubric.length) return null;
  if(assessment.rubric.some(criterion=>!rubricInputs[criterion.id]?.trim()))return null;
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

 return <WorkspaceShell width="wide" eyebrow="CAN OS · Teacher" title="Gradebook"
  subtitle="Review submitted work, apply the rubric and return meaningful feedback."
  breadcrumbs={<><Link to="/teacher" search={{}} className="underline">Teacher Today</Link><span>/</span><span>Gradebook</span></>}>
   <WorkflowIntro eyebrow="Teaching · Assessment" title="Feedback that moves learning forward." description="Review submitted evidence, assess with the published rubric, and give each learner a clear next step. Grade changes stay in the authorized gradebook workflow." />
   {(search.assessment||search.student)&&<Link to="/teacher/gradebook" search={{section:selected||search.section}} className="mt-4 inline-block text-sm underline">View full section gradebook</Link>}
   {sections.length > 0 && <label className="mt-8 block max-w-sm text-sm font-semibold">
    Section
    <select className="mt-2 w-full rounded-lg border bg-background p-3" value={selected} onChange={event => void navigate({search:{section:event.target.value}})}>
     {sections.map(section => <option key={section.id} value={section.id}>{section.title} ({section.code})</option>)}
    </select>
   </label>}
   {loading && <p className="mt-8 text-sm" role="status">Loading gradebook…</p>}
   {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
   {notice && <p className="mt-8 rounded-lg border p-4 text-sm" role="status">{notice}</p>}
   {!loading && !error && sections.length === 0 && <p className="mt-8 rounded-lg border p-4 text-sm" role="status">No currently authorized teaching sections. A delegation, assignment, qualification or school agreement may be missing, revoked or expired. Historical grades and issued transcripts are unchanged; contact your school administrator if you believe access should continue.</p>}

   {!loading && !error && gradebook?.connected && gradebook.section && <>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
     <StatCard label="Students" value={gradebook.students.length}/>
     <StatCard label="Assessments" value={gradebook.assessments.length}/>
     <StatCard label="Needs grading" value={gradebook.cells.filter(cell=>cell.status==="submitted").length}/>
    </div>
    {!reviewCell&&reviewQueue.length===0&&<WorkspacePanel title="All caught up" description="There are no submitted assignments awaiting grading in this section. New student submissions will appear here." />}
    {!reviewCell&&reviewQueue.length>0&&<WorkspacePanel title={`Submission queue · ${pendingReviewCount} awaiting grading`} description="Choose a student submission to review and grade.">
     <nav aria-label="Submission queue" className="grid max-h-96 gap-2 overflow-y-auto">
      {reviewQueue.map(cell=><Link key={cell.submissionId} to="/teacher/gradebook"
       search={{section:selected,assessment:cell.assessmentId,student:cell.studentProfileId}}
       className="rounded-lg border p-3 text-sm hover:bg-muted">
       <span className="block font-semibold">{gradebook.students.find(student=>student.studentProfileId===cell.studentProfileId)?.displayName??"Student"}</span>
       <span className="mt-1 block text-xs text-muted-foreground">{gradebook.assessments.find(item=>item.id===cell.assessmentId)?.title??"Assessment"} · {cell.status}</span>
      </Link>)}
     </nav>
    </WorkspacePanel>}
    {reviewCell&&reviewAssessment&&reviewStudent&&<div className="mt-6 grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
     <WorkspacePanel title="Submission queue" description="Select submitted or reviewed work.">
      <nav aria-label="Submission queue" className="grid max-h-96 gap-2 overflow-y-auto">{reviewQueue.map(cell=><Link key={cell.submissionId}
       to="/teacher/gradebook" search={{section:selected,assessment:cell.assessmentId,student:cell.studentProfileId}}
       aria-current={cell.submissionId===reviewCell.submissionId?"page":undefined}
       className={"rounded-lg border p-3 text-sm "+(cell.submissionId===reviewCell.submissionId?"bg-muted":"")}>
       <span className="block font-semibold">{gradebook.students.find(student=>student.studentProfileId===cell.studentProfileId)?.displayName}</span>
       <span className="mt-1 block text-xs text-muted-foreground">{gradebook.assessments.find(item=>item.id===cell.assessmentId)?.title} · {cell.status}</span>
      </Link>)}</nav>
     </WorkspacePanel>
     <WorkspacePanel title={`${reviewStudent.displayName} · ${reviewAssessment.title}`} actions={<div className="flex gap-3 text-sm">
      {previousReview&&<Link to="/teacher/gradebook" search={{section:selected,assessment:previousReview.assessmentId,student:previousReview.studentProfileId}} className="underline">Previous</Link>}
      {reviewIndex>=0&&nextReview&&<Link to="/teacher/gradebook" search={{section:selected,assessment:nextReview.assessmentId,student:nextReview.studentProfileId}} className="underline">Next</Link>}
     </div>}>
      <SubmissionEvidence key={reviewCell.submissionId} submissionId={reviewCell.submissionId}/>
      <AssignmentConversation key={`conversation-${reviewCell.submissionId}`} assessmentId={reviewAssessment.id} studentPersonId={reviewStudent.personId}/>
      {reviewCell.status==="submitted"?<div className="grid gap-4">
       <StatusBadge>Ready for grading</StatusBadge>
       {reviewAssessment.rubric.length>0?<fieldset className="space-y-3"><legend className="font-semibold">Rubric</legend>
        {reviewAssessment.rubric.map(criterion=><label key={criterion.id} className="block text-sm font-semibold">{criterion.label} <span className="font-normal text-muted-foreground">(0–{criterion.maxPoints})</span>
         {criterion.description&&<span className="mt-1 block text-sm font-normal text-muted-foreground">{criterion.description}</span>}
         <input className="mt-2 w-28 rounded-lg border bg-background p-2" type="number" min={0} max={criterion.maxPoints}
          value={rubricInputs[criterion.id]??""} onChange={event=>setRubricInputs(current=>({...current,[criterion.id]:event.target.value}))}/>
        </label>)}
        <p role="status" className="text-sm font-semibold">Total: {liveRubricTotal(reviewAssessment)??"—"} / {reviewAssessment.pointsPossible??"—"}</p>
       </fieldset>:<label className="text-sm font-semibold">Score (0–{reviewAssessment.pointsPossible??"—"})
        <input className="mt-2 block w-28 rounded-lg border bg-background p-2" type="number" min={0} max={Number(reviewAssessment.pointsPossible??0)} value={score} onChange={event=>setScore(event.target.value)}/>
       </label>}
       <label className="text-sm font-semibold">Feedback comment<textarea rows={4} maxLength={4000} value={comment} onChange={event=>setComment(event.target.value)} className="mt-2 block w-full rounded-lg border bg-background p-3"/></label>
       <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={()=>submitGrade(reviewCell,reviewAssessment,true)}
         className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Save grading draft</button>
        <button type="button" disabled={busy} onClick={()=>submitGrade(reviewCell,reviewAssessment)}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Post grade</button>
        <Link to="/teacher/gradebook" search={{section:selected}} className="rounded-lg border px-4 py-2 text-sm">Close review</Link></div>
      </div>:<div className="space-y-3 text-sm">
       <p className="font-semibold">Score: {reviewCell.score??"—"} / {reviewAssessment.pointsPossible??"—"}</p>
       {reviewAssessment.rubric.map(criterion=><p key={criterion.id}>{criterion.label}: {reviewCell.feedbackRubric.find(item=>item.id===criterion.id)?.points??"—"} / {criterion.maxPoints}</p>)}
       <p className="whitespace-pre-wrap">{reviewCell.feedbackComment||"No feedback comment recorded."}</p>
       {reviewCell.status==="graded"&&reviewAssessment.maxAttempts!==null&&reviewCell.attemptNumber>=reviewAssessment.maxAttempts
        ?<p className="text-sm">The configured attempt limit has been reached. This submission cannot be returned for another attempt.</p>
        :reviewCell.status==="graded"&&<button type="button" disabled={busy} onClick={()=>returnForRevision(reviewCell.submissionId)} className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50">Return for revision</button>}
      </div>}
     </WorkspacePanel>
    </div>}
    <details className="mt-8 rounded-xl border bg-card p-5" open={search.lesson?true:undefined}>
     <summary className="cursor-pointer text-lg font-semibold">Create an assessment</summary>
     {search.lesson&&<p className="mt-2 text-sm text-muted-foreground">Creating {assignmentKind} from the selected publisher lesson. This activity belongs to your class, not the publisher's immutable course.</p>}
     {search.lesson&&!gradebook.curriculumLessons.some(lesson=>lesson.id===search.lesson)&&
      <p role="alert" className="mt-2 text-sm">This publisher lesson is unavailable in this class. Choose a listed lesson before creating the assessment.</p>}
    <section className="mt-4" aria-label="New assessment">
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
     <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Release date and time (optional)
       <input type="datetime-local" value={releaseAt} onChange={event=>setReleaseAt(event.target.value)}
        className="mt-2 w-full rounded-lg border bg-background p-3"/>
      </label>
      <label className="text-sm font-semibold">Close submissions (optional)
       <input type="datetime-local" value={closeAt} onChange={event=>setCloseAt(event.target.value)}
        className="mt-2 w-full rounded-lg border bg-background p-3"/>
      </label>
      <p className="text-xs text-muted-foreground sm:col-span-2">Times use your device timezone. Publishing without a release time opens work immediately. Work can be submitted after its due date until the close time; no close time leaves submissions open.</p>
     </div>
     <div className="mt-4 grid gap-4 sm:grid-cols-2">
       <label className="text-sm font-semibold">Class activity type
        <select aria-label="Class activity type" value={assignmentKind}
          onChange={event=>setAssignmentKind(event.target.value as typeof assignmentKind)}
          className="mt-2 w-full rounded-lg border bg-background p-3">
          {(["homework","classwork","quiz","test","project","discussion"] as const).map(kind=><option key={kind} value={kind}>{kind}</option>)}
        </select>
       </label>
       <label className="text-sm font-semibold">Publisher lesson (optional)
        <select aria-label="Publisher lesson for assignment" value={curriculumLessonId}
          onChange={event=>setCurriculumLessonId(event.target.value)}
          className="mt-2 w-full rounded-lg border bg-background p-3">
          <option value="">General class activity</option>
          {gradebook.curriculumLessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
        </select>
       </label>
     </div>
     <label className="mt-4 block text-sm font-semibold">Maximum attempts (optional)
      <input aria-label="Maximum assignment attempts" type="number" min={1} max={MAX_ASSESSMENT_ATTEMPTS} step={1}
       value={maxAttempts} onChange={event=>setMaxAttempts(event.target.value)}
       placeholder="No configured limit" className="mt-2 block w-48 rounded-lg border bg-background p-3"/>
      <span className="mt-2 block text-xs font-normal text-muted-foreground">Includes the first submission. Each revision still requires a teacher to return the work.</span>
     </label>
     <label className="mt-4 block text-sm font-semibold">Student instructions
      <textarea aria-label="Student assignment instructions" className="mt-2 w-full rounded-lg border bg-background p-3" rows={5} maxLength={20000}
       value={instructions} onChange={event=>setInstructions(event.target.value)} placeholder="Directions, deliverables, submission requirements and allowed resources." />
     </label>
     <fieldset className="mt-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">Scoring rubric (optional)</legend>
      <p className="mb-3 text-xs text-muted-foreground">Add criteria for graded projects, tests, discussions or other work. Criterion points must sum to the assignment's points possible.</p>
      {newRubric.map((criterion,index)=><div key={criterion.id} className="mb-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
       <label className="text-xs font-semibold">Criterion {index+1}
        <input aria-label={"Criterion "+(index+1)+" name"} className="mt-1 w-full rounded border bg-background p-2"
         value={criterion.label} maxLength={120} placeholder="e.g. Mathematical reasoning"
         onChange={event=>setNewRubric(rows=>rows.map(row=>row.id===criterion.id?{...row,label:event.target.value}:row))}/>
       </label>
       <label className="text-xs font-semibold">Points
        <input aria-label={"Criterion "+(index+1)+" points"} className="mt-1 w-full rounded border bg-background p-2"
         type="number" min={0.01} step="0.01" max={1000} value={criterion.maxPoints}
         onChange={event=>setNewRubric(rows=>rows.map(row=>row.id===criterion.id?{...row,maxPoints:event.target.value}:row))}/>
       </label>
       <button type="button" className="self-end rounded border px-3 py-2 text-xs" onClick={()=>setNewRubric(rows=>rows.filter(row=>row.id!==criterion.id))}>Remove</button>
       <label className="text-xs font-semibold sm:col-span-3">Description (optional)
        <textarea aria-label={"Criterion "+(index+1)+" description"} className="mt-1 w-full rounded border bg-background p-2"
         rows={2} maxLength={1000} value={criterion.description}
         onChange={event=>setNewRubric(rows=>rows.map(row=>row.id===criterion.id?{...row,description:event.target.value}:row))}/>
       </label>
      </div>)}
      <button type="button" disabled={newRubric.length>=20} className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
       onClick={()=>setNewRubric(rows=>[...rows,{id:"criterion-"+(++rubricSequence.current),label:"",maxPoints:"",description:""}])}>Add rubric criterion</button>
     </fieldset>
     <p className="mt-2 text-xs text-muted-foreground">The assignment belongs to this teacher's class. Linking to a publisher lesson preserves the original curriculum.</p>
     <p className="mt-3 text-xs text-muted-foreground">Due dates are planning information until you explicitly publish. Saving a draft never assigns work, even if it has a due date.</p>
     <label className="mt-3 flex items-start gap-2 text-sm">
       <input type="checkbox" checked={publishConfirmed} onChange={event=>setPublishConfirmed(event.target.checked)}
        disabled={busy}/>
       <span>I reviewed this assignment and understand Publish & assign makes it available to enrolled students now.</span>
     </label>
     <div className="mt-4 flex flex-wrap gap-3">
       <button type="button" disabled={busy} onClick={()=>void submitAssessment(false)}
        className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Save draft</button>
       <button type="button" disabled={busy||!due||!publishConfirmed} onClick={()=>void submitAssessment(true)}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Publish & assign</button>
     </div>
    </section></details>

    {gradebook.assessments.length === 0 && <p className="mt-8 text-sm">No assessments yet. Create one above to begin.</p>}
    {gradebook.assessments.length > 0 && <div ref={gridRef} className="mt-8 overflow-x-auto rounded-xl border bg-card">
     <table className="w-full border-collapse text-sm">
      <thead>
       <tr className="border-b text-left">
        <th className="p-3 font-semibold">Student</th>
        {gradebook.assessments.filter(item=>!search.assessment||item.id===search.assessment).map(assessment => <th key={assessment.id} className="min-w-32 p-3 font-semibold">
         <span className="block">{assessment.title}</span>
         <span className="block text-xs font-normal text-muted-foreground">
          {assessment.dueAt ? `Due ${new Date(assessment.dueAt).toLocaleDateString()}` : "No due date"} · {assessment.pointsPossible ?? "—"} pts
          {assessment.rubric.length > 0 && ` · ${assessment.rubric.length} criteria`}
          {" · "+assessment.kind}
          {" · "+assessment.status}
          {assessment.maxAttempts!==null&&" · "+assessment.maxAttempts+" maximum attempts"}
          {assessment.availableAt&&" · Releases "+new Date(assessment.availableAt).toLocaleString()}
          {assessment.closesAt?" · Closes "+new Date(assessment.closesAt).toLocaleString():" · No submission close time"}
         </span>
         <label className="mt-2 block text-xs font-normal">New due date
          <input aria-label={"Due date for "+assessment.title} type="date"
           value={assessmentDueDates[assessment.id]??""}
           onChange={event=>setAssessmentDueDates(current=>({...current,[assessment.id]:event.target.value}))}
           className="mt-1 w-full rounded border bg-background p-1.5 text-xs"/>
         </label>
         <div className="mt-2 flex flex-wrap gap-1">
          {assessment.status==="draft"&&<button disabled={busy} onClick={()=>changeAssessment(assessment.id,"publish")} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Publish</button>}
          {assessment.status==="published"&&<button disabled={busy} onClick={()=>changeAssessment(assessment.id,"close")} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Close</button>}
          {assessment.status==="closed"&&<button disabled={busy} onClick={()=>changeAssessment(assessment.id,"reopen")} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Reopen</button>}
          {assessment.status!=="draft"&&<button disabled={busy||!assessmentDueDates[assessment.id]} onClick={()=>changeAssessment(assessment.id,"reschedule")} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Change deadline</button>}
         </div>
        </th>)}
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

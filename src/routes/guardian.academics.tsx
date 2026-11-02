import { createFileRoute, Link } from "@tanstack/react-router";
import {resolveGuardianChild} from "@/domain/guardian-child-context";
import { useEffect, useState } from "react";
import { getGuardianAssignments, getGuardianStudents } from "@/modules/learning/guardian-academic-queries.functions";
import { guardianAssignmentSummary, guardianWorkNeedsAction } from "@/domain/guardian-academics";
import { WorkspaceShell, WorkspacePanel, StatusBadge, StatCard } from "@/components/workspace";
import { SubmissionAnnotations } from "@/components/learning/SubmissionAnnotations";
import { AssignmentConversation } from "@/components/learning/AssignmentConversation";
import { GuardianGradeResponseHistory } from "@/components/learning/GuardianGradeResponse";

export const Route = createFileRoute("/guardian/academics")({
 validateSearch:(search:Record<string,unknown>):{student?:string;section?:string;assessment?:string;submission?:string}=>({
  student:typeof search.student==="string"?search.student:undefined,
  section:typeof search.section==="string"?search.section:undefined,
  assessment:typeof search.assessment==="string"?search.assessment:undefined,
  submission:typeof search.submission==="string"?search.submission:undefined,
 }),
 component:()=> <GuardianAcademicsPage key={Route.useSearch().student??"default"}/>,
});

type Student = { studentPersonId: string; firstName: string; lastName: string };
type Assignment = Awaited<ReturnType<typeof getGuardianAssignments>>["assignments"][number];

function GuardianAcademicsPage() {
 const {student,section,assessment,submission}=Route.useSearch();
 const navigate=Route.useNavigate();
 const [students, setStudents] = useState<Student[]>([]);
 const [selected, setSelected] = useState("");
 const [assignments, setAssignments] = useState<Assignment[]>([]);
 const [loading, setLoading] = useState(true);
 const [loadingStudents, setLoadingStudents] = useState(true);
 const [error, setError] = useState("");

 useEffect(() => {
  let active = true;
  getGuardianStudents().then(result => {
   if (!active) return;
   setStudents(result.students);
   const requested = student??null;
   setSelected(resolveGuardianChild(result.students,requested));
   setLoadingStudents(false);
  }).catch(() => {
   if (active) { setError("Sign in with an authorized guardian account to view academic progress."); setLoadingStudents(false); setLoading(false); }
  });
  return () => { active = false; };
 }, []);

 useEffect(() => {
  if (!selected) { setAssignments([]); setLoading(false); return; }
  let active = true;
  setLoading(true);
  setError("");
  getGuardianAssignments({ data: { studentPersonId: selected } }).then(result => {
   if (active) { setAssignments(result.assignments); setLoading(false); }
  }).catch(() => {
   if (active) { setAssignments([]); setError("Unable to load academic progress for this student."); setLoading(false); }
  });
  return () => { active = false; };
 }, [selected]);

 const classAssignments=assignments.filter(item=>!section||item.sectionId===section);
 const visible=classAssignments.filter(item=>!assessment||item.assessmentId===assessment);
 const summary = guardianAssignmentSummary(visible, new Date());

 return <WorkspaceShell width="wide" eyebrow="CAN OS · Guardian" title="Academic progress"
  subtitle="Review class assignments, instructions and released teacher feedback for your connected children."
  breadcrumbs={<><Link to="/guardian" search={{student:selected||student}} className="underline">Family home</Link><span>/</span><span>Academics</span></>}
  actions={<Link to="/classes" className="rounded-lg border px-4 py-2 text-sm">Family classes</Link>}>
   {students.length > 0 && <label className="mt-8 block max-w-sm text-sm font-semibold">
    Student
    <select className="mt-2 w-full rounded-lg border bg-background p-3" value={selected} onChange={event => void navigate({search:{student:event.target.value}})}>
     {students.map(student => <option key={student.studentPersonId} value={student.studentPersonId}>{student.firstName} {student.lastName}</option>)}
    </select>
   </label>}
   {(loading || loadingStudents) && <p className="mt-8 text-sm" role="status">Loading academic progress…</p>}
   {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
   {student&&!selected&&!loadingStudents&&!error&&<p role="alert" className="mt-8 rounded-lg border p-4 text-sm">This student is unavailable in your current family workspace. Choose an authorized student above.</p>}
   {!loading && !loadingStudents && !error && students.length === 0 && <p className="mt-8 text-sm">No students with academic-viewing permission were found at your school.</p>}
   {!loading && !loadingStudents && !error && students.length > 0 && assignments.length === 0 && <p className="mt-8 text-sm">No published assignments found.</p>}
   {(section||assessment)&&<Link to="/guardian/academics" search={{student:selected||student}} className="mt-4 inline-block text-sm underline">All assignments for this child</Link>}
   {!loading&&!loadingStudents&&!error&&selected&&(section||assessment)&&!visible.length&&<p role="alert" className="mt-5 rounded-xl border p-4">This assignment or class is unavailable in this child's authorized academic view.</p>}
   {!loading && !loadingStudents && !error && assignments.length > 0 && <div className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Assignment summary">
    <StatCard label="Unfinished work" value={summary.needsAction}/>
    <StatCard label="Overdue" value={summary.overdue}/>
    <StatCard label="Grades released" value={summary.releasedGrades}/>
   </div>}
   {!loading && !loadingStudents && !error && assignments.length > 0 && <div className="mt-8 grid gap-4">
    {visible.map(item => <section key={item.assessmentId} className="rounded-xl border bg-card p-5">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs text-muted-foreground"><Link to="/classes" search={{section:item.sectionId,student:selected}} className="underline">{item.course}</Link></p><h2 className="mt-1 text-lg font-semibold"><Link to="/guardian/academics" search={{student:selected,section:item.sectionId,assessment:item.assessmentId}} className="underline">{item.title}</Link></h2></div>
      <StatusBadge tone={item.timeliness==="missing"?"attention":"neutral"}>{item.status.replaceAll("_"," ")}{item.timeliness==="missing"?" · missing":item.timeliness==="late"?" · late":""}</StatusBadge>
     </div>
     <p className="mt-3 text-sm text-muted-foreground">Due: {item.dueAt ? new Date(item.dueAt).toLocaleDateString() : "Not set"}</p>
     {item.revisionLimitReached && <div className="mt-3 rounded-lg border p-3 text-sm" role="status">
      <p className="font-semibold">No revision attempts remain for this assignment.</p>
      <p className="mt-1">The teacher's returned feedback is still available, but the student cannot submit another attempt under the current limit. Review the feedback and ask the school about next steps.</p>
      {!assessment && <Link to="/guardian/academics" search={{student:selected,section:item.sectionId,assessment:item.assessmentId}}
       className="mt-2 inline-block font-semibold underline">Open feedback and school conversation</Link>}
     </div>}
     {!item.revisionLimitReached && guardianWorkNeedsAction(item.status) &&
      (item.workAvailabilityReason==="closed"||item.workAvailabilityReason==="unpublished_or_closed") &&
      <p className="mt-3 rounded-lg border p-3 text-sm" role="status">
       This assignment is no longer accepting student submissions. Review the unfinished work with your school.
      </p>}
     {guardianWorkNeedsAction(item.status) && item.workAvailabilityReason==="unreleased" &&
      <p className="mt-3 text-sm text-muted-foreground">This assignment has not opened for student work yet.</p>}
     {item.score !== null && <p className="mt-2 text-sm font-semibold">Grade: {item.score} / {item.pointsPossible}</p>}
     {item.feedback && <p className="mt-3 rounded-lg bg-muted p-3 text-sm">Teacher feedback: {item.feedback}</p>}
     {item.revisionFeedback && <p className="mt-3 rounded-lg border p-3 text-sm">
      Previously released teacher feedback for this revision: {item.revisionFeedback}
     </p>}
     {assessment&&<>
      <div className="mt-5 whitespace-pre-wrap text-sm leading-7"><h3 className="font-semibold">Assignment instructions</h3><p className="mt-2">{item.instructions||"No additional instructions provided."}</p></div>
      {item.rubric?.length>0&&<WorkspacePanel title="Rubric" className="mt-5"><ul className="space-y-3">{item.rubric.map(criterion=><li key={criterion.id} className="text-sm"><p className="font-semibold">{criterion.label} · {criterion.maxPoints} points</p><p>{criterion.description}</p></li>)}</ul></WorkspacePanel>}
      {item.submissionId&&["graded","returned"].includes(item.status)&&<SubmissionAnnotations key={item.submissionId} submissionId={item.submissionId}/>}
      {item.revisionFeedbackSubmissionId&&<SubmissionAnnotations key={item.revisionFeedbackSubmissionId}
       submissionId={item.revisionFeedbackSubmissionId}/>}
      <AssignmentConversation key={`${selected}:${item.assessmentId}`} assessmentId={item.assessmentId} studentPersonId={selected}/>
      <GuardianGradeResponseHistory attempts={item.releasedAttempts} currentSubmissionId={item.submissionId}
       focusSubmissionId={submission}/>
     </>}
    </section>)}
   </div>}
 </WorkspaceShell>;
}

import { Link } from "@tanstack/react-router";
import { StatusBadge } from "@/components/workspace";
import type { listGuardianGradeFollowUps } from "@/modules/learning/guardian-grade-response.functions";

type GradeFollowUp = Awaited<ReturnType<typeof listGuardianGradeFollowUps>>["items"][number];

/** One grade-question record display for guardians. The school remains the
 * authority for assessment results and response state.
 */
export function GuardianGradeQuestions({
  questions, warning, selectedStudentId,
}: {
  questions: readonly GradeFollowUp[];
  warning?: string;
  selectedStudentId?: string;
}) {
  return <section aria-label="School responses to your grade questions" className="mt-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <h2 className="font-serif text-2xl font-semibold tracking-tight">Your school grade questions</h2>
     <Link to="/guardian/students" search={{student:selectedStudentId}} className="inline-flex min-h-11 items-center text-sm font-semibold underline focus-visible:outline-2">Academic progress</Link>
    </div>
    <p className="mt-2 text-sm text-muted-foreground">Questions you sent about released grades, and your school's responses. Pending questions are awaiting school action, not another family task.</p>
    {warning&&<p className="mt-3  border p-3 text-sm" role="status">{warning}</p>}
    {!warning&&questions.length===0&&<p className="mt-3 text-sm text-muted-foreground">No school grade questions to review in the current academic view.</p>}
    <div className="mt-4 space-y-3">
     {questions.slice(0,6).map(question=><article key={question.id} className=" border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <p className="font-semibold">{question.studentName} · {question.assessmentTitle}</p>
       <StatusBadge tone={question.status==="resolved"?"success":"info"}>{question.status==="resolved"?"School responded":"Awaiting school response"}</StatusBadge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Your question: {question.question}</p>
      {question.status==="resolved"&&question.resolutionNote&&<p className="mt-3 whitespace-pre-wrap  bg-muted p-3 text-sm">School response: {question.resolutionNote}</p>}
      <Link to="/guardian/students"
       search={{student:question.studentPersonId,section:question.sectionId,assessment:question.assessmentId,submission:question.submissionId}}
       className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline focus-visible:outline-2">View grade and school follow-up</Link>
     </article>)}
    </div>
    {questions.length>6&&<p className="mt-3 text-sm text-muted-foreground">Showing 6 of {questions.length} recent questions. Open academic progress for your child's full assignment history.</p>}
   </section>;
}

import type { getGradebook } from "@/modules/learning/gradebook.functions";
import { RubricScoreFields } from "@/components/learning/RubricScoreFields";
import { GradebookReviewActions } from "@/components/learning/GradebookReviewActions";
import { StatusBadge } from "@/components/workspace";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Assessment=Awaited<ReturnType<typeof getGradebook>>["assessments"][number];

export function GradebookScoringEditor({
 assessment, score, comment, rubricInputs, busy, sectionId,
 onScoreChange, onCommentChange, onRubricChange, onSaveDraft, onPostGrade, liveTotal,
}:{
 assessment:Assessment;score:string;comment:string;rubricInputs:Record<string,string>;
 busy:boolean;sectionId:string;liveTotal:number|null;
 onScoreChange:(score:string)=>void;onCommentChange:(comment:string)=>void;
 onRubricChange:(id:string,value:string)=>void;onSaveDraft:()=>void;onPostGrade:()=>void;
}) {
 return <div className="grid gap-4">
  <StatusBadge>Ready for grading</StatusBadge>
  {assessment.rubric.length>0?<RubricScoreFields
    criteria={assessment.rubric} values={rubricInputs} onChange={onRubricChange}
    total={liveTotal} pointsPossible={assessment.pointsPossible}/>
   :<Field label={`Score (0–${assessment.pointsPossible??"—"})`} required className="max-w-40"
      description="Enter the number of points awarded for this submission.">
     <Input type="number" min={0} max={Number(assessment.pointsPossible??0)} step="any"
      disabled={busy} value={score} onChange={event=>onScoreChange(event.target.value)}/>
    </Field>}
  <Field label="Feedback comment" description="Students can read this when you post the grade. Saving a draft does not release feedback.">
   <Textarea rows={4} maxLength={4000} disabled={busy}
    value={comment} onChange={event=>onCommentChange(event.target.value)}/>
  </Field>
  <GradebookReviewActions busy={busy} sectionId={sectionId} onSaveDraft={onSaveDraft} onPostGrade={onPostGrade}/>
 </div>;
}

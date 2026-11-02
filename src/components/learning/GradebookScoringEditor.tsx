import type { getGradebook } from "@/modules/learning/gradebook.functions";
import { RubricScoreFields } from "@/components/learning/RubricScoreFields";
import { GradebookReviewActions } from "@/components/learning/GradebookReviewActions";
import { StatusBadge } from "@/components/workspace";

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
   :<label className="text-sm font-semibold">Score (0–{assessment.pointsPossible??"—"})
     <input className="mt-2 block w-28 rounded-lg border bg-background p-2" type="number" min={0}
      max={Number(assessment.pointsPossible??0)} value={score} onChange={event=>onScoreChange(event.target.value)}/>
    </label>}
  <label className="text-sm font-semibold">Feedback comment
   <textarea rows={4} maxLength={4000} value={comment} onChange={event=>onCommentChange(event.target.value)}
    className="mt-2 block w-full rounded-lg border bg-background p-3"/>
  </label>
  <GradebookReviewActions busy={busy} sectionId={sectionId} onSaveDraft={onSaveDraft} onPostGrade={onPostGrade}/>
 </div>;
}

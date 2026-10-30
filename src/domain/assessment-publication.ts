/** An assignment's due date is planning metadata; publication is an explicit command. */
export function createAssessmentStatus(publishNow:boolean,dueAt:Date|null):"draft"|"published"{
 if(publishNow&&!dueAt)throw new Error("A due date is required to publish and assign an assessment.");
 return publishNow?"published":"draft";
}

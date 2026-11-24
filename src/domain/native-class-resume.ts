export type ResumeLesson={
  lessonId:string;lessonTitle:string;lessonBody:string;
  videoResources:readonly unknown[];progressStatus:string|null;
};

/** Use the same learner-facing lesson projection as the Class workspace.
 * Empty lessons and unapproved supplemental media do not inflate progress. */
export function deriveNativeClassResume(
  classId:string,title:string,lessons:readonly ResumeLesson[],
){
  let total=0,completed=0;
  let next:{id:string;title:string}|null=null;
  for(const lesson of lessons){
    if(!lesson.lessonBody.trim()&&!lesson.videoResources.length)continue;
    total++;
    if(lesson.progressStatus==="completed"||lesson.progressStatus==="waived")completed++;
    else next??={id:lesson.lessonId,title:lesson.lessonTitle};
  }
  return {classId,title,lesson:next,completed,total};
}

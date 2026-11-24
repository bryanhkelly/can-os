import { getMyStudentClasses } from "./native-class-student-home.functions";
import { getNativeClassHomework } from "./native-class-homework.functions";
import { safeLoader } from "@/lib/safe-loader";

/** Compose authorized reads without transporting answer text or teacher feedback
 * to an aggregate list. The Class workspace still owns all homework commands. */
export async function loadNativeStudentHomework() {
  const membership = await getMyStudentClasses();
  if (membership.kind !== "student") return {kind:"other" as const,classes:[]};
  const enrolled = membership.classes.filter(item=>item.status==="active" && item.enrollmentId && item.courseAttemptId);
  const classes = [];
  for (let offset=0; offset<enrolled.length; offset+=3) {
    const batch = enrolled.slice(offset,offset+3);
    const results = await Promise.all(batch.map(async item=>{
      const result = await safeLoader(()=>getNativeClassHomework({data:{classEnrollmentId:item.enrollmentId!}}))();
      return {classId:item.classId,title:item.title,creditMode:item.creditMode,
        available:result.ok,
        assignments:result.ok ? result.data.assignments.map(assignment=>({
          id:assignment.id,title:assignment.title,dueAt:assignment.dueAt,status:assignment.status,
          submittedAt:assignment.submittedAt,
        })) : []};
    }));
    classes.push(...results);
  }
  return {kind:"student" as const,classes};
}
export type NativeStudentHomeworkIndex=Awaited<ReturnType<typeof loadNativeStudentHomework>>;

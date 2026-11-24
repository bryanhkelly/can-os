import { getMyStudentClasses } from "./native-class-student-home.functions";
import { getNativeClassHomeworkSummary } from "./native-class-homework.functions";
import { safeLoader } from "@/lib/safe-loader";
import { orderedBatches } from "@/lib/ordered-batches";

/** Compose authorized reads without transporting answer text or teacher feedback
 * to an aggregate list. The Class workspace still owns all homework commands. */
export async function loadNativeStudentHomework() {
  const membership = await getMyStudentClasses();
  if (membership.kind !== "student") return {kind:"other" as const,classes:[]};
  const enrolled = membership.classes.filter(item=>item.status==="active" && item.enrollmentId && item.courseAttemptId);
  const classes = [];
  for await (const results of orderedBatches(enrolled,3,async item=>{
    const result=await safeLoader(()=>getNativeClassHomeworkSummary({data:{classEnrollmentId:item.enrollmentId!}}))();
    return {classId:item.classId,title:item.title,creditMode:item.creditMode,
      available:result.ok,assignments:result.ok?result.data.assignments:[]};
  })){
    classes.push(...results);
  }
  return {kind:"student" as const,classes};
}
export type NativeStudentHomeworkIndex=Awaited<ReturnType<typeof loadNativeStudentHomework>>;

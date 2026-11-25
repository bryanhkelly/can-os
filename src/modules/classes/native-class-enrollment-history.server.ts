import {and,desc,eq,inArray} from "drizzle-orm";
import type {db} from "@/db/client";
import {canonicalClassEnrollments} from "@/db/canonical-v301";
import {AuthorizationError} from "@/domain/command-context";

type Reader=Pick<typeof db,"select">;

/** Caller authorizes the exact Class and learner. Admission callers hold
 * the Class lock. Never treat a duplicate open record as an idempotent retry. */
export async function readOpenNativeClassEnrollment(reader:Reader,classId:string,learnerPersonId:string){
  const rows=await reader.select({
    id:canonicalClassEnrollments.id,status:canonicalClassEnrollments.status,
    creditMode:canonicalClassEnrollments.creditMode,
    courseAttemptId:canonicalClassEnrollments.courseAttemptId,
  }).from(canonicalClassEnrollments).where(and(
    eq(canonicalClassEnrollments.classId,classId),
    eq(canonicalClassEnrollments.learnerPersonId,learnerPersonId),
    inArray(canonicalClassEnrollments.status,["pending","active"]),
  )).limit(2);
  if(rows.length>1)throw new AuthorizationError("duplicate open Class enrollments require reconciliation");
  return rows[0];
}

/** Search the entire completion history, not an arbitrary recent window.
 * Deterministic tie-breaker ensures every repeat path identifies the same prior record. */
export async function readLatestCompletedNativeClassEnrollment(reader:Reader,classId:string,learnerPersonId:string){
  const [completed]=await reader.select({id:canonicalClassEnrollments.id})
    .from(canonicalClassEnrollments).where(and(
      eq(canonicalClassEnrollments.classId,classId),
      eq(canonicalClassEnrollments.learnerPersonId,learnerPersonId),
      eq(canonicalClassEnrollments.status,"completed"),
    )).orderBy(desc(canonicalClassEnrollments.enrolledAt),desc(canonicalClassEnrollments.id)).limit(1);
  return completed;
}

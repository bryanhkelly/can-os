import { and, eq, gt, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { submissions } from "@/db/schema";

/** Correlate before status filters or queue limits: an older submitted/graded
 * attempt must not replace the student's newer draft, revision or submission.
 */
export function latestSubmissionCondition(query: Pick<typeof import("@/db/client").db, "select">) {
  const newer = alias(submissions, "newer_student_assessment_attempt");
  return notExists(query.select({ id: newer.id }).from(newer).where(and(
    eq(newer.assessmentId, submissions.assessmentId),
    eq(newer.studentProfileId, submissions.studentProfileId),
    gt(newer.attemptNumber, submissions.attemptNumber),
  )));
}

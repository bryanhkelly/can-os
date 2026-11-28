import {readHistoricalClassWork} from "./historical-class-work.server";
import { projectSubmissionRevisionPage } from "@/domain/submission-revisions";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { AuthorizationError } from "@/domain/command-context";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeNativeLearnerClass } from "./native-learner-class-access.server";

import { homeworkSubmissionInput, submitNativeClassHomeworkCommand } from "./native-class-learner-write.server";

const uuid = z.string().uuid();
const target = z.object({ classEnrollmentId: uuid }).strict();

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

import { readNativeClassHomework, readNativeClassHomeworkSummary } from "./native-class-homework-read.server";

/** Minimal DTO for the authenticated student assignment index. */
export const getNativeClassHomeworkSummary=createServerFn({method:"GET"})
  .validator((raw:unknown)=>target.parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getInstructionalLearnerContext(getRequest());
    return readNativeClassHomeworkSummary(actor,data.classEnrollmentId);
  });

export const getNativeClassHomework = createServerFn({method:"GET"})
  .validator((raw: unknown) => target.parse(raw))
  .handler(async ({data}) => {
    noStore();
    const actor = await getInstructionalLearnerContext(getRequest());
    return readNativeClassHomework(actor,data.classEnrollmentId);
  });

/** Read a bounded page of the learner's own preserved submission states.
 * The parent homework service owns authorization; no separate identity path. */
export const getNativeClassHomeworkHistory=createServerFn({method:"GET"})
  .validator((raw:unknown)=>target.extend({
    assignmentId:uuid,beforeRevision:z.number().int().positive().optional(),
  }).strict().parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx=>{
      const {cls,courseAttemptId}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_read");
      const result=await tx.execute(sql`
        SELECT r.revision_no,r.status,r.response,r.submitted_at,r.recorded_at,r.source
        FROM public.graded_submission_revisions r
        JOIN public.graded_submissions gs ON gs.id=r.submission_id AND gs.course_version_id=r.course_version_id
        JOIN public.graded_assignments ga ON ga.id=gs.assignment_id AND ga.course_version_id=gs.course_version_id
        WHERE gs.course_attempt_id=${courseAttemptId}::uuid
          AND gs.course_version_id=${cls.courseVersionId}::uuid
          AND ga.id=${data.assignmentId}::uuid AND ga.section_id IS NULL
          AND (${data.beforeRevision??null}::int IS NULL OR r.revision_no<${data.beforeRevision??null}::int)
        ORDER BY r.revision_no DESC LIMIT 21
      `);
      return projectSubmissionRevisionPage(result.rows);
    });
  });

/** Persist text homework in the EXISTING graded_submissions table. A submitted
 * or graded response is never silently overwritten. Repeated identical
 * submissions return an idempotent acknowledgement. */
export const submitNativeClassHomework=createServerFn({method:"POST"})
  .validator((raw:unknown)=>homeworkSubmissionInput.parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getInstructionalLearnerContext(getRequest());
    return submitNativeClassHomeworkCommand(actor,data);
  });

/** Historical school work is not available through adult learner placement grants. */
export const getNativeClassHistoricalWork=createServerFn({method:"GET"})
 .validator((raw:unknown)=>target.extend({beforeId:uuid.optional()}).strict().parse(raw))
 .handler(async({data})=>{
  noStore();
  const actor=await getInstructionalLearnerContext(getRequest());
  if(actor.role!=="student")throw new AuthorizationError("own school records");
  return db.transaction(async tx=>{
   const {cls,enrollment}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_read");
   return readHistoricalClassWork(tx,{classId:cls.id,classEnrollmentId:enrollment.id,beforeId:data.beforeId});
  });
 });

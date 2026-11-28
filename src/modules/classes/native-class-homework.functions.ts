import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";

import { homeworkSubmissionInput, submitNativeClassHomeworkCommand } from "./native-class-learner-write.server";

const uuid = z.string().uuid();
const target = z.object({ classEnrollmentId: uuid }).strict();

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

import { readNativeClassHomework, readNativeClassHomeworkSummary, readNativeHomeworkHistory, readNativeHistoricalWork } from "./native-class-homework-read.server";

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
    return readNativeHomeworkHistory(actor,data);
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
  return readNativeHistoricalWork(actor,data);
  });
 });

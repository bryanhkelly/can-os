import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import {
  beginNoncreditKnowledgeCheck, readNoncreditKnowledgeCheck, submitNoncreditKnowledgeCheck,
  saveNoncreditKnowledgeCheckDraft,
} from "./noncredit-assessment.server";
import { finalizeNoncreditKnowledgeCheck } from "./noncredit-assessment-review.server";
import { provisionNoncreditAssessmentAccess } from "./noncredit-assessment-access.server";

const uuid=z.string().uuid();
const course=z.object({courseAttemptId:uuid}).strict();
const start=course.extend({requestId:uuid}).strict();
const submit=start.extend({
  attemptId:uuid,
  answers:z.array(z.object({
    questionId:uuid,
    optionIds:z.array(uuid).min(1).max(32),
  }).strict()).min(1).max(100),
}).strict();
const review=z.object({courseAttemptId:uuid,assessmentAttemptId:uuid}).strict();
const privateResponse=()=>setResponseHeader("Cache-Control","private, no-store");

/** Course-attempt-scoped learner knowledge check: private, noncredit, never a grade. */
export const getNoncreditKnowledgeCheck=createServerFn({method:"GET"})
  .validator((v:unknown)=>course.parse(v))
  .handler(async({data})=>{
    privateResponse();
    return readNoncreditKnowledgeCheck(
      await getInstructionalLearnerContext(getRequest()),data.courseAttemptId,
    );
  });

export const beginNoncreditKnowledgeCheckAttempt=createServerFn({method:"POST"})
  .validator((v:unknown)=>start.parse(v))
  .handler(async({data})=>{
    privateResponse();
    return beginNoncreditKnowledgeCheck(
      await getInstructionalLearnerContext(getRequest()),data,
    );
  });

const draft=course.extend({
  attemptId:uuid,questionId:uuid,requestId:uuid,
  optionIds:z.array(uuid).max(32),
}).strict();

/** Durable draft answers for interrupted mobile sessions and resume. */
export const saveNoncreditKnowledgeCheckAnswer=createServerFn({method:"POST"})
  .validator((v:unknown)=>draft.parse(v))
  .handler(async({data})=>{
    privateResponse();
    return saveNoncreditKnowledgeCheckDraft(
      await getInstructionalLearnerContext(getRequest()),data,
    );
  });

export const submitNoncreditKnowledgeCheckAnswers=createServerFn({method:"POST"})
  .validator((v:unknown)=>submit.parse(v))
  .handler(async({data})=>{
    privateResponse();
    return submitNoncreditKnowledgeCheck(
      await getInstructionalLearnerContext(getRequest()),data,
    );
  });

/**
 * Deliberately separate authorized provider action. The learner cannot
 * finalize their own knowledge-check result or write an official grade.
 */
export const finalizeNoncreditKnowledgeCheckResult=createServerFn({method:"POST"})
  .validator((v:unknown)=>review.parse(v))
  .handler(async({data})=>{
    privateResponse();
    return finalizeNoncreditKnowledgeCheck(
      await getCanonicalCommandContext(getRequest()),data,
    );
  });

/** Provider-issued learner grant; never self-issued by a learner account. */
export const provisionNoncreditKnowledgeCheckAccess=createServerFn({method:"POST"})
  .validator((v:unknown)=>course.parse(v))
  .handler(async({data})=>{
    privateResponse();
    return provisionNoncreditAssessmentAccess(
      await getCanonicalCommandContext(getRequest()),data.courseAttemptId,
    );
  });

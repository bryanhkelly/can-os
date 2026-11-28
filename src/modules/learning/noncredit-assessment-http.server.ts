import {parseCommandInput} from "@/domain/command-input";
import {getCanonicalCommandContext} from "@/modules/identity/canonical-command-context.server";
import {getInstructionalLearnerContext} from "@/modules/identity/learning-command-context.server";
import {readNoncreditKnowledgeCheck,beginNoncreditKnowledgeCheck,saveNoncreditKnowledgeCheckDraft,submitNoncreditKnowledgeCheck} from "./noncredit-assessment.server";
import {finalizeNoncreditKnowledgeCheck} from "./noncredit-assessment-review.server";
import {provisionNoncreditAssessmentAccess} from "./noncredit-assessment-access.server";
import * as input from "./noncredit-assessment.inputs";
export async function getNoncreditKnowledgeCheckService(request:Request,raw:unknown){
 const data=parseCommandInput(input.course,raw);
 const context=await getInstructionalLearnerContext(request);
 return readNoncreditKnowledgeCheck(context,data.courseAttemptId,data.phase);
}
export async function beginNoncreditKnowledgeCheckAttemptService(request:Request,raw:unknown){
 const data=parseCommandInput(input.start,raw);
 const context=await getInstructionalLearnerContext(request);
 return beginNoncreditKnowledgeCheck(context,data);
}
export async function saveNoncreditKnowledgeCheckAnswerService(request:Request,raw:unknown){
 const data=parseCommandInput(input.draft,raw);
 const context=await getInstructionalLearnerContext(request);
 return saveNoncreditKnowledgeCheckDraft(context,data);
}
export async function submitNoncreditKnowledgeCheckAnswersService(request:Request,raw:unknown){
 const data=parseCommandInput(input.submit,raw);
 const context=await getInstructionalLearnerContext(request);
 return submitNoncreditKnowledgeCheck(context,data);
}
export async function finalizeNoncreditKnowledgeCheckResultService(request:Request,raw:unknown){
 const data=parseCommandInput(input.review,raw);
 const context=await getCanonicalCommandContext(request);
 return finalizeNoncreditKnowledgeCheck(context,data);
}
export async function provisionNoncreditKnowledgeCheckAccessService(request:Request,raw:unknown){
 const data=parseCommandInput(input.course,raw);
 const context=await getCanonicalCommandContext(request);
 return provisionNoncreditAssessmentAccess(context,data.courseAttemptId,data.phase);
}

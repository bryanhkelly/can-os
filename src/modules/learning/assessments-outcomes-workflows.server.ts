import {getCanonicalCourseEvidenceService} from "@/modules/learning/canonical-course-evidence.server";
import {provisionNativeClassKnowledgeCheckAccessService} from "@/modules/classes/native-class-assessment-provision.server";
import {getNativeClassPendingKnowledgeReviewsService,finalizeNativeClassKnowledgeCheckService} from "@/modules/classes/native-class-assessment-finalize.server";
import {getNativeClassCanonicalEvidenceService} from "@/modules/classes/native-class-canonical-evidence.server";
import * as classCompletion from "@/modules/classes/native-class-completion.server";
import {publishNativeClassCompletionPolicyService} from "@/modules/classes/native-class-completion-policy.server";
import * as completionEvidence from "@/modules/learning/completion-evidence-review.server";
import {revokeLearningAwardIssuanceService} from "@/modules/learning/credential-revocation.server";
import * as learnerCredentials from "@/modules/learning/learner-credentials.server";
import {previewNoncreditCredentialService} from "@/modules/learning/credential-preview.server";
import * as completionAdmin0 from "@/modules/learning/noncredit-completion-decisions.server";
import * as completionAdmin1 from "@/modules/learning/noncredit-completion-policy.server";
import * as completionAdmin2 from "@/modules/learning/noncredit-completion-review.server";
import * as completionAdmin3 from "@/modules/learning/noncredit-completion-corrections.server";
import * as knowledgeCheck from "@/modules/learning/noncredit-assessment-http.server";
import {getNoncreditCompletionReadinessService} from "@/modules/learning/noncredit-completion.server";
import * as classSurvey from "@/modules/classes/native-class-survey-link.server";
import * as roomSurvey from "@/modules/learning/classroom-surveys.server";
import * as surveyDraft from "@/modules/operations/canonical-survey-draft.server";
import * as surveyApproval from "@/modules/operations/canonical-survey-approvals.server";
import * as courseSurvey from "@/modules/learning/course-surveys.server";
import {AuthorizationError} from "@/domain/command-context";
import type {WorkflowMode} from "@/modules/identity/http-governed-workflows.server";
/** Fixed domain commands; global identity verification occurs before composition. */
export function createAssessmentsOutcomesWorkflows(request:Request,mode:WorkflowMode){
 return {
  getCanonicalCourseEvidence:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Course evidence context");return getCanonicalCourseEvidenceService(request,raw);},
  provisionNativeClassKnowledgeCheckAccess:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Native Class assessment context");return provisionNativeClassKnowledgeCheckAccessService(request,raw);},
  getNativeClassPendingKnowledgeReviews:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Native Class assessment context");return getNativeClassPendingKnowledgeReviewsService(request,raw);},
  finalizeNativeClassKnowledgeCheck:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Native Class assessment context");return finalizeNativeClassKnowledgeCheckService(request,raw);},
  getNativeClassCanonicalEvidence:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Native Class assessment context");return getNativeClassCanonicalEvidenceService(request,raw);},
  getNativeClassCompletionReview:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Class completion context");return classCompletion.getNativeClassCompletionReviewService(request,raw);},
  decideNativeClassCompletion:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Class completion context");return classCompletion.decideNativeClassCompletionService(request,raw);},
  getNativeClassCompletionQueue:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Class completion context");return classCompletion.getNativeClassCompletionQueueService(request,raw);},
  publishNativeClassCompletionPolicy:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Class completion context");return publishNativeClassCompletionPolicyService(request,raw);},
  requestCompletionEvidenceReview:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Completion evidence context");return completionEvidence.requestCompletionEvidenceReviewService(request,raw);},
  getPendingCompletionEvidenceReviews:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Completion evidence context");return completionEvidence.getPendingCompletionEvidenceReviewsService(request,raw);},
  decideCompletionEvidenceReview:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Completion evidence context");return completionEvidence.decideCompletionEvidenceReviewService(request,raw);},
  revokeLearningAwardIssuance:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Completion evidence context");return revokeLearningAwardIssuanceService(request,raw);},
  listMyNoncreditCredentials:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Credential reader context");const rows=await learnerCredentials.listMyNoncreditCredentialsService(request);return rows.map(row=>({...row,issuedAt:new Date(row.issuedAt).toISOString(),expiresAt:row.expiresAt===null?null:new Date(row.expiresAt).toISOString()}));},
  downloadMyNoncreditCredential:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Credential reader context");return learnerCredentials.downloadMyNoncreditCredentialService(request,raw);},
  previewNoncreditCredential:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Credential preview context");return previewNoncreditCredentialService(request,raw);},
  decideNoncreditCompletion:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin0.decideNoncreditCompletionService(request,raw);},
  getNoncreditCompletionPolicyCatalog:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin1.getNoncreditCompletionPolicyCatalogService(request);},
  publishNoncreditCompletionPolicy:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin1.publishNoncreditCompletionPolicyService(request,raw);},
  getNoncreditCompletionReview:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin2.getNoncreditCompletionReviewService(request,raw);},
  getNoncreditCompletionQueue:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin2.getNoncreditCompletionQueueService(request,raw);},
  correctNoncreditCompletion:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin3.correctNoncreditCompletionService(request,raw);},
  getNoncreditKnowledgeCheck:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.getNoncreditKnowledgeCheckService(request,raw);},
  beginNoncreditKnowledgeCheckAttempt:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.beginNoncreditKnowledgeCheckAttemptService(request,raw);},
  saveNoncreditKnowledgeCheckAnswer:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.saveNoncreditKnowledgeCheckAnswerService(request,raw);},
  submitNoncreditKnowledgeCheckAnswers:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.submitNoncreditKnowledgeCheckAnswersService(request,raw);},
  finalizeNoncreditKnowledgeCheckResult:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.finalizeNoncreditKnowledgeCheckResultService(request,raw);},
  provisionNoncreditKnowledgeCheckAccess:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.provisionNoncreditKnowledgeCheckAccessService(request,raw);},
  getNoncreditCompletionReadiness:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Knowledge check context");return getNoncreditCompletionReadinessService(request,raw);},
  getNativeClassSurveyCampaignOptions:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Classroom survey context");return classSurvey.getNativeClassSurveyCampaignOptions(request,raw);},
  linkNativeClassSurveyCampaign:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Classroom survey context");return classSurvey.linkNativeClassSurveyCampaign(request,raw);},
  getClassroomSurveyOptions:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Classroom survey context");return roomSurvey.getClassroomSurveyOptions(request,raw);},
  attachClassroomSurvey:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Classroom survey context");return roomSurvey.attachClassroomSurvey(request,raw);},
  getClassroomLearnerSurveys:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Classroom survey context");return roomSurvey.getClassroomLearnerSurveys(request,raw);},
  readCanonicalSurveyDraftAccess:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyDraft.readCanonicalSurveyDraftAccess(request);},
  createCanonicalSurveyDraft:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyDraft.createCanonicalSurveyDraft(request,raw);},
  readCanonicalSurveyReviewQueue:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyApproval.readCanonicalSurveyReviewQueue(request);},
  readCanonicalSurveyPublicationQueue:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyApproval.readCanonicalSurveyPublicationQueue(request);},
  recordCanonicalSurveyReview:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyApproval.recordCanonicalSurveyReview(request,raw);},
  publishCanonicalSurveyVersion:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyApproval.publishCanonicalSurveyVersion(request,raw);},
  listNoncreditCourseSurveys:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Survey context");return courseSurvey.listNoncreditCourseSurveys(request,raw);},
  getCourseSurvey:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Survey context");return courseSurvey.getCourseSurvey(request,raw);},
  submitCourseSurvey:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("Survey context");return courseSurvey.submitCourseSurvey(request,raw);},
 };
}

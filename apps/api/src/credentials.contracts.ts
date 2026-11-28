import {z} from 'zod';
const id=z.string().uuid(),format=z.enum(['pdf','badge_svg','badge_json']),kind=z.enum(['completion_certificate','digital_badge']),media=z.enum(['application/pdf','image/svg+xml','application/json']);
export const empty=z.object({}).strict();
export const download=z.object({issuanceId:id,format}).strict();
export const preview=z.object({trainingVersionId:id,format}).strict();
const date=z.string().datetime({offset:true});
export const listResult=z.array(z.object({id,title:z.string(),kind,credentialReference:z.string(),issuedAt:date,expiresAt:date.nullable(),current:z.boolean()}).strict());
export const artifactResult=z.object({filename:z.string(),mediaType:media,base64:z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict();
const str={type:'string' as const},uuid={...str,format:'uuid'},dt={...str,format:'date-time'},bool={type:'boolean' as const};
const en=(values:readonly string[])=>({...str,enum:[...values]});
const obj=(properties:Record<string,any>)=>({type:'object' as const,properties,required:Object.keys(properties),additionalProperties:false});
export const docs={download:obj({issuanceId:uuid,format:en(format.options)}),preview:obj({trainingVersionId:uuid,format:en(format.options)}),list:{type:'array' as const,items:obj({id:uuid,title:str,kind:en(kind.options),credentialReference:str,issuedAt:dt,expiresAt:{...dt,nullable:true},current:bool})},artifact:obj({filename:str,mediaType:en(media.options),base64:{...str,format:'byte'}})};

const reason=z.string().trim().min(10).max(1000), common={evidenceVersionId:id,reason};
const purpose=z.enum(['completion_correction','award_revocation','class_completion_decision']),outcome=z.enum(['completed','not_yet_completed','voided']);
export const evidenceRequest=z.discriminatedUnion('purpose',[
 z.object({purpose:z.literal('completion_correction'),registrationId:id,expectedDecisionId:id,approvedOutcome:z.enum(['not_yet_completed','voided']),...common}).strict(),
 z.object({purpose:z.literal('award_revocation'),issuanceId:id,...common}).strict(),
 z.object({purpose:z.literal('class_completion_decision'),classEnrollmentId:id,expectedClassOutcomeId:id.nullable(),approvedOutcome:outcome,...common}).strict(),
]);
export const evidenceDecision=z.object({requestId:id,decision:z.enum(['approve','reject'])}).strict();
export const evidenceQueue=z.object({page:z.string().regex(/^(0|[1-9][0-9]?|100)$/).transform(Number).optional()}).strict();
export const revocation=z.object({issuanceId:id,...common}).strict();
export const requested=z.object({requestId:id,status:z.literal('pending')}).strict();
export const decided=z.object({requestId:id,status:z.enum(['approved','rejected'])}).strict();
export const revoked=z.object({eventId:id,alreadyRevoked:z.boolean()}).strict();
export const queueResult=z.object({page:z.number().int().min(0).max(100),hasMore:z.boolean(),pending:z.array(z.object({requestId:id,purpose,sourceId:id.nullable(),expectedPriorDecisionId:id.nullable(),proposedOutcome:outcome.nullable(),reviewReason:z.string(),evidenceVersionId:id,createdAt:date}).strict()).max(50)}).strict();
const reasonDoc={...str,minLength:10,maxLength:1000},commonDoc={evidenceVersionId:uuid,reason:reasonDoc},nil={...uuid,nullable:true};
export const evidenceDocs={
 request:{oneOf:[obj({purpose:en(['completion_correction']),registrationId:uuid,expectedDecisionId:uuid,approvedOutcome:en(['not_yet_completed','voided']),...commonDoc}),obj({purpose:en(['award_revocation']),issuanceId:uuid,...commonDoc}),obj({purpose:en(['class_completion_decision']),classEnrollmentId:uuid,expectedClassOutcomeId:nil,approvedOutcome:en(outcome.options),...commonDoc})]},
 decision:obj({requestId:uuid,decision:en(['approve','reject'])}),revocation:obj({issuanceId:uuid,...commonDoc}),
 requested:obj({requestId:uuid,status:en(['pending'])}),decided:obj({requestId:uuid,status:en(['approved','rejected'])}),revoked:obj({eventId:uuid,alreadyRevoked:bool}),
 queue:obj({page:{type:'integer',minimum:0,maximum:100},hasMore:bool,pending:{type:'array',maxItems:50,items:obj({requestId:uuid,purpose:en(purpose.options),sourceId:nil,expectedPriorDecisionId:nil,proposedOutcome:{...en(outcome.options),nullable:true},reviewReason:str,evidenceVersionId:uuid,createdAt:dt})}})
};

const blockers=z.enum(['inactive_participation','policy_unavailable','policy_not_pinned','lessons_incomplete','attendance_unverified','assessment_not_passed']),count=z.number().int().nonnegative();
export const classInspect=z.object({classEnrollmentId:id}).strict();
export const classQueue=z.object({classId:id,page:z.string().regex(/^(0|[1-9][0-9]?|100)$/).transform(Number).optional()}).strict();
export const classDecision=z.object({classEnrollmentId:id,expectedPolicyVersionId:id,expectedPriorOutcomeId:id.nullable(),outcome,...common}).strict();
export const classPolicy=z.object({classId:id,expectedLatestVersion:z.number().int().positive().nullable(),requireAllLessons:z.boolean(),requiredVerifiedSessions:z.number().int().min(0).max(52),requirePassingAssessment:z.boolean(),policyEvidenceVersionId:id,effectiveAt:date.optional()}).strict().refine(d=>d.requireAllLessons||d.requiredVerifiedSessions>0||d.requirePassingAssessment);
const readiness=z.object({readyForIndependentReview:z.boolean(),blockers:z.array(blockers),completedLessons:count,totalLessons:count,verifiedSessions:count,passingResultIds:z.array(id),verifiedCompletion:z.literal(false)}).strict();
export const classReviewResult=z.object({classEnrollmentId:id,courseAttemptId:id,classId:id,policyVersionId:id.nullable(),readiness,currentDecision:z.object({id,resultCode:z.string(),sourceEvidenceVersionId:id.nullable(),recordedAt:date}).strict().nullable(),verifiedCompletion:z.boolean(),note:z.string()}).strict();
export const classQueueResult=z.object({classId:id,classTitle:z.string(),latestCompletionPolicyVersion:count.nullable(),page:count,hasMore:z.boolean(),participants:z.array(z.object({classEnrollmentId:id,displayName:z.string(),enrollmentStatus:z.string(),completedLessons:count,totalLessons:count,verifiedSessions:count,finalizedPassingResults:count,readyForIndependentReview:z.boolean(),blockers:z.array(blockers),currentOutcome:z.string().nullable(),currentOutcomeId:id.nullable(),policyVersionId:id.nullable()}).strict()).max(10),note:z.string()}).strict();
export const classDecisionResult=z.object({outcomeId:id,alreadyRecorded:z.boolean()}).strict();
export const classPolicyResult=z.object({policyVersionId:id,versionNo:count,appliesTo:z.literal('future_enrollments')}).strict();
const integer={type:'integer' as const,minimum:0},blockerDoc={type:'array' as const,items:en(blockers.options)},nullableString={...str,nullable:true},nullableCount={...integer,nullable:true};
const counts={completedLessons:integer,totalLessons:integer,verifiedSessions:integer};
const readinessDoc=obj({readyForIndependentReview:bool,blockers:blockerDoc,...counts,passingResultIds:{type:'array',items:uuid},verifiedCompletion:{...bool,enum:[false]}});
const policyProps={classId:uuid,expectedLatestVersion:{...integer,minimum:1,nullable:true},requireAllLessons:bool,requiredVerifiedSessions:{...integer,maximum:52},requirePassingAssessment:bool,policyEvidenceVersionId:uuid,effectiveAt:dt};
export const classDocs={
 decision:obj({classEnrollmentId:uuid,expectedPolicyVersionId:uuid,expectedPriorOutcomeId:nil,outcome:en(outcome.options),...commonDoc}),
 policy:{...obj(policyProps),required:Object.keys(policyProps).filter(k=>k!=='effectiveAt')},
 review:obj({classEnrollmentId:uuid,courseAttemptId:uuid,classId:uuid,policyVersionId:nil,readiness:readinessDoc,currentDecision:{...obj({id:uuid,resultCode:str,sourceEvidenceVersionId:nil,recordedAt:dt}),nullable:true},verifiedCompletion:bool,note:str}),
 queue:obj({classId:uuid,classTitle:str,latestCompletionPolicyVersion:nullableCount,page:integer,hasMore:bool,participants:{type:'array',maxItems:10,items:obj({classEnrollmentId:uuid,displayName:str,enrollmentStatus:str,...counts,finalizedPassingResults:integer,readyForIndependentReview:bool,blockers:blockerDoc,currentOutcome:nullableString,currentOutcomeId:nil,policyVersionId:nil})},note:str}),
 decisionResult:obj({outcomeId:uuid,alreadyRecorded:bool}),policyResult:obj({policyVersionId:uuid,versionNo:integer,appliesTo:en(['future_enrollments'])})
};

export const nativeClassQuery=z.object({classId:id}).strict();
export const nativeEnrollment=z.object({classEnrollmentId:id}).strict();
export const nativeFinalize=nativeEnrollment.extend({assessmentAttemptId:id}).strict();
export const nativeGrant=z.object({accessGrantId:id,courseAttemptId:id,alreadyGranted:z.boolean()}).strict();
export const nativePending=z.object({pending:z.array(z.object({classEnrollmentId:id,assessmentAttemptId:id,learnerName:z.string(),submittedAt:date.nullable()}).strict()).max(100),partial:z.boolean()}).strict();
const grade=z.enum(['pass','fail','inconclusive']);
export const nativeFinalized=z.union([z.object({resultId:id,alreadyFinalized:z.literal(true)}).strict(),z.object({resultId:id,alreadyFinalized:z.literal(false),outcome:grade,pointsEarned:z.number().finite(),pointsPossible:z.number().finite()}).strict()]);
export const nativeEvidence=z.object({courseAttemptId:id,completedLessons:count,totalLessons:count,currentAssessmentGrants:count,finalizedAssessments:count,finalizedPassed:count,classCompletionOutcomeRecorded:z.boolean(),classCompletionAuthorityVerified:z.boolean(),classCompletionEvidenceCount:count,note:z.string()}).strict();
const num={type:'number' as const},truth={...bool,enum:[true]},falsy={...bool,enum:[false]};
export const nativeDocs={enrollment:obj({classEnrollmentId:uuid}),finalize:obj({classEnrollmentId:uuid,assessmentAttemptId:uuid}),grant:obj({accessGrantId:uuid,courseAttemptId:uuid,alreadyGranted:bool}),pending:obj({pending:{type:'array',maxItems:100,items:obj({classEnrollmentId:uuid,assessmentAttemptId:uuid,learnerName:str,submittedAt:{...dt,nullable:true}})},partial:bool}),finalized:{oneOf:[obj({resultId:uuid,alreadyFinalized:truth}),obj({resultId:uuid,alreadyFinalized:falsy,outcome:en(grade.options),pointsEarned:num,pointsPossible:num})]},evidence:obj({courseAttemptId:uuid,completedLessons:integer,totalLessons:integer,currentAssessmentGrants:integer,finalizedAssessments:integer,finalizedPassed:integer,classCompletionOutcomeRecorded:bool,classCompletionAuthorityVerified:bool,classCompletionEvidenceCount:integer,note:str})};

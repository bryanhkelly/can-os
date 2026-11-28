import {z} from 'zod';
const uuid=z.string().uuid();
export const registrationResult=z.object({registrationId:uuid,courseAttemptId:uuid,alreadyEnrolled:z.boolean(),classId:uuid.nullable(),classEnrollmentId:uuid.nullable()}).strict();
export const registrationReceipt=z.object({cookie:z.string().regex(/^__Host-can_os_v3_session=[A-Za-z0-9_-]{40,}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/),result:registrationResult}).strict();
export const enrollmentResult=z.object({classEnrollmentId:uuid,courseAttemptId:uuid,alreadyEnrolled:z.boolean()}).strict();
const str={type:'string' as const},id={...str,format:'uuid'},bool={type:'boolean' as const},yes={...bool,enum:[true]};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
export const docs={
 registration:obj({releaseId:id,classId:id,consentVersion:{...str,minLength:3,maxLength:80},consentSha256:{...str,pattern:'^[a-f0-9]{64}$'},acceptedConsent:yes,adultConfirmed:yes,referralCode:{...str,maxLength:64,pattern:'^[a-zA-Z0-9_-]*$'},networkMembershipId:id},['releaseId','consentVersion','consentSha256','acceptedConsent','adultConfirmed']),
 registrationResult:obj({registrationId:id,courseAttemptId:id,alreadyEnrolled:bool,classId:{...id,nullable:true},classEnrollmentId:{...id,nullable:true}}),
 enrollment:obj({classOfferingVersionId:id,creditMode:{...str,enum:['for_credit','audit','not_applicable']},adultAttested:yes,consentAccepted:yes,invitationId:id,approvalRequestId:id,networkMembershipId:id},['classOfferingVersionId','creditMode','adultAttested','consentAccepted']),
 enrollmentResult:obj({classEnrollmentId:id,courseAttemptId:id,alreadyEnrolled:bool}),
};

export const readyReceipt=z.object({cookie:z.string().regex(/^__Host-can_os_v3_session=[A-Za-z0-9_-]{40,}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/),result:z.object({ready:z.literal(true)}).strict()}).strict();
export const emptyCommand=z.object({}).strict();
export const readyDoc=obj({ready:yes});
export const emptyDoc=obj({});

const date=z.string().datetime({offset:true});
const dateDoc={...str,format:'date-time'};
const nullableDate={...dateDoc,nullable:true};
export const waitlistJoinInput=z.object({releaseId:uuid,consentVersion:z.string().min(3).max(80),consentSha256:z.string().regex(/^[a-f0-9]{64}$/),acceptedConsent:z.literal(true),adultConfirmed:z.literal(true)}).strict();
export const waitlistCancelInput=z.object({releaseId:uuid}).strict();
export const withdrawRegistrationInput=z.object({registrationId:uuid,confirm:z.literal(true)}).strict();
export const waitlistQuery=z.object({joinedAt:date.optional(),waitlistId:uuid.optional(),releaseId:uuid.optional()}).strict().refine(q=>(q.joinedAt===undefined)===(q.waitlistId===undefined));
export const waitlistJoinResult=z.object({status:z.enum(['waiting','invited']),alreadyQueued:z.boolean()}).strict();
export const waitlistCancelResult=z.object({cancelled:z.literal(true),duplicate:z.boolean()}).strict();
export const withdrawRegistrationResult=z.object({withdrawn:z.literal(true),alreadyWithdrawn:z.boolean()}).strict();
const cursor=z.object({joinedAt:date,waitlistId:uuid}).strict();
const waitlistItem=z.object({releaseId:uuid,title:z.string(),emailDeliveryStatus:z.string().nullable(),status:z.enum(['waiting','invited','expired']),invitationActive:z.boolean(),inviteExpiresAt:date.nullable(),joinedAt:date}).strict();
export const waitlistPageResult=z.object({items:z.array(waitlistItem).max(50),nextCursor:cursor.nullable()}).strict();
export const participationDocs={
 join:obj({releaseId:id,consentVersion:{...str,minLength:3,maxLength:80},consentSha256:{...str,pattern:'^[a-f0-9]{64}$'},acceptedConsent:yes,adultConfirmed:yes}),
 cancel:obj({releaseId:id}),
 withdraw:obj({registrationId:id,confirm:yes}),
 joinResult:obj({status:{...str,enum:['waiting','invited']},alreadyQueued:bool}),
 cancelResult:obj({cancelled:yes,duplicate:bool}),
 withdrawResult:obj({withdrawn:yes,alreadyWithdrawn:bool}),
 page:obj({items:{type:'array' as const,maxItems:50,items:obj({releaseId:id,title:str,emailDeliveryStatus:{...str,nullable:true},status:{...str,enum:['waiting','invited','expired']},invitationActive:bool,inviteExpiresAt:nullableDate,joinedAt:dateDoc})},nextCursor:{...obj({joinedAt:dateDoc,waitlistId:id}),nullable:true}}),
};

export const admissionOptionsInput=z.object({applicationId:uuid.optional(),siteId:uuid.optional(),programId:uuid.optional()}).strict();
export const issueOfferInput=z.object({applicationId:uuid,schoolYearId:uuid}).strict();
export const respondOfferInput=z.object({offerId:uuid,decision:z.enum(['accept','decline'])}).strict();
export const activateOfferInput=z.object({offerId:uuid,sectionId:uuid.optional()}).strict();
export const withdrawOfferInput=z.object({offerId:uuid,reason:z.string().trim().min(10).max(2000),confirmed:z.literal(true)}).strict();
export const classWithdrawInput=z.object({classEnrollmentId:uuid}).strict();
export const classCancelInput=z.object({classEnrollmentId:uuid,reason:z.enum(['not_eligible','operator_decision'])}).strict();
export const offerReceipt=z.object({offerId:uuid}).strict();
export const activationReceipt=z.object({enrollmentId:uuid}).strict();
export const admissionOptionsResult=z.array(z.object({applicationId:uuid,years:z.array(z.object({id:uuid,name:z.string(),capacity:z.number().int().nonnegative()}).strict())}).strict()).max(1);
export const classExitReceipt=z.object({classEnrollmentId:uuid,status:z.enum(['withdrawn','cancelled']),releasedSeat:z.boolean(),alreadyClosed:z.boolean()}).strict();
export const admissionDocs={
 issue:obj({applicationId:id,schoolYearId:id}),
 respond:obj({offerId:id,decision:{...str,enum:['accept','decline']}}),
 activate:obj({offerId:id,sectionId:id},['offerId']),
 withdraw:obj({offerId:id,reason:{...str,minLength:10,maxLength:2000},confirmed:yes}),
 offerReceipt:obj({offerId:id}),activationReceipt:obj({enrollmentId:id}),
 options:{type:'array' as const,maxItems:1,items:obj({applicationId:id,years:{type:'array' as const,items:obj({id,name:str,capacity:{type:'integer',minimum:0}})}})},
 classWithdraw:obj({classEnrollmentId:id}),
 classCancel:obj({classEnrollmentId:id,reason:{...str,enum:['not_eligible','operator_decision']}}),
 classExitReceipt:obj({classEnrollmentId:id,status:{...str,enum:['withdrawn','cancelled']},releasedSeat:bool,alreadyClosed:bool}),
};

const credit=z.enum(['for_credit','audit','not_applicable']);
const adultCredit=z.enum(['audit','not_applicable']);
const creditDoc={...str,enum:['for_credit','audit','not_applicable']};
const adultCreditDoc={...str,enum:['audit','not_applicable']};
const nullableId={...id,nullable:true},nullableText={...str,nullable:true};
const listDoc=(items:Record<string,any>)=>({type:'array' as const,items,maxItems:100});
export const requestClassApprovalInput=z.object({classOfferingVersionId:uuid,requestId:uuid}).strict();
export const decideClassApprovalInput=z.object({approvalRequestId:uuid,decision:z.enum(['approved','rejected']),reason:z.string().trim().min(3).max(1000)}).strict();
export const classApprovalQueueInput=z.object({classId:uuid}).strict();
export const issueClassInvitationInput=z.object({classOfferingVersionId:uuid,learnerPersonId:uuid,requestId:uuid,creditMode:adultCredit}).strict();
export const declineClassInvitationInput=z.object({invitationId:uuid}).strict();
export const assignAdultInput=z.object({classId:uuid,learnerPersonId:uuid,creditMode:adultCredit}).strict();
export const classApprovalReceipt=z.object({approvalRequestId:uuid,state:z.string(),duplicate:z.boolean()}).strict();
export const classInvitationReceipt=z.object({invitationId:uuid,expiresAt:date,duplicate:z.boolean()}).strict();
export const declineInvitationReceipt=z.object({invitationId:uuid,alreadyDeclined:z.boolean()}).strict();
export const myClassApprovalsResult=z.array(z.object({approvalRequestId:uuid,classId:uuid,classOfferingVersionId:uuid,title:z.string(),state:z.string(),expiresAt:date,acceptedEnrollmentId:uuid.nullable(),consentText:z.string().nullable(),allowedCreditModes:z.array(credit)}).strict()).max(100);
export const classApprovalQueueResult=z.array(z.object({approvalRequestId:uuid,learnerPersonId:uuid,applicantPersonId:uuid,state:z.literal('pending'),requestedAt:date,expiresAt:date}).strict()).max(100);
export const myClassInvitationsResult=z.array(z.object({invitationId:uuid,classId:uuid,classOfferingVersionId:uuid,title:z.string(),creditMode:credit,consentText:z.string().nullable(),consentVersion:z.string().nullable(),state:z.string(),expiresAt:date,acceptedEnrollmentId:uuid.nullable()}).strict()).max(100);
export const classParticipationDocs={
 request:obj({classOfferingVersionId:id,requestId:id}),
 decide:obj({approvalRequestId:id,decision:{...str,enum:['approved','rejected']},reason:{...str,minLength:3,maxLength:1000}}),
 issue:obj({classOfferingVersionId:id,learnerPersonId:id,requestId:id,creditMode:adultCreditDoc}),
 decline:obj({invitationId:id}),
 assign:obj({classId:id,learnerPersonId:id,creditMode:adultCreditDoc}),
 approvalReceipt:obj({approvalRequestId:id,state:str,duplicate:bool}),
 invitationReceipt:obj({invitationId:id,expiresAt:dateDoc,duplicate:bool}),
 declineReceipt:obj({invitationId:id,alreadyDeclined:bool}),
 myApprovals:listDoc(obj({approvalRequestId:id,classId:id,classOfferingVersionId:id,title:str,state:str,expiresAt:dateDoc,acceptedEnrollmentId:nullableId,consentText:nullableText,allowedCreditModes:{type:'array',items:creditDoc}})),
 queue:listDoc(obj({approvalRequestId:id,learnerPersonId:id,applicantPersonId:id,state:{...str,enum:['pending']},requestedAt:dateDoc,expiresAt:dateDoc})),
 myInvitations:listDoc(obj({invitationId:id,classId:id,classOfferingVersionId:id,title:str,creditMode:creditDoc,consentText:nullableText,consentVersion:nullableText,state:str,expiresAt:dateDoc,acceptedEnrollmentId:nullableId})),
};

const intakePage=z.object({siteId:uuid.optional(),programId:uuid.optional(),applicationId:uuid.optional(),search:z.string().trim().max(100).optional(),pageSize:z.coerce.number().int().min(1).max(100).default(40),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const admissionsIntakeQuery=intakePage;
export const admissionsCountsQuery=intakePage.pick({siteId:true,programId:true,search:true});
export const admissionsHouseholdsQuery=z.object({programId:uuid,search:z.string().trim().min(2).max(100)}).strict();
const inquiryCommon=z.object({requestId:uuid,programId:uuid,source:z.string().trim().max(80).default('school_direct'),notes:z.string().trim().max(3000).optional()});
const existingStudent=z.object({studentProfileId:uuid,guardianPersonId:uuid,householdId:uuid.optional(),createHousehold:z.literal(true).optional()}).strict().refine(v=>Boolean(v.householdId)!==Boolean(v.createHousehold));
const name=z.string().trim().min(1).max(100);
export const admissionsInquiryInput=z.union([
 inquiryCommon.extend({existingStudent}).strict(),
 inquiryCommon.extend({existingApplicationId:uuid.optional(),publicInterestId:uuid.optional(),contactReviewed:z.literal(true).optional(),studentFirstName:name,studentLastName:name,gradeLevel:z.string().trim().max(10).optional(),guardianFirstName:name,guardianLastName:name,guardianEmail:z.string().trim().email()}).strict(),
]);
const decisions=['application','eligibility','accept','decline','withdraw','waitlist','restore'] as const;
const verificationMethods=['in_person_id','verified_school_record','live_video_verification'] as const;
export const admissionsTransitionInput=z.object({applicationId:uuid,decision:z.enum(decisions),note:z.string().trim().max(2000).optional()}).strict();
export const admissionsApplicationInput=z.object({applicationId:uuid}).strict();
export const guardianVerificationInput=z.object({applicationId:uuid,method:z.enum(verificationMethods),evidenceNote:z.string().trim().min(12).max(2000)}).strict();
export const inquiryReceipt=z.object({applicationId:uuid}).strict();
export const stageReceipt=z.object({stage:z.string()}).strict();
export const guardianVerificationReceipt=z.object({verified:z.literal(true)}).strict();
export const guardianProvisionReceipt=z.object({created:z.boolean(),email:z.string().email(),accountId:uuid,privateCredential:z.boolean(),privateAccessCode:z.string().optional()}).strict();
export const guardianInvitationReceipt=z.object({sent:z.boolean(),signInMethod:z.enum(['private_code','demo_code','email_link'])}).strict();
const nullableString=z.string().nullable(),nilId=uuid.nullable(),pageNumber=z.number().int().positive().nullable();
export const intakeProgramsResult=z.array(z.object({id:uuid,name:z.string(),siteId:nilId}).strict());
const existingStudentRow=z.object({programId:uuid,siteId:nilId,studentProfileId:uuid,studentFirstName:z.string(),studentLastName:z.string(),guardianPersonId:uuid,guardianFirstName:z.string(),guardianLastName:z.string(),householdId:nilId}).strict();
export const existingStudentsResult=z.object({items:z.array(existingStudentRow).max(100),nextPage:pageNumber}).strict();
export const admissionsCountsResult=z.array(z.object({stage:z.string(),count:z.number().int().nonnegative()}).strict());
export const admissionsHouseholdsResult=z.array(z.object({id:uuid,studentFirst:z.string(),studentLast:z.string(),programId:uuid}).strict()).max(40);
const intakeRow=z.object({id:uuid,stage:z.string(),createdAt:date,updatedAt:date,programId:uuid,submittedByPersonId:uuid,studentProfileId:uuid,organizationId:uuid,siteId:nilId,studentPersonId:uuid,programName:z.string(),studentFirst:z.string(),studentLast:z.string(),guardianVerified:z.boolean(),guardianLoginProvisioned:z.boolean(),transferOriginStatus:z.enum(['requires_review','completed','pending']).nullable(),transferNamedDestination:nullableString,destinationTranscriptConsentRecorded:z.boolean(),transferRecordsStatus:z.enum(['requires_review','available_in_can','released_externally','pending_release','not_started']).nullable(),disposition:z.enum(['waitlisted','ready_for_offer']).nullable()}).strict();
export const admissionsIntakeResult=z.object({items:z.array(intakeRow).max(100),hasMore:z.boolean(),nextPage:pageNumber}).strict();
const nameDoc={...str,minLength:1,maxLength:100},emailDoc={...str,format:'email'},pageDoc={type:'integer' as const,minimum:1,nullable:true};
const inquiryFields={requestId:id,programId:id,source:{...str,maxLength:80,default:'school_direct'},notes:{...str,maxLength:3000}};
const existingStudentDoc={oneOf:[obj({studentProfileId:id,guardianPersonId:id,householdId:id}),obj({studentProfileId:id,guardianPersonId:id,createHousehold:yes})]};
const intakeRowDoc=obj({id,stage:str,createdAt:dateDoc,updatedAt:dateDoc,programId:id,submittedByPersonId:id,studentProfileId:id,organizationId:id,siteId:nullableId,studentPersonId:id,programName:str,studentFirst:str,studentLast:str,guardianVerified:bool,guardianLoginProvisioned:bool,transferOriginStatus:{...str,enum:['requires_review','completed','pending'],nullable:true},transferNamedDestination:nullableText,destinationTranscriptConsentRecorded:bool,transferRecordsStatus:{...str,enum:['requires_review','available_in_can','released_externally','pending_release','not_started'],nullable:true},disposition:{...str,enum:['waitlisted','ready_for_offer'],nullable:true}});
export const intakeDocs={
 inquiry:{oneOf:[obj({...inquiryFields,existingStudent:existingStudentDoc},['requestId','programId','existingStudent']),obj({...inquiryFields,existingApplicationId:id,publicInterestId:id,contactReviewed:yes,studentFirstName:nameDoc,studentLastName:nameDoc,gradeLevel:{...str,maxLength:10},guardianFirstName:nameDoc,guardianLastName:nameDoc,guardianEmail:emailDoc},['requestId','programId','studentFirstName','studentLastName','guardianFirstName','guardianLastName','guardianEmail'])]},
 transition:obj({applicationId:id,decision:{...str,enum:[...decisions]},note:{...str,maxLength:2000}},['applicationId','decision']),
 application:obj({applicationId:id}),
 verification:obj({applicationId:id,method:{...str,enum:[...verificationMethods]},evidenceNote:{...str,minLength:12,maxLength:2000}}),
 inquiryReceipt:obj({applicationId:id}),stageReceipt:obj({stage:str}),verificationReceipt:obj({verified:yes}),
 provisionReceipt:obj({created:bool,email:emailDoc,accountId:id,privateCredential:bool,privateAccessCode:str},['created','email','accountId','privateCredential']),
 invitationReceipt:obj({sent:bool,signInMethod:{...str,enum:['private_code','demo_code','email_link']}}),
 programs:{type:'array' as const,items:obj({id,name:str,siteId:nullableId})},
 students:obj({items:listDoc(obj({programId:id,siteId:nullableId,studentProfileId:id,studentFirstName:str,studentLastName:str,guardianPersonId:id,guardianFirstName:str,guardianLastName:str,householdId:nullableId})),nextPage:pageDoc}),
 counts:{type:'array' as const,items:obj({stage:str,count:{type:'integer',minimum:0}})},
 households:{type:'array' as const,maxItems:40,items:obj({id,studentFirst:str,studentLast:str,programId:id})},
 intake:obj({items:listDoc(intakeRowDoc),hasMore:bool,nextPage:pageDoc}),
};

export const familyApplicationInput=z.object({requestId:uuid,programId:uuid,householdId:uuid.optional(),schoolYearId:uuid.optional(),studentProfileId:uuid.optional(),originTransferActionId:uuid.optional(),confirmedTransferDestination:z.literal(true).optional(),destinationRecordsReleaseAuthorized:z.literal(true).optional(),familyStartRequestId:uuid.optional(),studentFirstName:name,studentLastName:name,gradeLevel:z.string().trim().min(1).max(10)}).strict();
export const guardianAccessChangeInput=z.object({grantId:uuid,reason:z.string().trim().min(10).max(500)}).strict();
export const guardianRevokeReceipt=z.object({revoked:z.boolean()}).strict();
export const guardianRestoreReceipt=z.object({restored:z.boolean()}).strict();
const familyYear=z.object({id:uuid,name:z.string()}).strict();
const familyProgram=z.object({id:uuid,name:z.string(),siteId:nilId,schoolYears:z.array(familyYear)}).strict();
const familyApplication=z.object({applicationId:uuid,programId:uuid,programName:z.string(),submissionRequestId:nullableString,studentPersonId:uuid,studentFirstName:z.string(),studentLastName:z.string(),stage:z.string(),siteId:nilId,source:nullableString,schoolYearId:nullableString,schoolYearName:nullableString,guardianVerified:z.boolean(),originTransferActionId:nullableString,updatedAt:date}).strict();
const familyStudent=z.object({studentProfileId:uuid,studentPersonId:uuid,studentFirstName:z.string(),studentLastName:z.string(),gradeLevel:z.string(),householdId:uuid}).strict();
const familyTransfer=z.object({id:uuid,studentProfileId:uuid,originProgramId:nilId,originSchoolName:z.string(),destinationSchoolName:z.string(),destinationFamilyStartRequestId:nullableString,destinationFamilyStartProgramId:nullableString,originExited:z.boolean()}).strict();
export const familyWorkspaceResult=z.object({programs:z.array(familyProgram),applications:z.array(familyApplication).max(100),households:z.array(familyYear).max(100),students:z.array(familyStudent),transferRequests:z.array(familyTransfer).max(100)}).strict();
const anyList=(items:Record<string,any>)=>({type:'array' as const,items});
const familyYearDoc=obj({id,name:str});
const familyApplicationDoc=obj({applicationId:id,programId:id,programName:str,submissionRequestId:nullableText,studentPersonId:id,studentFirstName:str,studentLastName:str,stage:str,siteId:nullableId,source:nullableText,schoolYearId:nullableText,schoolYearName:nullableText,guardianVerified:bool,originTransferActionId:nullableText,updatedAt:dateDoc});
export const familyDocs={
 application:obj({requestId:id,programId:id,householdId:id,schoolYearId:id,studentProfileId:id,originTransferActionId:id,confirmedTransferDestination:yes,destinationRecordsReleaseAuthorized:yes,familyStartRequestId:id,studentFirstName:nameDoc,studentLastName:nameDoc,gradeLevel:{...str,minLength:1,maxLength:10}},['requestId','programId','studentFirstName','studentLastName','gradeLevel']),
 access:obj({grantId:id,reason:{...str,minLength:10,maxLength:500}}),
 revoked:obj({revoked:bool}),restored:obj({restored:bool}),
 workspace:obj({programs:anyList(obj({id,name:str,siteId:nullableId,schoolYears:anyList(familyYearDoc)})),applications:listDoc(familyApplicationDoc),households:listDoc(familyYearDoc),students:anyList(obj({studentProfileId:id,studentPersonId:id,studentFirstName:str,studentLastName:str,gradeLevel:str,householdId:id})),transferRequests:listDoc(obj({id,studentProfileId:id,originProgramId:nullableId,originSchoolName:str,destinationSchoolName:str,destinationFamilyStartRequestId:nullableText,destinationFamilyStartProgramId:nullableText,originExited:bool}))}),
};

export const publicInterestQuery=z.object({cursor:z.string().max(80).optional(),interestId:uuid.optional(),siteId:uuid.optional(),programId:uuid.optional()}).strict();
export const interestAssignmentInput=z.object({interestId:uuid,programId:uuid}).strict();
export const interestInvitationInput=z.object({interestId:uuid}).strict();
export const interestStatusInput=z.object({interestId:uuid,status:z.enum(['contacted','closed'])}).strict();
export const guardianOffersQuery=z.object({studentPersonId:uuid.optional()}).strict();
export const interestAssignmentReceipt=z.object({changed:z.boolean(),interestId:uuid,programId:uuid}).strict();
export const interestInvitationReceipt=z.object({requestId:uuid,created:z.boolean()}).strict();
export const interestStatusReceipt=z.object({changed:z.boolean()}).strict();
const interestNextStates=['closed','follow_up','await_admissions','invite_to_apply','await_email_verification','await_application','review_application','await_guardian_offer','activate_enrollment','assign_class','student_access','first_day_preparation','authorization_unavailable'] as const;
const interestNextOwners=['registrar','guardian','school'] as const;
const authorizationStates=['authorized','not_authorized','temporarily_unavailable'] as const;
const interestNextStep=z.object({state:z.enum(interestNextStates),owner:z.enum(interestNextOwners),message:z.string()}).strict();
const interestItem=z.object({
 id:uuid,siteId:uuid,programId:nilId,programName:nullableString,firstName:z.string(),lastName:z.string(),email:z.string(),message:z.string(),status:z.string(),source:z.string(),invitationBatchId:nilId,invitationRecipientKey:nilId,
 consentAt:date.nullable(),familyStartRequestId:nilId,emailVerifiedAt:date.nullable(),applicationLinkExpiresAt:date.nullable(),applicationStage:nullableString,studentProfileId:nilId,applicationSubmittedAt:date.nullable(),applicationId:nilId,convertedAt:date.nullable(),createdAt:date,contactedAt:date.nullable(),
 activeEnrollment:z.boolean(),placedInClass:z.boolean(),studentAccessStatus:nullableString,latestOfferStatus:nullableString,latestOfferIssuedAt:date.nullable(),latestOfferRespondedAt:date.nullable(),canSendApplicationInvitation:z.boolean(),admissionsAuthorized:z.boolean(),admissionsAuthorizationStatus:z.enum(authorizationStates),nextStep:interestNextStep,
}).strict();
export const publicInterestPageResult=z.object({items:z.array(interestItem).max(50),nextCursor:z.string().max(80).nullable()}).strict();
const offerProgressStates=['enrolled','awaiting_classes','declined','revoked','expired','not_available','application_unavailable','requirements_pending','awaiting_activation','awaiting_response'] as const;
const offerProgress=z.object({state:z.enum(offerProgressStates),message:z.string(),canAccept:z.boolean()}).strict();
const guardianOffer=z.object({id:uuid,status:z.string(),expiresAt:date.nullable(),schoolYearId:uuid,schoolYearName:z.string(),enrollmentActive:z.boolean(),sectionCount:z.number().int().nonnegative(),progress:offerProgress}).strict();
const offerBlocker=z.object({id:uuid,title:z.string(),status:z.string()}).strict();
const guardianOfferApplication=z.object({applicationId:uuid,studentPersonId:uuid,studentName:z.string(),program:z.string(),applicationStage:z.string(),waitlisted:z.boolean(),transferOriginExited:z.boolean().nullable(),blockers:z.array(offerBlocker),offers:z.array(guardianOffer).max(150)}).strict();
export const guardianOffersResult=z.array(guardianOfferApplication);
const interestNullableDate={...dateDoc,nullable:true};
const interestItemDoc=obj({
 id,siteId:id,programId:nullableId,programName:nullableText,firstName:str,lastName:str,email:str,message:str,status:str,source:str,invitationBatchId:nullableId,invitationRecipientKey:nullableId,
 consentAt:interestNullableDate,familyStartRequestId:nullableId,emailVerifiedAt:interestNullableDate,applicationLinkExpiresAt:interestNullableDate,applicationStage:nullableText,studentProfileId:nullableId,applicationSubmittedAt:interestNullableDate,applicationId:nullableId,convertedAt:interestNullableDate,createdAt:dateDoc,contactedAt:interestNullableDate,
 activeEnrollment:bool,placedInClass:bool,studentAccessStatus:nullableText,latestOfferStatus:nullableText,latestOfferIssuedAt:interestNullableDate,latestOfferRespondedAt:interestNullableDate,canSendApplicationInvitation:bool,admissionsAuthorized:bool,admissionsAuthorizationStatus:{...str,enum:[...authorizationStates]},nextStep:obj({state:{...str,enum:[...interestNextStates]},owner:{...str,enum:[...interestNextOwners]},message:str}),
});
const guardianOfferDoc=obj({id,status:str,expiresAt:interestNullableDate,schoolYearId:id,schoolYearName:str,enrollmentActive:bool,sectionCount:{type:'integer',minimum:0},progress:obj({state:{...str,enum:[...offerProgressStates]},message:str,canAccept:bool})});
export const interestDocs={
 assign:obj({interestId:id,programId:id}),invite:obj({interestId:id}),status:obj({interestId:id,status:{...str,enum:['contacted','closed']}}),
 assigned:obj({changed:bool,interestId:id,programId:id}),invited:obj({requestId:id,created:bool}),changed:obj({changed:bool}),
 page:obj({items:{type:'array' as const,maxItems:50,items:interestItemDoc},nextCursor:{...nullableText,maxLength:80}}),
 guardianOffers:anyList(obj({applicationId:id,studentPersonId:id,studentName:str,program:str,applicationStage:str,waitlisted:bool,transferOriginExited:{...bool,nullable:true},blockers:anyList(obj({id,title:str,status:str})),offers:{type:'array' as const,maxItems:150,items:guardianOfferDoc}})),
};

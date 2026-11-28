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

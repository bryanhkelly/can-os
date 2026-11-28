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

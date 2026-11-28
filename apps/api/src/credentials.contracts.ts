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

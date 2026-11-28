import {z} from 'zod';
const uuid=z.string().uuid(),str=z.string(),yes=z.literal(true),bool=z.boolean();
const types=['church_hosted_academy','high_school_extension','full_school','microschool','hybrid_program','homeschool_cohort','summer_enrichment','summer_program','after_school_enrichment'] as const;
const grade=z.object({min:str.trim().min(1).max(10),max:str.trim().min(1).max(10)}).strict();
const delivery=z.object({onsite:bool.optional(),asynchronous:bool.optional(),liveOnline:bool.optional(),onsiteDaysPerWeek:z.number().int().min(1).max(7).optional()}).strict();
export const bodies={
 start:z.object({name:str.trim().min(2).max(200),slug:str.trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),type:z.enum(types),gradeRange:grade,deliveryModel:delivery,hostOrganizationId:uuid,jurisdictionId:uuid,academicProviderOrganizationId:uuid,creditIssuingOrganizationId:uuid.optional(),creditMode:z.enum(['credit_bearing','non_credit']).optional(),siteId:uuid.optional(),targetOpeningDate:str.optional()}).strict(),
 complete:z.object({journeyRequirementId:uuid,confirmed:yes}).strict(),
 submit:z.object({journeyRequirementId:uuid,statement:str.trim().min(10).max(4000)}).strict(),
 review:z.object({journeyRequirementId:uuid,decision:z.enum(['accepted','rejected']),reason:str.trim().max(1000).default('')}).strict(),
 activate:z.object({programId:uuid,recipientPersonId:uuid.optional()}).strict(),
 orientation:z.object({programId:uuid,title:str.trim().min(2).max(160),startsAt:str.datetime({offset:true}),endsAt:str.datetime({offset:true}),timezone:str.min(3)}).strict(),
};
export const results={
 start:z.object({programId:uuid,journeyId:uuid,publicSiteDraft:z.object({siteId:uuid,slug:str,host:str,status:z.enum(['draft','published']),created:bool}).strict().nullable()}).strict(),
 complete:z.object({journeyRequirementId:uuid,journeyStatus:str}).strict(),
 submit:z.object({journeyRequirementId:uuid,submitted:yes,duplicate:bool.optional()}).strict(),
 review:z.object({journeyRequirementId:uuid,decision:z.enum(['accepted','rejected']),journeyStatus:z.enum(['ready','in_progress'])}).strict(),
 activate:z.object({programId:uuid,status:z.literal('active')}).strict(),
 orientation:z.object({eventId:uuid}).strict(),
};
const s={type:'string' as const},id={...s,format:'uuid'},b={type:'boolean' as const},dt={...s,format:'date-time'},t={...b,enum:[true]};
const en=(values:readonly string[])=>({...s,enum:[...values]});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const length=(minLength:number,maxLength:number)=>({...s,minLength,maxLength});
export const inputs={
 start:obj({name:length(2,200),slug:{...s,pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'},type:en(types),gradeRange:obj({min:length(1,10),max:length(1,10)}),deliveryModel:obj({onsite:b,asynchronous:b,liveOnline:b,onsiteDaysPerWeek:{type:'integer',minimum:1,maximum:7}},[]),hostOrganizationId:id,jurisdictionId:id,academicProviderOrganizationId:id,creditIssuingOrganizationId:id,creditMode:en(['credit_bearing','non_credit']),siteId:id,targetOpeningDate:{...s,format:'date'}},['name','slug','type','gradeRange','deliveryModel','hostOrganizationId','jurisdictionId','academicProviderOrganizationId']),
 complete:obj({journeyRequirementId:id,confirmed:t}),
 submit:obj({journeyRequirementId:id,statement:length(10,4000)}),
 review:obj({journeyRequirementId:id,decision:en(['accepted','rejected']),reason:{...s,maxLength:1000}},['journeyRequirementId','decision']),
 activate:obj({programId:id,recipientPersonId:id},['programId']),
 orientation:obj({programId:id,title:length(2,160),startsAt:dt,endsAt:dt,timezone:{...s,minLength:3}}),
};
export const docs={
 start:obj({programId:id,journeyId:id,publicSiteDraft:{...obj({siteId:id,slug:s,host:s,status:en(['draft','published']),created:b}),nullable:true}}),
 complete:obj({journeyRequirementId:id,journeyStatus:s}),
 submit:obj({journeyRequirementId:id,submitted:t,duplicate:b},['journeyRequirementId','submitted']),
 review:obj({journeyRequirementId:id,decision:en(['accepted','rejected']),journeyStatus:en(['ready','in_progress'])}),
 activate:obj({programId:id,status:en(['active'])}),
 orientation:obj({eventId:id}),
};

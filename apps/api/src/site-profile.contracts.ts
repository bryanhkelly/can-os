import {z} from 'zod';
const id=z.string().uuid(),s=z.string(),bool=z.boolean(),dt=s.datetime({offset:true}),ni=id.nullable(),text=s.nullable();
const address=z.object({street1:s.trim().min(2).max(200),street2:s.trim().max(200).optional(),city:s.trim().min(2).max(120),state:s.trim().min(2).max(80),postalCode:s.trim().min(3).max(24),country:s.trim().min(2).max(80),county:s.trim().max(120).optional()}).strict();
const contact=z.object({displayName:s.trim().min(2).max(160),email:z.union([s.trim().email().max(254),z.literal('')]),phone:s.trim().max(40)}).strict();
const org=z.object({id:ni,name:text}).strict();
const reason=s.trim().min(5).max(1000).optional();
const base={expectedRevision:dt};
const contexts=['church','microschool','homeschool','independent_school','other'] as const;
export const params=z.object({siteId:id}).strict();
export const emptyQuery=z.object({}).strict();
export const bodies={
 address:z.object({...base,address:address.nullable(),changeReason:reason}).strict(),
 contact:z.object({...base,contact:contact.nullable()}).strict(),
 identity:z.object({...base,name:s.trim().min(2).max(160),timezone:s.min(1).max(128),changeReason:reason}).strict(),
 information:z.object({...base,information:z.object({contexts:z.array(z.enum(contexts)).max(5),hostChurchName:s.max(160),currentWebsiteUrl:s.max(2048),otherContext:s.max(1000)}).strict()}).strict()
};
const receipt=z.object({siteId:id,updated:bool,revision:dt}).strict();
const source={revision:dt.nullable(),reviewStatus:z.literal('unverified'),publicClaimApproved:z.literal(false)};
const range=z.object({min:s,max:s}).strict();
const delivery=z.object({onsite:bool.optional(),asynchronous:bool.optional(),liveOnline:bool.optional(),onsiteDaysPerWeek:z.number().int().optional()}).strict();
export const results={
 receipt,addressReceipt:receipt.extend({reviewRequested:z.literal(false)}),
 profile:z.object({id,organizationId:id,name:s,slug:s,timezone:s,organization:org,revision:dt,identityRevision:dt.nullable(),updatedAt:dt,
 physicalLocation:z.object({value:address.nullable(),source:z.literal('church_site_record'),configurationStatus:z.enum(['missing','church_supplied','legacy_needs_review','invalid_needs_correction']),...source}).strict(),
 contact:z.object({value:contact.nullable(),source:z.literal('church_site_draft'),configurationStatus:z.enum(['unconfigured','church_supplied','legacy_needs_review']),...source}).strict(),
 programs:z.array(z.object({id,name:s,type:s,status:s,jurisdictionId:id,hostOrganizationId:ni,gradeRange:range,deliveryModel:delivery,academicProviderOrganizationId:id,creditIssuingOrganizationId:ni,
 proposedResponsibilities:z.object({source:z.literal('program_launch_intent'),reviewStatus:z.literal('unverified'),churchHost:org,academicProvider:org,creditIssuer:org}).strict(),
 proposedOnsiteSchedule:z.object({onsiteDaysPerWeek:z.number().int().nullable(),daysOfWeek:z.null(),reviewStatus:z.literal('unconfigured'),detail:s}).strict(),
 academicProviderApprovalStatus:z.literal('not_asserted'),jurisdictionApprovalStatus:z.literal('not_asserted'),locationReviewState:z.enum(['independent_review_required','unverified_legacy'])}).strict()),
 publication:z.object({status:s,canPublish:bool,publicReachability:z.literal('not_asserted')}).strict(),calendar:z.object({status:z.literal('read_from_academic_program_calendar')}).strict()}).strict()
};
const str={type:'string' as const},uuid={...str,format:'uuid'},date={...str,format:'date-time'},b={type:'boolean' as const},nil={...uuid,nullable:true},ns={...str,nullable:true};
const en=(values:readonly string[])=>({...str,enum:[...values]});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems===undefined?{}:{maxItems})});
const limit=(minLength:number,maxLength:number)=>({...str,minLength,maxLength});
const addressDoc=obj({street1:limit(2,200),street2:limit(0,200),city:limit(2,120),state:limit(2,80),postalCode:limit(3,24),country:limit(2,80),county:limit(0,120)},['street1','city','state','postalCode','country']);
const contactDoc=obj({displayName:limit(2,160),email:limit(0,254),phone:limit(0,40)});
const orgDoc=obj({id:nil,name:ns});
const receiptDoc=obj({siteId:uuid,updated:b,revision:date});
const sourceDoc={revision:{...date,nullable:true},reviewStatus:en(['unverified']),publicClaimApproved:{...b,enum:[false]}};
const deliveryDoc=obj({onsite:b,asynchronous:b,liveOnline:b,onsiteDaysPerWeek:{type:'integer'}},[]);
export const inputs={
 address:obj({expectedRevision:date,address:{...addressDoc,nullable:true},changeReason:limit(5,1000)},['expectedRevision','address']),
 contact:obj({expectedRevision:date,contact:{...contactDoc,nullable:true}}),
 identity:obj({expectedRevision:date,name:limit(2,160),timezone:limit(1,128),changeReason:limit(5,1000)},['expectedRevision','name','timezone']),
 information:obj({expectedRevision:date,information:obj({contexts:arr(en(contexts),5),hostChurchName:limit(0,160),currentWebsiteUrl:limit(0,2048),otherContext:limit(0,1000)})})
};
export const docs={
 receipt:receiptDoc,addressReceipt:obj({...receiptDoc.properties,reviewRequested:{...b,enum:[false]}}),
 profile:obj({id:uuid,organizationId:uuid,name:str,slug:str,timezone:str,organization:orgDoc,revision:date,identityRevision:{...date,nullable:true},updatedAt:date,
 physicalLocation:obj({value:{...addressDoc,nullable:true},source:en(['church_site_record']),configurationStatus:en(['missing','church_supplied','legacy_needs_review','invalid_needs_correction']),...sourceDoc}),
 contact:obj({value:{...contactDoc,nullable:true},source:en(['church_site_draft']),configurationStatus:en(['unconfigured','church_supplied','legacy_needs_review']),...sourceDoc}),
 programs:arr(obj({id:uuid,name:str,type:str,status:str,jurisdictionId:uuid,hostOrganizationId:nil,gradeRange:obj({min:str,max:str}),deliveryModel:deliveryDoc,academicProviderOrganizationId:uuid,creditIssuingOrganizationId:nil,proposedResponsibilities:obj({source:en(['program_launch_intent']),reviewStatus:en(['unverified']),churchHost:orgDoc,academicProvider:orgDoc,creditIssuer:orgDoc}),proposedOnsiteSchedule:obj({onsiteDaysPerWeek:{type:'integer',nullable:true},daysOfWeek:{type:'string',nullable:true,enum:[null]},reviewStatus:en(['unconfigured']),detail:str}),academicProviderApprovalStatus:en(['not_asserted']),jurisdictionApprovalStatus:en(['not_asserted']),locationReviewState:en(['independent_review_required','unverified_legacy'])})),
 publication:obj({status:str,canPublish:b,publicReachability:en(['not_asserted'])}),calendar:obj({status:en(['read_from_academic_program_calendar'])})})
};

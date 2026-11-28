import {z} from 'zod';
const uuid=z.string().uuid(),str=z.string(),bool=z.boolean(),pos=z.number().int().positive(),yes=z.literal(true);
const mode=z.enum(['self_paced','scheduled','facilitated','hybrid']);
const visibility=z.enum(['public','unlisted','private']);
const method=z.enum(['self','invitation','assignment','approval']);
const uuidOrNull=uuid.nullable();
export const draftQuery=z.object({siteId:uuid.optional()}).strict();
export const optionsQuery=z.object({search:z.string().max(100).optional(),cursor:z.string().regex(/^\d{1,6}$/).transform(Number).pipe(z.number().max(100000)).optional(),offeringVersionId:uuid.optional(),courseVersionIds:z.union([uuid,z.array(uuid).min(1).max(50)]).transform(v=>typeof v==='string'?[v]:v).optional(),siteId:uuid.optional()}).strict();
export const emptyQuery=z.object({}).strict();
export const results={
 create:z.object({classId:uuid,classOfferingId:uuidOrNull,classOfferingVersionId:uuidOrNull,status:z.literal('draft')}).strict(),
 activate:z.object({classId:uuid,alreadyActive:bool}).strict(),
 publish:z.object({classId:uuid,classOfferingVersionId:uuid,state:z.literal('published'),alreadyPublished:bool}).strict(),
 close:z.object({closed:yes}).strict(),
 next:z.object({classOfferingVersionId:uuid,versionNo:pos}).strict(),
 drafts:z.array(z.object({classId:uuid,title:str,capacity:pos.nullable(),courseVersionId:uuid,offeringVersionId:uuid,deploymentId:uuid,siteId:uuidOrNull,deliveryMode:mode,state:str,classOfferingId:uuidOrNull,classOfferingVersionId:uuidOrNull,versionNo:pos.nullable(),visibility:visibility.nullable(),enrollmentMethods:z.array(method).nullable(),offeringState:str.nullable()}).strict()).max(100),
 sites:z.array(z.object({id:uuid,name:str,timeZone:str.nullable()}).strict()),
 options:z.object({items:z.array(z.object({deploymentId:uuid,deploymentName:str,adoptionId:uuid,offeringId:uuid,offeringTitle:str,offeringPublisherOrganizationId:uuid,offeringVersionId:uuid,offeringVersionNo:pos,courseId:uuid,courseVersionId:uuid,courseVersionNo:pos,courseCode:str,courseTitle:str,isRequired:bool,sequenceNo:z.number().int().nonnegative(),offeringKind:z.enum(['course','program','other']),localClassPolicy:z.object({version:z.literal(1),classTitle:z.enum(['local','locked']),allowedDeliveryModes:z.array(mode).min(1).max(4),maxClassCapacity:pos.nullable()}).strict(),operatingOrganizationId:uuid,siteOptions:z.array(z.object({id:uuid,name:str,allowedDeliveryModes:z.array(mode).min(1).max(4)}).strict())}).strict()).max(50),nextCursor:z.number().int().nonnegative().nullable()}).strict(),
};
const s={type:'string' as const},id={...s,format:'uuid'},b={type:'boolean' as const},n={type:'integer' as const,minimum:1},nil={...id,nullable:true},d={...s,format:'date-time',nullable:true};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems?:number,minItems?:number)=>({type:'array' as const,items,...(maxItems?{maxItems}:{}),...(minItems?{minItems}:{})});
const en=(values:readonly string[])=>({...s,enum:[...values]});
const modes=en(mode.options),vis=en(visibility.options),methods=arr(en(method.options),4,1);
const def=obj({deploymentId:id,adoptionId:id,offeringVersionId:id,courseVersionId:id,operatingOrganizationId:id,siteId:nil,title:{...s,minLength:3,maxLength:200},capacity:{...n,nullable:true},deliveryMode:modes},['deploymentId','adoptionId','offeringVersionId','courseVersionId','operatingOrganizationId','siteId','title','deliveryMode']);
const terms=obj({visibility:vis,enrollmentMethods:{...methods,uniqueItems:true},opensAt:d,closesAt:d,capacity:{...n,nullable:true},allowedCreditModes:{...arr(en(['for_credit','audit','not_applicable']),3,1),uniqueItems:true},consentVersion:{...s,minLength:3,maxLength:80,nullable:true},consentText:{...s,minLength:25,maxLength:10000,nullable:true}});
export const inputs={create:obj({definition:def,terms:{...terms,nullable:true}},['definition']),activate:obj({classId:id}),manage:obj({classId:id,classOfferingVersionId:id}),next:obj({classId:id,terms})};
export const docs={
 create:obj({classId:id,classOfferingId:nil,classOfferingVersionId:nil,status:en(['draft'])}),
 activate:obj({classId:id,alreadyActive:b}),
 publish:obj({classId:id,classOfferingVersionId:id,state:en(['published']),alreadyPublished:b}),
 close:obj({closed:{...b,enum:[true]}}),
 next:obj({classOfferingVersionId:id,versionNo:n}),
 drafts:arr(obj({classId:id,title:s,capacity:{...n,nullable:true},courseVersionId:id,offeringVersionId:id,deploymentId:id,siteId:nil,deliveryMode:modes,state:s,classOfferingId:nil,classOfferingVersionId:nil,versionNo:{...n,nullable:true},visibility:{...vis,nullable:true},enrollmentMethods:{...methods,nullable:true},offeringState:{...s,nullable:true}}),100),
 sites:arr(obj({id,name:s,timeZone:{...s,nullable:true}})),
 options:obj({items:arr(obj({deploymentId:id,deploymentName:s,adoptionId:id,offeringId:id,offeringTitle:s,offeringPublisherOrganizationId:id,offeringVersionId:id,offeringVersionNo:n,courseId:id,courseVersionId:id,courseVersionNo:n,courseCode:s,courseTitle:s,isRequired:b,sequenceNo:{...n,minimum:0},offeringKind:en(['course','program','other']),localClassPolicy:obj({version:{...n,enum:[1]},classTitle:en(['local','locked']),allowedDeliveryModes:arr(modes,4,1),maxClassCapacity:{...n,nullable:true}}),operatingOrganizationId:id,siteOptions:arr(obj({id,name:s,allowedDeliveryModes:arr(modes,4,1)}))}),50),nextCursor:{...n,minimum:0,nullable:true}})
};

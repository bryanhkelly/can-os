import {z} from 'zod';
const uuid=z.string().uuid();
const configResult=z.object({configurationId:uuid,versionId:uuid,revision:z.number().int().positive(),lifecycle:z.enum(['draft','frozen'])}).strict();
export const results={
 configuration:configResult,
 reviewResult:z.object({reviewId:uuid,configurationVersionId:uuid,decision:z.enum(['approved','conditional','rejected']),created:z.boolean()}).strict(),
 execution:z.object({executionBatchId:uuid,deploymentIds:z.array(uuid),created:z.boolean()}).strict(),
 readinessResult:z.object({reviewId:uuid,deploymentId:uuid,created:z.boolean()}).strict(),
 placementResult:z.object({deploymentId:uuid,siteId:uuid,placementId:uuid,created:z.boolean()}).strict(),
 adoptionResult:z.object({adoptionId:uuid,approvalStatus:z.literal('approved'),deploymentStatusUnchanged:z.string()}).strict(),
};
// Canonical domain Zod schemas validate input once in the shared service;
// this describes the wire schema, with domain refinements documented.
const str={type:'string' as const},id={...str,format:'uuid'},bool={type:'boolean' as const},integer={type:'integer' as const,minimum:1};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems?{maxItems}:{})});
const en=(values:string[])=>({...str,enum:values});
const text=(minLength:number,maxLength:number)=>({...str,minLength,maxLength});
const nullableId={...id,nullable:true};
const json={type:'object' as const,additionalProperties:true};
const version=obj({config:json,identity:obj({religiousAffiliationCode:{...text(1,96),nullable:true},editorialIdentity:en(['community_belonging','academic_excellence','innovation_discovery','classical_humanities','creative_expression','leadership_service']),culturalContext:json},['religiousAffiliationCode','editorialIdentity']),
 components:arr(obj({componentId:id,selectionStatus:en(['selected','excluded','proposed']),referenceItemVersionIds:arr(id),settings:json},['componentId','selectionStatus']),200),
 offeringAdoptions:arr(obj({componentId:id,offeringVersionId:id,configuration:json},['componentId','offeringVersionId']),200),
 localExperiences:arr(obj({source:en(['proposed_local_experience']),componentId:id,kind:en(['community','experience','club','activity']),title:text(2,160),summary:{...str,maxLength:4000},configuration:json},['source','componentId','kind','title']),200)},['identity']);
export const inputs={
 create:obj({configurationId:id,initialVersionId:id,blueprintId:id,blueprintVersionId:id,owningOrganizationId:id,name:text(2,120),version}),
 save:obj({configurationId:id,versionId:id,expectedRevision:integer,version}),
 submit:obj({configurationId:id,expectedRevision:integer}),
 review:obj({reviewId:id,configurationVersionId:id,decision:en(['approved','conditional','rejected']),evidenceVersionId:nullableId,rationale:text(8,4000),components:arr(obj({componentId:id,decision:en(['approved','conditional','denied']),evidenceVersionId:nullableId,conditions:{...str,maxLength:2000,nullable:true}},['componentId','decision']),200)},['reviewId','configurationVersionId','decision','rationale']),
 execute:obj({configurationVersionId:id,reviewId:id,operationId:id,idempotencyKey:text(8,200)}),
 readiness:obj({deploymentId:id,reviewId:id,reviewKind:en(['operating','registration','delivery']),outcome:en(['ready','ready_with_conditions','not_ready']),evidenceVersionId:id,expiresAt:{...str,format:'date-time'},supersedesId:nullableId}),
 placement:obj({deploymentId:id,siteId:id}),
 adoption:obj({adoptionId:id,evidenceVersionId:id,rationale:text(10,2000)}),
};
export const outputDocs={
 configuration:obj({configurationId:id,versionId:id,revision:integer,lifecycle:en(['draft','frozen'])}),
 reviewResult:obj({reviewId:id,configurationVersionId:id,decision:en(['approved','conditional','rejected']),created:bool}),
 execution:obj({executionBatchId:id,deploymentIds:arr(id),created:bool}),
 readinessResult:obj({reviewId:id,deploymentId:id,created:bool}),
 placementResult:obj({deploymentId:id,siteId:id,placementId:id,created:bool}),
 adoptionResult:obj({adoptionId:id,approvalStatus:en(['approved']),deploymentStatusUnchanged:str}),
};

const jsonValue:z.ZodType<unknown>=z.lazy(()=>z.union([z.null(),z.boolean(),z.string(),z.number().finite(),z.array(jsonValue),z.record(jsonValue)]));
const jsonObject=z.record(jsonValue);
const timestamp=z.string().datetime({offset:true});
const decision=z.enum(['approved','conditional','rejected']);
const decisionFields={id:uuid,decision,reviewerPersonId:uuid,decidedAt:timestamp};
export const configParams=z.object({configurationId:uuid}).strict();
export const versionParams=z.object({configurationVersionId:uuid}).strict();
export const historyQuery=z.object({page:z.string().regex(/^(?:0|[1-9][0-9]{0,2})$/).transform(Number).pipe(z.number().max(100)).optional()}).strict();
export const readResults={
 configuration:configResult.extend({blueprintId:uuid,blueprintVersionId:uuid,name:z.string(),config:jsonObject,identity:z.object({religiousAffiliationCode:z.string().nullable(),editorialIdentity:z.string(),culturalContext:jsonObject}).strict(),
 components:z.array(z.object({componentId:uuid,selectionStatus:z.string(),settings:jsonObject,referenceItemVersionIds:z.array(uuid)}).strict()),
 offeringAdoptions:z.array(z.object({componentId:uuid,offeringVersionId:uuid,configuration:jsonObject}).strict()),
 localExperiences:z.array(z.object({componentId:uuid,kind:z.string(),title:z.string(),summary:z.string(),configuration:jsonObject}).strict())}).strict(),
 review:z.object({configurationVersionId:uuid,lifecycle:z.string(),latestReview:z.object(decisionFields).strict().nullable(),components:z.array(z.object({componentId:uuid,decision:z.string()}).strict())}).strict(),
 history:z.object({configurationVersionId:uuid,page:z.number().int().min(0).max(100),hasMore:z.boolean(),items:z.array(z.object({...decisionFields,evidenceVersionId:uuid.nullable(),rationale:z.string().nullable()}).strict()).max(20)}).strict(),
};
const decided={id,decision:en(['approved','conditional','rejected']),reviewerPersonId:id,decidedAt:{...str,format:'date-time'}};
export const readDocs={
 configuration:obj({...outputDocs.configuration.properties,blueprintId:id,blueprintVersionId:id,name:str,config:json,identity:obj({religiousAffiliationCode:{...str,nullable:true},editorialIdentity:str,culturalContext:json}),components:arr(obj({componentId:id,selectionStatus:str,settings:json,referenceItemVersionIds:arr(id)})),offeringAdoptions:arr(obj({componentId:id,offeringVersionId:id,configuration:json})),localExperiences:arr(obj({componentId:id,kind:str,title:str,summary:str,configuration:json}))}),
 review:obj({configurationVersionId:id,lifecycle:str,latestReview:{...obj(decided),nullable:true},components:arr(obj({componentId:id,decision:str}))}),
 history:obj({configurationVersionId:id,page:{type:'integer',minimum:0,maximum:100},hasMore:bool,items:arr(obj({...decided,evidenceVersionId:nullableId,rationale:{...str,nullable:true}}),20)})
};

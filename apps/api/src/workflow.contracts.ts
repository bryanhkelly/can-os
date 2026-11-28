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

import {z} from 'zod';
const uuid=z.string().uuid();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const reviewKind=z.enum(['academic','rights','accessibility','coverage','safety']);
const decision=z.enum(['approved','rejected']);
const use=z.enum(['required_instruction','supporting','accessibility','assessment']);
const policy=z.object({courseVersionId:uuid,minimumApprovedPrimaryTracks:z.number().int().min(0).max(10),completeLessonCoverageRequired:z.boolean(),independentAcademicReviewRequired:z.literal(true),rightsClearanceRequired:z.literal(true),accessibilityReviewRequired:z.literal(true)}).strict();
export const versionParams=z.object({offeringVersionId:uuid}).strict();
export const submitBody=z.object({expectedHash:hash,assets:z.array(z.object({assetVersionId:uuid,usageKind:use}).strict()).max(50).default([])}).strict();
export const policyBody=z.object({expectedManuscriptHash:hash,expectedPolicyRevision:hash,requirements:z.array(policy).min(1).max(50),reviewEvidenceVersionId:uuid,rationale:z.string().trim().min(10).max(2000)}).strict();
export const decisionBody=z.object({manifestId:uuid,expectedHash:hash,reviewKind,decision,evidenceVersionId:uuid.nullable(),rationale:z.string().trim().min(10).max(2000)}).strict();
export const publishBody=z.object({manifestId:uuid,expectedHash:hash}).strict();
// Initial HTTP create contract is deliberately limited to core Site identity and planning location.
// Existing UI retains full address and launch-preferences support until their wire contracts are reviewed.
export const siteBody=z.object({organizationId:uuid,name:z.string().trim().min(2).max(160),slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),timezone:z.string().trim().min(3).max(80),siteKind:z.enum(['physical','virtual','mobile']).optional(),stubOnly:z.boolean().optional(),planningLocation:z.object({city:z.string().trim().min(1).max(120),state:z.string().trim().min(2).max(2)}).strict().optional()}).strict();
export const siteResult=z.object({siteId:uuid,publicSiteDraft:z.object({slug:z.string(),host:z.string(),status:z.enum(['draft','published']),created:z.boolean().optional()}).strict().nullable(),replayed:z.boolean()}).strict();
export const submitResult=z.object({manifestId:uuid,manifestHash:hash,created:z.boolean()}).strict();
export const policyResult=z.object({offeringVersionId:uuid,policyRevision:hash,changed:z.boolean()}).strict();
export const decisionResult=z.object({manifestId:uuid,reviewKind,decision}).strict();
export const coursesResult=z.object({manifestId:uuid,publishedCourseVersionIds:z.array(uuid)}).strict();
export const approveResult=z.object({manifestId:uuid,alreadyApproved:z.boolean()}).strict();
export const publishResult=z.object({offeringVersionId:uuid,alreadyPublished:z.boolean()}).strict();
const id={type:'string' as const,format:'uuid'};
const digest={type:'string' as const,pattern:'^[a-f0-9]{64}$'};
const string={type:'string' as const};const bool={type:'boolean' as const};
const choice=(values:readonly string[])=>({...string,enum:[...values]});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems===undefined?{}:{maxItems})});
const rationale={...string,minLength:10,maxLength:2000};
const published={manifestId:id,expectedHash:digest};
const policyDoc=obj({courseVersionId:id,minimumApprovedPrimaryTracks:{type:'integer',minimum:0,maximum:10},completeLessonCoverageRequired:bool,independentAcademicReviewRequired:{...bool,enum:[true]},rightsClearanceRequired:{...bool,enum:[true]},accessibilityReviewRequired:{...bool,enum:[true]}});
export const docs={
  site:obj({organizationId:id,name:{...string,minLength:2,maxLength:160},slug:{...string,pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'},timezone:{...string,minLength:3,maxLength:80},siteKind:choice(['physical','virtual','mobile']),stubOnly:bool,planningLocation:obj({city:{...string,minLength:1,maxLength:120},state:{...string,minLength:2,maxLength:2}})},['organizationId','name','slug','timezone']),
  siteResult:obj({siteId:id,publicSiteDraft:{...obj({slug:string,host:string,status:choice(['draft','published']),created:bool},['slug','host','status']),nullable:true},replayed:bool}),
  submit:obj({expectedHash:digest,assets:arr(obj({assetVersionId:id,usageKind:choice(use.options)}),50)},['expectedHash']),
  policy:obj({expectedManuscriptHash:digest,expectedPolicyRevision:digest,requirements:{...arr(policyDoc,50),minItems:1},reviewEvidenceVersionId:id,rationale}),
  decision:obj({...published,reviewKind:choice(reviewKind.options),decision:choice(decision.options),evidenceVersionId:{...id,nullable:true},rationale}),
  publish:obj(published),
  submitResult:obj({manifestId:id,manifestHash:digest,created:bool}),
  policyResult:obj({offeringVersionId:id,policyRevision:digest,changed:bool}),
  decisionResult:obj({manifestId:id,reviewKind:choice(reviewKind.options),decision:choice(decision.options)}),
  coursesResult:obj({manifestId:id,publishedCourseVersionIds:arr(id)}),
  approveResult:obj({manifestId:id,alreadyApproved:bool}),
  publishResult:obj({offeringVersionId:id,alreadyPublished:bool}),
};

const policyRead=policy.extend({independentAcademicReviewRequired:z.boolean(),rightsClearanceRequired:z.boolean(),accessibilityReviewRequired:z.boolean()}).strict();
const count=z.number().int().nonnegative();
const cursor=z.object({createdAt:z.string().datetime({offset:true}),id:uuid}).strict();
export const queueQuery=z.object({createdAt:z.string().datetime({offset:true}).optional(),id:uuid.optional()}).strict().refine(v=>Boolean(v.createdAt)===Boolean(v.id),'Supply both cursor fields');
export const releaseOverviewResult=z.object({
 offeringVersionId:uuid,offeringTitle:z.string(),lifecycle:z.string(),courseCount:count,lessonCount:count,allCoursesPublished:z.boolean(),manuscriptHash:hash,
 policies:z.array(policyRead).max(51),releasePoliciesComplete:z.boolean(),
 availableAssets:z.array(z.object({id:uuid,title:z.string(),kind:z.string(),sha256:hash.nullable()}).strict()).max(100),assetsLimited:z.boolean(),
 manifest:z.object({id:uuid,hash,status:z.string(),assetCount:count,assetUses:z.array(z.object({assetVersionId:uuid,usageKind:use}).strict()).max(50),current:z.boolean()}).strict().nullable()
}).strict();
export const releasePolicyResult=z.object({offeringVersionId:uuid,offeringTitle:z.string(),lifecycle:z.string(),manuscriptHash:hash,revision:hash,courses:z.array(z.object({courseVersionId:uuid,courseTitle:z.string(),isRequired:z.boolean()}).strict()),policies:z.array(policyRead).max(51)}).strict();
const reviewStatus=z.enum(['approved','rejected','not_reviewed']);
export const releaseQueueResult=z.object({items:z.array(z.object({id:uuid,offeringVersionId:uuid,offeringTitle:z.string(),manifestHash:hash,status:z.string(),current:z.boolean(),assetCount:count,releasePoliciesComplete:z.boolean(),courseCount:count,allCoursesPublished:z.boolean(),offeringPublished:z.boolean(),reviews:z.array(z.object({kind:reviewKind,decision:reviewStatus}).strict())}).strict()).max(60),nextCursor:cursor.nullable()}).strict();
const countDoc={type:'integer' as const,minimum:0};
const policyReadDoc=obj({...policyDoc.properties,independentAcademicReviewRequired:bool,rightsClearanceRequired:bool,accessibilityReviewRequired:bool});
const courseDoc=obj({courseVersionId:id,courseTitle:string,isRequired:bool});
const versionFields={offeringVersionId:id,offeringTitle:string,lifecycle:string,manuscriptHash:digest};
export const releaseReadDocs={
 overview:obj({...versionFields,courseCount:countDoc,lessonCount:countDoc,allCoursesPublished:bool,policies:arr(policyReadDoc,51),releasePoliciesComplete:bool,availableAssets:arr(obj({id,title:string,kind:string,sha256:{...digest,nullable:true}}),100),assetsLimited:bool,
 manifest:{...obj({id,hash:digest,status:string,assetCount:countDoc,assetUses:arr(obj({assetVersionId:id,usageKind:choice(use.options)}),50),current:bool}),nullable:true}}),
 policy:obj({...versionFields,revision:digest,courses:arr(courseDoc),policies:arr(policyReadDoc,51)}),
 queue:obj({items:arr(obj({id,offeringVersionId:id,offeringTitle:string,manifestHash:digest,status:string,current:bool,assetCount:countDoc,releasePoliciesComplete:bool,courseCount:countDoc,allCoursesPublished:bool,offeringPublished:bool,reviews:arr(obj({kind:choice(reviewKind.options),decision:choice(reviewStatus.options)}))}),60),
 nextCursor:{...obj({createdAt:{type:'string',format:'date-time'},id}),nullable:true}}),
};

/** Reviewer-only exact manuscript JSON, including existing extensible content
 * specs. Nested official assignment/policy data is normalized to JSON; the
 * outer response and manuscript unit/lesson identity remain explicit. */
const jsonValue:z.ZodType<unknown>=z.lazy(()=>z.union([z.null(),z.boolean(),z.string(),z.number().finite(),z.array(jsonValue),z.record(jsonValue)]));
const jsonObject=z.record(jsonValue);
const unit=z.object({id:uuid,title:z.string(),sequenceNo:count,content:jsonValue,lessons:z.array(z.object({id:uuid,lessonKey:z.string(),title:z.string(),lessonOrder:count,content:jsonValue}).strict()).max(2000)}).strict();
const manuscriptCourse=z.object({courseVersionId:uuid,courseTitle:z.string(),courseCode:z.string(),isRequired:z.boolean(),syllabus:jsonValue,assignments:z.array(jsonObject).max(2000),deliveryAssignments:z.array(jsonObject).max(2000),gradingPolicies:z.array(jsonObject).max(500),units:z.array(unit).max(1000)}).strict();
export const exactReviewQuery=z.object({manifestId:uuid,expectedHash:hash}).strict();
export const exactReviewResult=z.object({offeringTitle:z.string(),offeringVersionId:uuid,reviewedManifestHash:hash,manuscriptHash:hash,policyRevision:hash,policies:z.array(policyRead).max(51),assetItems:z.array(z.object({assetVersionId:uuid,usageKind:use,contentHash:hash,rightsEvidenceVersionId:uuid.nullable()}).strict()).max(50),productDefinition:jsonValue,courseCount:count,lessonCount:count,courses:z.array(manuscriptCourse).max(50)}).strict();
const jsonDoc={type:'object' as const,additionalProperties:true};
const unitDoc=obj({id,title:string,sequenceNo:countDoc,content:jsonDoc,lessons:arr(obj({id,lessonKey:string,title:string,lessonOrder:countDoc,content:jsonDoc}),2000)});
export const exactReviewDoc=obj({offeringTitle:string,offeringVersionId:id,reviewedManifestHash:digest,manuscriptHash:digest,policyRevision:digest,policies:arr(policyReadDoc,51),assetItems:arr(obj({assetVersionId:id,usageKind:choice(use.options),contentHash:digest,rightsEvidenceVersionId:{...id,nullable:true}}),50),productDefinition:jsonDoc,courseCount:countDoc,lessonCount:countDoc,courses:arr(obj({courseVersionId:id,courseTitle:string,courseCode:string,isRequired:bool,syllabus:jsonDoc,assignments:arr(jsonDoc,2000),deliveryAssignments:arr(jsonDoc,2000),gradingPolicies:arr(jsonDoc,500),units:arr(unitDoc,1000)}),50)});

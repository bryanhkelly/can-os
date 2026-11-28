import {z} from 'zod';
const uuid=z.string().uuid(),s=z.string(),hash=s.regex(/^[a-f0-9]{64}$/),n=z.number().int().nonnegative();
const kind=z.enum(['primary','supplemental']),materialKind=z.enum(['instruction','practice','reference']),presentationKind=z.enum(['primary','worked_example','supplement','alternate_language']),reviewKind=z.enum(['academic','rights','accessibility','coverage','safeguarding']),decision=z.enum(['approved','changes_requested','rejected']),withdrawalKind=z.enum(['routine_retirement','urgent_rights','urgent_safety']);
type Json=null|string|number|boolean|Json[]|{[key:string]:Json};
const json:z.ZodType<Json>=z.lazy(()=>z.union([z.null(),s,z.number().finite(),z.boolean(),z.array(json),z.record(s,json)]));
function publicFields(value:Json):boolean{
 if(Array.isArray(value))return value.every(publicFields);
 if(value!==null&&typeof value==='object')return Object.entries(value).every(([key,nested])=>!['answer','answerkey','correctanswer','solution','solutions'].includes(key.toLowerCase().replace(/[_-]/g,''))&&publicFields(nested));
 return true;
}
const publicObject=z.record(s,json).refine(publicFields);
const material=z.object({courseUnitId:uuid,assetVersionId:uuid.nullable(),materialKind,activitySpec:publicObject}).strict();
const presentation=z.object({courseLessonId:uuid,assetVersionId:uuid,presentationKind,ordinal:n.min(1).max(10000),accessibilityNotes:publicObject}).strict();
const release=z.object({requestId:uuid,expectedRevision:hash}).strict();
export const params={course:z.object({courseVersionId:uuid}).strict(),track:z.object({trackVersionId:uuid}).strict()};
export const inputs={empty:z.object({}).strict(),create:z.object({requestId:uuid,trackId:uuid.optional(),title:s.trim().min(1).max(250),trackKind:kind.optional()}).strict(),save:release.extend({materials:z.array(material).max(2000),presentations:z.array(presentation.extend({accessibilityNotes:publicObject.optional()}).strict()).max(4000)}).strict(),release,review:release.extend({reviewKind,decision,rationale:s.trim().min(10).max(2000),evidenceVersionId:uuid.nullable().optional()}).strict(),withdraw:z.object({requestId:uuid,withdrawalKind,reason:s.trim().min(10).max(2000),legacyAccessUntil:s.datetime().nullable()}).strict()};
const revision=z.object({trackVersionId:uuid,revision:hash}).strict();
export const results={created:revision.extend({trackId:uuid}).strict(),saved:revision,submitted:z.object({trackVersionId:uuid,manifestId:uuid,manifestHash:hash}).strict(),reviewed:z.object({trackVersionId:uuid,manifestHash:hash,reviewKind,decision}).strict(),published:z.object({trackVersionId:uuid,manifestHash:hash,lifecycle:z.literal('published')}).strict(),withdrawn:revision.extend({withdrawalKind,effectiveAt:s.datetime(),legacyAccessUntil:s.datetime().nullable()}).strict(),draft:revision.extend({trackTitle:s,courseTitle:s,courseVersionId:uuid,trackKind:kind,lessons:z.array(z.object({id:uuid,title:s,courseUnitId:uuid,lessonOrder:n}).strict()),presentations:z.array(presentation),materials:z.array(material),assets:z.array(z.object({id:uuid,title:s,kind:s,versionNo:n.min(1)}).strict()).max(250),boundAssets:z.array(z.object({id:uuid,title:s,lifecycle:z.enum(['draft','published'])}).strict()),assetInventoryLimited:z.boolean()}).strict()};
const str={type:'string' as const},id={...str,format:'uuid'},h={...str,pattern:'^[a-f0-9]{64}$'},int={type:'integer' as const,minimum:0},bool={type:'boolean' as const},date={...str,format:'date-time'};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,properties,required,additionalProperties:false});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems?{maxItems}:{})});
const en=(values:readonly string[])=>({...str,enum:[...values]});
const text=(minLength:number,maxLength:number)=>({...str,minLength,maxLength});
const nullable=<T extends Record<string,any>>(schema:T)=>({...schema,nullable:true});
const jsonDoc={type:'object' as const,additionalProperties:true,description:'Public instructional metadata only; private answer/solution keys forbidden recursively.'};
const materialDoc=obj({courseUnitId:id,assetVersionId:nullable(id),materialKind:en(materialKind.options),activitySpec:jsonDoc});
const presentationProps={courseLessonId:id,assetVersionId:id,presentationKind:en(presentationKind.options),ordinal:{...int,minimum:1,maximum:10000},accessibilityNotes:jsonDoc};
const releaseProps={requestId:id,expectedRevision:h};
export const inputDocs={create:obj({requestId:id,trackId:id,title:text(1,250),trackKind:{...en(kind.options),default:'primary'}},['requestId','title']),save:obj({...releaseProps,materials:arr(materialDoc,2000),presentations:arr(obj(presentationProps,['courseLessonId','assetVersionId','presentationKind','ordinal']),4000)}),release:obj(releaseProps),review:obj({...releaseProps,reviewKind:en(reviewKind.options),decision:en(decision.options),rationale:text(10,2000),evidenceVersionId:nullable(id)},['requestId','expectedRevision','reviewKind','decision','rationale']),withdraw:obj({requestId:id,withdrawalKind:en(withdrawalKind.options),reason:text(10,2000),legacyAccessUntil:nullable(date)})};
const rev={trackVersionId:id,revision:h};
export const docs={created:obj({...rev,trackId:id}),saved:obj(rev),submitted:obj({trackVersionId:id,manifestId:id,manifestHash:h}),reviewed:obj({trackVersionId:id,manifestHash:h,reviewKind:en(reviewKind.options),decision:en(decision.options)}),published:obj({trackVersionId:id,manifestHash:h,lifecycle:en(['published'])}),withdrawn:obj({...rev,withdrawalKind:en(withdrawalKind.options),effectiveAt:date,legacyAccessUntil:nullable(date)}),draft:obj({...rev,trackTitle:str,courseTitle:str,courseVersionId:id,trackKind:en(kind.options),lessons:arr(obj({id,title:str,courseUnitId:id,lessonOrder:int})),presentations:arr(obj(presentationProps)),materials:arr(materialDoc),assets:arr(obj({id,title:str,kind:str,versionNo:{...int,minimum:1}}),250),boundAssets:arr(obj({id,title:str,lifecycle:en(['draft','published'])})),assetInventoryLimited:bool})};

const usage=z.enum(['required_instruction','supporting','accessibility','assessment']);
const reviewDecision=z.enum(['approved','changes_requested','rejected','withdrawn']);
export const reviewSnapshot=z.object({trackVersionId:uuid,courseVersionId:uuid,trackTitle:s,trackKind:kind,courseTitle:s,
 manifestId:uuid,manifestHash:hash,manifestStatus:z.enum(['draft','approved']),lifecycle:z.enum(['draft','published']),
 items:z.array(z.object({assetVersionId:uuid,usageKind:usage,contentHash:hash,rightsEvidenceVersionId:uuid.nullable()}).strict()),
 lessons:z.array(z.object({id:uuid,title:s}).strict()),
 presentations:z.array(z.object({courseLessonId:uuid,assetVersionId:uuid,presentationKind,ordinal:n.min(1)}).strict()),
 reviews:z.array(z.object({reviewKind,decision:reviewDecision.nullable(),rationale:s.nullable(),evidenceVersionId:uuid.nullable(),decidedAt:s.datetime().nullable()}).strict()).length(5),
 publicationAuthorityVerified:z.literal(false)}).strict();
export const reviewSnapshotDoc=obj({trackVersionId:id,courseVersionId:id,trackTitle:str,trackKind:en(kind.options),courseTitle:str,
 manifestId:id,manifestHash:h,manifestStatus:en(['draft','approved']),lifecycle:en(['draft','published']),
 items:arr(obj({assetVersionId:id,usageKind:en(usage.options),contentHash:h,rightsEvidenceVersionId:nullable(id)})),
 lessons:arr(obj({id,title:str})),presentations:arr(obj({courseLessonId:id,assetVersionId:id,presentationKind:en(presentationKind.options),ordinal:{...int,minimum:1}})),
 reviews:{...arr(obj({reviewKind:en(reviewKind.options),decision:nullable(en(reviewDecision.options)),rationale:nullable(str),evidenceVersionId:nullable(id),decidedAt:nullable(date)}),5),minItems:5},
 publicationAuthorityVerified:{...bool,enum:[false]}});

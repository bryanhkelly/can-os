import { z } from 'zod';

const uuid=z.string().uuid(), str=z.string(), integer=z.number().int(), iso=z.string().datetime();
const nullableId=uuid.nullable(), nullableText=str.nullable(), revision=integer.min(1);
export const attemptParams=z.object({courseAttemptId:uuid}).strict();
export const noQuery=z.object({}).strict();
export const historyQuery=z.object({beforeId:uuid.optional()}).strict();
export const input={
 select:z.object({requestId:uuid,trackVersionId:uuid,expectedRevision:integer.min(0),switchReason:str.trim().min(1).max(500).nullable().optional()}).strict(),
 download:z.object({assetVersionId:uuid}).strict(),
 complete:z.object({requestId:uuid,lessonId:uuid,expectedRevision:revision}).strict(),
 practice:z.object({requestId:uuid,courseVersionId:uuid,trackVersionId:uuid,materialId:uuid,expectedRevision:revision,responses:z.array(z.object({promptKey:str.trim().min(1).max(100),response:str.max(20000)}).strict()).max(100)}).strict(),
};
type Attempt={courseAttemptId:string};
export type InstructionalOperations={
 choices:(id:string)=>Promise<unknown>;selected:(id:string)=>Promise<unknown>;history:(data:Attempt&z.infer<typeof historyQuery>)=>Promise<unknown>;
 select:(data:Attempt&z.infer<typeof input.select>)=>Promise<unknown>;
 download:(data:Attempt&z.infer<typeof input.download>)=>Promise<unknown>;
 complete:(data:Attempt&z.infer<typeof input.complete>)=>Promise<unknown>;
 practice:(data:Attempt&z.infer<typeof input.practice>)=>Promise<unknown>;
};
const selection=z.object({trackVersionId:uuid,revision,policyVersionId:uuid}).strict();
const prompt=z.object({key:str,text:str}).strict();
type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
const json:z.ZodType<Json>=z.lazy(()=>z.union([z.null(),z.boolean(),z.number().finite(),str,z.array(json),z.record(json)]));
export const output={
 choices:z.object({choices:z.array(z.object({trackVersionId:uuid,title:str,presenterPersonId:nullableId,policyVersionId:uuid,allowSwitching:z.boolean()}).strict()),blocked:z.array(z.object({trackVersionId:uuid,reason:str}).strict()),selection:selection.nullable()}).strict(),
 selected:z.object({courseAttemptId:uuid,courseVersionId:uuid,sectionId:nullableId,canManageProgress:z.boolean(),
 selection:z.object({id:uuid,trackVersionId:uuid,revision,selectedAt:iso,selectedByPersonId:nullableId,selectionSource:str}).strict(),
 track:z.object({title:str,presenterPersonId:nullableId}).strict(),
 lessons:z.array(z.object({id:uuid,courseUnitId:uuid,title:str,lessonOrder:integer,progress:z.object({status:str,observedAt:iso}).strict().nullable(),
 presentations:z.array(z.object({assetVersionId:uuid,presentationKind:str,ordinal:integer,accessibilityNotes:json}).strict())}).strict()),
 materials:z.array(z.object({id:uuid,courseUnitId:uuid,assetVersionId:nullableId,materialKind:str,practice:z.object({instructions:str,prompts:z.array(prompt)}).strict().nullable()}).strict())}).strict(),
 select:selection.extend({courseAttemptId:uuid,selectionId:uuid}).strict(),
 download:z.object({downloadUrl:str.url().refine(v=>v.startsWith('https://')),expiresInSeconds:z.literal(30)}).strict(),
 complete:z.object({courseAttemptId:uuid,courseVersionId:uuid,lessonId:uuid,status:z.literal('completed')}).strict(),
 practice:z.object({practiceAttemptId:uuid,courseAttemptId:uuid,trackVersionId:uuid,policyVersionId:uuid,courseUnitId:uuid}).strict(),
 history:z.object({items:z.array(z.object({id:uuid,courseUnitId:uuid,trackVersionId:nullableId,policyVersionId:nullableId,scoreNumeric:nullableText,recordedAt:iso,trackTitle:nullableText,courseUnitTitle:nullableText,answers:z.array(z.object({promptKey:str,promptText:str,response:str}).strict())}).strict()).max(10),nextBeforeId:nullableId}).strict(),
};
const id={type:'string' as const,format:'uuid'},s={type:'string' as const},n={type:'integer' as const},pos={...n,minimum:1},bool={type:'boolean' as const},dt={...s,format:'date-time'};
const ni={...id,nullable:true},ns={...s,nullable:true};
const obj=<T extends Record<string,unknown>>(properties:T,required:string[]=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,required,properties});
const arr=<T>(items:T)=>({type:'array' as const,items});
const selectionDoc=obj({trackVersionId:id,revision:pos,policyVersionId:id});
export const inputDocs={
 select:obj({requestId:id,trackVersionId:id,expectedRevision:{...n,minimum:0},switchReason:{...ns,minLength:1,maxLength:500}},['requestId','trackVersionId','expectedRevision']),
 download:obj({assetVersionId:id}),
 complete:obj({requestId:id,lessonId:id,expectedRevision:pos}),
 practice:obj({requestId:id,courseVersionId:id,trackVersionId:id,materialId:id,expectedRevision:pos,responses:{...arr(obj({promptKey:{...s,minLength:1,maxLength:100},response:{...s,maxLength:20000}})),maxItems:100}}),
};
export const outputDocs={
 choices:obj({choices:arr(obj({trackVersionId:id,title:s,presenterPersonId:ni,policyVersionId:id,allowSwitching:bool})),blocked:arr(obj({trackVersionId:id,reason:s})),selection:{...selectionDoc,nullable:true}}),
 selected:obj({courseAttemptId:id,courseVersionId:id,sectionId:ni,canManageProgress:bool,
 selection:obj({id,trackVersionId:id,revision:pos,selectedAt:dt,selectedByPersonId:ni,selectionSource:s}),track:obj({title:s,presenterPersonId:ni}),
 lessons:arr(obj({id,courseUnitId:id,title:s,lessonOrder:n,progress:{...obj({status:s,observedAt:dt}),nullable:true},presentations:arr(obj({assetVersionId:id,presentationKind:s,ordinal:n,accessibilityNotes:{description:'Published accessibility metadata; JSON value'}}))})),
 materials:arr(obj({id,courseUnitId:id,assetVersionId:ni,materialKind:s,practice:{...obj({instructions:s,prompts:arr(obj({key:s,text:s}))}),nullable:true}}))}),
 select:obj({...selectionDoc.properties,courseAttemptId:id,selectionId:id}),
 download:obj({downloadUrl:{...s,format:'uri'},expiresInSeconds:{...n,enum:[30]}}),
 complete:obj({courseAttemptId:id,courseVersionId:id,lessonId:id,status:{...s,enum:['completed']}}),
 practice:obj({practiceAttemptId:id,courseAttemptId:id,trackVersionId:id,policyVersionId:id,courseUnitId:id}),
 history:obj({items:{...arr(obj({id,courseUnitId:id,trackVersionId:ni,policyVersionId:ni,scoreNumeric:ns,recordedAt:dt,trackTitle:ns,courseUnitTitle:ns,answers:arr(obj({promptKey:s,promptText:s,response:s}))})),maxItems:10},nextBeforeId:ni}),
};

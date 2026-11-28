import { z } from 'zod';
const uuid=z.string().uuid(),str=z.string(),hash=str.regex(/^[a-f0-9]{64}$/),count=z.number().int().nonnegative(),positive=z.number().int().positive();
const segments=z.array(z.object({title:str.trim().min(3).max(160),minutes:positive.max(90)}).strict()).min(1).max(18);
const editable=z.object({title:str.trim().min(3).max(200),objectives:z.array(str.trim().min(3).max(250)).min(1).max(10),segments}).strict();
const duration=(v:{segments:{minutes:number}[]})=>v.segments.reduce((a,s)=>a+s.minutes,0)<=180;
export const params={course:z.object({courseVersionId:uuid}).strict(),lesson:z.object({courseVersionId:uuid,lessonId:uuid}).strict()};
export const queries={empty:z.object({}).strict(),assignments:z.object({offset:str.regex(/^(0|[1-9][0-9]{0,6})$/).transform(Number).pipe(count.max(1000000)).optional()}).strict()};
export const inputs={lesson:editable.extend({expectedRevision:hash}).strict().refine(duration),assignment:z.object({assignmentKey:str.trim().regex(/^[a-z][a-z0-9_-]{2,79}$/),title:str.trim().min(3).max(200),instructions:str.trim().min(5).max(12000),required:z.boolean()}).strict()};
const base={courseVersionId:uuid,courseTitle:str,versionNo:positive,limited:z.boolean()};
export const results={
 lessons:z.object({...base,nextOffset:count.nullable(),lessons:z.array(z.object({id:uuid,title:str,unitTitle:str,lessonOrder:count,revision:hash,editable:editable.refine(duration).nullable()}).strict()).max(80)}).strict(),
 saved:z.object({revision:hash,changed:z.boolean()}).strict(),
 readiness:z.object({...base,courseLifecycle:z.literal('draft'),lessonCount:count,offerings:z.array(z.object({offeringVersionId:uuid,offeringTitle:str,versionNo:positive,lifecycle:str,published:z.boolean()}).strict()).max(80),independentPublicationVerified:z.literal(false),siteAndOperatorAuthorizationVerified:z.literal(false)}).strict(),
 assignment:z.object({assignmentVersionId:uuid,created:z.boolean()}).strict(),
 assignments:z.object({items:z.array(z.object({id:uuid,assignmentKey:str,required:z.boolean(),title:str,instructions:str.nullable()}).strict()).max(100),nextOffset:count.nullable()}).strict(),
};
const s={type:'string' as const},id={...s,format:'uuid'},h={...s,pattern:'^[a-f0-9]{64}$'},n={type:'integer' as const,minimum:0},p={...n,minimum:1},b={type:'boolean' as const};
const obj=(properties:Record<string,any>)=>({type:'object' as const,additionalProperties:false,properties,required:Object.keys(properties)});
const arr=(items:Record<string,any>,maxItems:number,minItems?:number)=>({type:'array' as const,items,maxItems,...(minItems?{minItems}:{})});
const text=(minLength:number,maxLength:number)=>({...s,minLength,maxLength});
const editableDoc={title:text(3,200),objectives:arr(text(3,250),10,1),segments:arr(obj({title:text(3,160),minutes:{...p,maximum:90}}),18,1)};
const baseDoc={courseVersionId:id,courseTitle:s,versionNo:p,limited:b};
export const inputDocs={lesson:obj({...editableDoc,expectedRevision:h}),assignment:obj({assignmentKey:{...s,pattern:'^[a-z][a-z0-9_-]{2,79}$'},title:text(3,200),instructions:text(5,12000),required:b})};
export const docs={
 lessons:obj({...baseDoc,nextOffset:{...n,nullable:true},lessons:arr(obj({id,title:s,unitTitle:s,lessonOrder:n,revision:h,editable:{...obj(editableDoc),nullable:true}}),80)}),
 saved:obj({revision:h,changed:b}),
 readiness:obj({...baseDoc,courseLifecycle:{...s,enum:['draft']},lessonCount:n,offerings:arr(obj({offeringVersionId:id,offeringTitle:s,versionNo:p,lifecycle:s,published:b}),80),independentPublicationVerified:{...b,enum:[false]},siteAndOperatorAuthorizationVerified:{...b,enum:[false]}}),
 assignment:obj({assignmentVersionId:id,created:b}),
 assignments:obj({items:arr(obj({id,assignmentKey:s,required:b,title:s,instructions:{...s,nullable:true}}),100),nextOffset:{...n,nullable:true}})
};

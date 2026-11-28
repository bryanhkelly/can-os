import {z} from 'zod';
const uuid=z.string().uuid(),s=z.string(),hash=s.regex(/^[a-f0-9]{64}$/),v=z.number().int().positive();
export const params={program:z.object({programId:uuid}).strict(),pack:z.object({programId:uuid,packId:uuid}).strict(),version:z.object({programId:uuid,versionId:uuid}).strict()};
export const empty=z.object({}).strict();
export const inputs={
 create:z.object({requestId:uuid,slug:s.trim().min(3).max(80).regex(/^[a-z0-9-]+$/),name:s.trim().min(3).max(160),description:s.trim().min(10).max(2000),visibility:z.enum(['public','private']),licenseCode:z.enum(['CC0','CC-BY-4.0','COMMERCIAL'])}).strict(),
 draft:z.object({requestId:uuid}).strict(),
 save:z.object({expectedRevision:hash,courseVersionIds:z.array(uuid).min(1).max(200).refine(x=>new Set(x).size===x.length)}).strict(),
 publish:z.object({expectedRevision:hash,confirmed:z.literal(true),reason:s.trim().min(10).max(2000)}).strict()
};
const course=z.object({courseId:uuid,courseVersionId:uuid,title:s,code:s,subject:s,version:v}).strict();
const release=z.object({id:uuid,version:v,status:s,courseVersionIds:z.array(uuid),revision:hash,publishedAt:s.datetime({offset:true}).nullable()}).strict();
const pack=z.object({id:uuid,name:s,slug:s,description:s,visibility:s,licenseCode:s,releases:z.array(release)}).strict();
export const results={studio:z.object({programId:uuid,courses:z.array(course),packs:z.array(pack)}).strict(),created:z.object({packId:uuid,versionId:uuid,created:z.boolean()}).strict(),draft:z.object({versionId:uuid,created:z.boolean()}).strict(),saved:z.object({revision:hash,changed:z.boolean()}).strict()};
const str={type:'string' as const},id={...str,format:'uuid'},h={...str,pattern:'^[a-f0-9]{64}$'},ver={type:'integer' as const,minimum:1},b={type:'boolean' as const};
const obj=(properties:Record<string,any>)=>({type:'object' as const,properties,required:Object.keys(properties),additionalProperties:false});
const arr=(items:Record<string,any>)=>({type:'array' as const,items});
const text=(minLength:number,maxLength:number)=>({...str,minLength,maxLength});
const en=(values:string[])=>({...str,enum:values});
export const inputDocs={create:obj({requestId:id,slug:{...text(3,80),pattern:'^[a-z0-9-]+$'},name:text(3,160),description:text(10,2000),visibility:en(['public','private']),licenseCode:en(['CC0','CC-BY-4.0','COMMERCIAL'])}),draft:obj({requestId:id}),save:obj({expectedRevision:h,courseVersionIds:{...arr(id),minItems:1,maxItems:200,uniqueItems:true}}),publish:obj({expectedRevision:h,confirmed:{...b,enum:[true]},reason:text(10,2000)})};
const courseDoc=obj({courseId:id,courseVersionId:id,title:str,code:str,subject:str,version:ver});
const releaseDoc=obj({id,version:ver,status:str,courseVersionIds:arr(id),revision:h,publishedAt:{...str,format:'date-time',nullable:true}});
const packDoc=obj({id,name:str,slug:str,description:str,visibility:str,licenseCode:str,releases:arr(releaseDoc)});
export const docs={studio:obj({programId:id,courses:arr(courseDoc),packs:arr(packDoc)}),created:obj({packId:id,versionId:id,created:b}),draft:obj({versionId:id,created:b}),saved:obj({revision:h,changed:b})};

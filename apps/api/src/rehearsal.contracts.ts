import {z} from 'zod';
const uuid=z.string().uuid(),str=z.string(),bool=z.boolean();
const scope={deploymentId:uuid,courseVersionId:uuid,siteId:uuid,adoptionId:uuid};
const media={...scope,lessonId:uuid,assetVersionId:uuid};
export const inputs={none:z.object({}).strict(),scope:z.object(scope).strict(),media:z.object(media).strict(),playback:z.object({...media,requestId:uuid,kind:z.enum(['opened','played','paused','ended'])}).strict()};
export const results={
 choices:z.object({choices:z.array(z.object({...scope,courseTitle:str,deploymentName:str}).strict()).max(20200),partial:bool}).strict(),
 media:z.object({media:z.array(z.object({lessonId:uuid,lessonTitle:str,assetVersionId:uuid,trackVersionId:uuid}).strict()).max(25),note:str}).strict(),
 access:z.object({downloadUrl:str.url().refine(v=>v.startsWith('https://')),expiresInSeconds:z.union([z.literal(0),z.literal(30)])}).strict(),
 playback:z.object({saved:bool,duplicate:bool,rehearsalOnly:z.literal(true)}).strict().refine(v=>v.saved!==v.duplicate),
};
const s={type:'string' as const},id={...s,format:'uuid'},b={type:'boolean' as const};
const obj=(properties:Record<string,any>)=>({type:'object' as const,additionalProperties:false,properties,required:Object.keys(properties)});
const arr=(items:Record<string,any>,maxItems:number)=>({type:'array' as const,items,maxItems});
const scopeDoc={deploymentId:id,courseVersionId:id,siteId:id,adoptionId:id};
const mediaDoc={...scopeDoc,lessonId:id,assetVersionId:id};
export const inputDocs={media:obj(mediaDoc),playback:obj({...mediaDoc,requestId:id,kind:{...s,enum:['opened','played','paused','ended']}})};
export const docs={
 choices:obj({choices:arr(obj({...scopeDoc,courseTitle:s,deploymentName:s}),20200),partial:b}),
 media:obj({media:arr(obj({lessonId:id,lessonTitle:s,assetVersionId:id,trackVersionId:id}),25),note:s}),
 access:obj({downloadUrl:{...s,format:'uri'},expiresInSeconds:{type:'integer' as const,enum:[0,30]}}),
 playback:obj({saved:b,duplicate:b,rehearsalOnly:{...b,enum:[true]}}),
};

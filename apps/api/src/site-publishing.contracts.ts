import {z} from 'zod';
const id=z.string().uuid(),s=z.string(),b=z.boolean(),dt=s.datetime({offset:true}),state=z.enum(['draft','published']);
const slug=s.min(3).max(48),reason=s.trim().min(10).max(500);
export const params=z.object({siteId:id}).strict();
export const programParams=params.extend({programId:id}).strict();
export const bodies={
 rename:z.object({name:s.trim().min(2).max(120),slug,expectedName:s,expectedRevision:dt,reason,contentReviewed:b}).strict(),
 reserve:z.object({slug}).strict(),
 publish:z.object({action:z.enum(['publish','unpublish','republish']),expectedRevision:dt,reason,contentReviewed:b}).strict(),
 marketing:z.object({action:z.enum(['publish','unpublish']),expectedRevision:dt.nullable(),summary:s.max(2000),reason,contentReviewed:b}).strict()
};
export const results={
 rename:z.object({changed:b,siteId:id,name:s,slug:s}).strict(),
 reserve:z.object({siteId:id,host:s,status:state}).strict(),
 publish:z.object({siteId:id,status:state,publishedAt:dt.nullable(),updatedAt:dt,changed:b}).strict(),
 marketing:z.object({programId:id,status:state,changed:b,updatedAt:dt.nullable()}).strict()
};
const str={type:'string' as const},uuid={...str,format:'uuid'},date={...str,format:'date-time'},bool={type:'boolean' as const};
const en=(values:readonly string[])=>({...str,enum:[...values]});
const obj=(properties:Record<string,any>)=>({type:'object' as const,additionalProperties:false,properties,required:Object.keys(properties)});
const limit=(minLength:number,maxLength:number)=>({...str,minLength,maxLength});
const status=en(state.options),decision={expectedRevision:date,reason:limit(10,500),contentReviewed:bool};
export const inputs={
 rename:obj({name:limit(2,120),slug:limit(3,48),expectedName:str,...decision}),reserve:obj({slug:limit(3,48)}),
 publish:obj({action:en(['publish','unpublish','republish']),...decision}),
 marketing:obj({action:en(['publish','unpublish']),...decision,expectedRevision:{...date,nullable:true},summary:limit(0,2000)})
};
export const docs={
 rename:obj({changed:bool,siteId:uuid,name:str,slug:str}),reserve:obj({siteId:uuid,host:str,status}),
 publish:obj({siteId:uuid,status,publishedAt:{...date,nullable:true},updatedAt:date,changed:bool}),
 marketing:obj({programId:uuid,status,changed:bool,updatedAt:{...date,nullable:true}})
};

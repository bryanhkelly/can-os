import {z} from 'zod';
const id=z.string().uuid(),s=z.string(),b=z.boolean(),date=s.datetime({offset:true}),n=z.number().int().nonnegative();
const code=s.regex(/^[A-Za-z0-9_-]{12}$/);
const state=z.enum(['active','paused','revoked']);
export const siteParams=z.object({siteId:id}).strict(),shareParams=siteParams.extend({shareId:id}).strict();
export const bodies={
 create:z.object({requestId:id,expiresAfterDays:z.union([z.literal(7),z.literal(30),z.null()])}).strict(),
 status:z.object({action:z.enum(['pause','resume'])}).strict(),revoke:z.object({}).strict()
};
export const empty=z.object({}).strict();
export const results={
 list:z.array(z.object({id,code,createdAt:date,expiresAt:date.nullable(),revokedAt:date.nullable(),paused:b,sourceRevision:n,brandVersionId:id}).strict()),
 create:z.object({shareId:id,relativeUrl:s.regex(/^\/go\/[A-Za-z0-9_-]{12}$/),expiresAt:date.nullable(),sourceRevision:n}).strict(),
 status:z.object({changed:b,status:state}).strict()
};
const str={type:'string' as const},uuid={...str,format:'uuid'},dt={...str,format:'date-time'},bool={type:'boolean' as const},count={type:'integer' as const,minimum:0};
const obj=(properties:Record<string,any>)=>({type:'object' as const,additionalProperties:false,properties,required:Object.keys(properties)});
export const inputs={create:obj({requestId:uuid,expiresAfterDays:{type:'integer',enum:[7,30,null],nullable:true}}),status:obj({action:{...str,enum:['pause','resume']}}),revoke:obj({})};
export const docs={
 list:{type:'array' as const,items:obj({id:uuid,code:{...str,pattern:'^[A-Za-z0-9_-]{12}$'},createdAt:dt,expiresAt:{...dt,nullable:true},revokedAt:{...dt,nullable:true},paused:bool,sourceRevision:count,brandVersionId:uuid})},
 create:obj({shareId:uuid,relativeUrl:{...str,pattern:'^/go/[A-Za-z0-9_-]{12}$'},expiresAt:{...dt,nullable:true},sourceRevision:count}),
 status:obj({changed:bool,status:{...str,enum:state.options}})
};

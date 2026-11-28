import {z} from 'zod';
const s=z.string(),id=s.uuid(),status=z.enum(['pending','approved','rejected','revoked']),date=s.datetime({offset:true});
export const empty=z.object({}).strict(),site=z.object({siteId:id}).strict(),affiliation=z.object({affiliationId:id}).strict(),siteAffiliation=site.merge(affiliation);
export const bodies={request:z.object({denominationOrganizationId:id,note:s.trim().min(10).max(1000)}).strict(),review:z.object({decision:z.enum(['approve','reject','revoke']),reason:s.trim().min(4).max(1000)}).strict()};
const base={id,status,requestNote:s,decisionReason:s.nullable(),requestedAt:date,reviewedAt:date.nullable()};
export const results={networks:z.object({networks:z.array(z.object({id,name:s}).strict())}).strict(),local:z.object({entries:z.array(z.object({...base,denominationOrganizationId:id,denominationName:s}).strict())}).strict(),hq:z.object({entries:z.array(z.object({...base,siteId:id,siteName:s,siteOrganizationId:id,siteOrganizationName:s}).strict())}).strict(),requested:z.object({affiliationId:id,status:z.enum(['pending','approved']),created:z.boolean()}).strict(),decision:z.object({affiliationId:id,status:z.enum(['approved','rejected','revoked'])}).strict()};
// Domain readers return Dates; serialize before validating JSON wire shape.
export function wire(value:unknown):unknown{return JSON.parse(JSON.stringify(value));}
const str={type:'string' as const},uuid={...str,format:'uuid'},dt={...str,format:'date-time'},bool={type:'boolean' as const};
const en=(values:string[])=>({...str,enum:values}),nul=(v:Record<string,any>)=>({...v,nullable:true});
const obj=(properties:Record<string,any>)=>({type:'object' as const,properties,required:Object.keys(properties),additionalProperties:false});
const arr=(items:Record<string,any>)=>({type:'array' as const,items});
const common={id:uuid,status:en(['pending','approved','rejected','revoked']),requestNote:str,decisionReason:nul(str),requestedAt:dt,reviewedAt:nul(dt)};
export const inputs={request:obj({denominationOrganizationId:uuid,note:{...str,minLength:10,maxLength:1000}}),review:obj({decision:en(['approve','reject','revoke']),reason:{...str,minLength:4,maxLength:1000}}),empty:obj({})};
export const docs={networks:obj({networks:arr(obj({id:uuid,name:str}))}),local:obj({entries:arr(obj({...common,denominationOrganizationId:uuid,denominationName:str}))}),hq:obj({entries:arr(obj({...common,siteId:uuid,siteName:str,siteOrganizationId:uuid,siteOrganizationName:str}))}),requested:obj({affiliationId:uuid,status:en(['pending','approved']),created:bool}),decision:obj({affiliationId:uuid,status:en(['approved','rejected','revoked'])})};

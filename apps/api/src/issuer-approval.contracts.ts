import {z} from 'zod';
const uuid=z.string().uuid(),evidence=z.string().trim().min(25).max(1200);
const date=z.string().datetime({offset:true}),nullableDate=date.nullable();
const status=['pending','approved','rejected','revoked'] as const;
export const requestBody=z.object({evidenceReference:evidence}).strict();
export const reviewBody=z.object({approvalId:uuid,decision:z.enum(['approve','reject']),evidenceReference:evidence,expiresAt:date.optional()}).strict().refine(v=>v.decision==='reject'||v.expiresAt!==undefined,{message:'Approval expiry required'});
export const revokeBody=z.object({approvalId:uuid,reason:evidence}).strict();
const approval=z.object({id:uuid,status:z.enum(status),requestedAt:date,reviewedAt:nullableDate,approvedUntil:nullableDate}).strict();
export const myApproval=z.object({approval:approval.nullable()}).strict();
const base=z.object({id:uuid,requestedByAccountId:uuid,requestedAt:date,organizationId:uuid.nullable(),siteId:uuid.nullable()}).strict();
export const active=z.array(base.extend({reviewedAt:nullableDate,approvedUntil:nullableDate})).max(101);
export const pending=z.array(base.extend({grantId:uuid,role:z.string(),evidenceReference:evidence})).max(101);
export const requested=z.object({requested:z.literal(true),approvalId:uuid}).strict();
export const reviewed=z.object({status:z.enum(['approved','rejected'])}).strict();
export const revoked=z.object({revoked:z.literal(true)}).strict();
const str={type:'string' as const},id={...str,format:'uuid'},dt={...str,format:'date-time'},nd={...dt,nullable:true},ni={...id,nullable:true},proof={...str,minLength:25,maxLength:1200},yes={type:'boolean' as const,enum:[true]};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>)=>({type:'array' as const,items,maxItems:101});
const baseDoc={id,requestedByAccountId:id,requestedAt:dt,organizationId:ni,siteId:ni};
export const doc={
 request:obj({evidenceReference:proof}),
 review:obj({approvalId:id,decision:{...str,enum:['approve','reject']},evidenceReference:proof,expiresAt:{...dt,description:'Required for approval; at most 366 days in the future'}},['approvalId','decision','evidenceReference']),
 revoke:obj({approvalId:id,reason:proof}),
 my:obj({approval:{...obj({id,status:{...str,enum:[...status]},requestedAt:dt,reviewedAt:nd,approvedUntil:nd}),nullable:true}}),
 active:arr(obj({...baseDoc,reviewedAt:nd,approvedUntil:nd})),
 pending:arr(obj({...baseDoc,grantId:id,role:str,evidenceReference:proof})),
 requested:obj({requested:yes,approvalId:id}),
 reviewed:obj({status:{...str,enum:['approved','rejected']}}),
 revoked:obj({revoked:yes}),
};

import {z} from 'zod';
const uuid=z.string().uuid(),role=z.enum(['teacher','registrar']),reason=z.string().trim().min(10).max(500);
export const query=z.object({programId:uuid}).strict();
export const grant=z.object({programId:uuid,personId:uuid,role,reason}).strict();
export const revoke=z.object({roleAssignmentId:uuid,reason}).strict();
export const desk=z.object({programId:uuid,siteId:uuid,candidates:z.array(z.object({personId:uuid,firstName:z.string(),lastName:z.string(),role}).strict()).max(100),current:z.array(z.object({id:uuid,personId:uuid,role}).strict()).max(100),truncated:z.boolean()}).strict();
export const granted=z.object({roleAssignmentId:uuid,created:z.boolean()}).strict();
export const revoked=z.object({revoked:z.literal(true)}).strict();
const str={type:'string' as const},id={...str,format:'uuid'},r={...str,enum:['teacher','registrar']},why={...str,minLength:10,maxLength:500},bool={type:'boolean' as const};
const obj=(properties:Record<string,any>)=>({type:'object' as const,additionalProperties:false,properties,required:Object.keys(properties)});
const arr=(items:Record<string,any>)=>({type:'array' as const,items,maxItems:100});
export const doc={
 grant:obj({programId:id,personId:id,role:r,reason:why}),revoke:obj({roleAssignmentId:id,reason:why}),
 desk:obj({programId:id,siteId:id,candidates:arr(obj({personId:id,firstName:str,lastName:str,role:r})),current:arr(obj({id,personId:id,role:r})),truncated:bool}),
 granted:obj({roleAssignmentId:id,created:bool}),revoked:obj({revoked:{...bool,enum:[true]}})
};

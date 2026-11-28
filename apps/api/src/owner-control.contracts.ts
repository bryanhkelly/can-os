import {z} from 'zod';
const uuid=z.string().uuid(),mode=z.enum(['view','act']),reason=z.string().trim().min(12).max(500);
export const searchQuery=z.object({search:z.string().trim().min(2).max(100)}).strict();
export const startBody=z.object({grantId:uuid,mode,reason}).strict();
export const stopBody=z.object({confirm:z.literal(true)}).strict();
export const recoverBody=z.object({grantId:uuid,reason,confirm:z.literal(true),operation:z.enum(['enroll','rotate']).default('rotate')}).strict();
export const status=z.object({active:z.boolean(),mode:mode.nullable(),expiresAt:z.string().datetime().nullable()}).strict();
const target=z.object({grantId:uuid,accountId:uuid,personId:uuid,role:z.string(),firstName:z.string(),lastName:z.string(),email:z.string().email(),privateAccessCodeEnabled:z.boolean(),organizationId:uuid.nullable(),siteId:uuid.nullable(),syntheticSitePerson:z.boolean(),canAct:z.boolean()}).strict();
export const targets=z.object({targets:z.array(target).max(25),limited:z.boolean()}).strict();
export const started=z.object({mode,expiresAt:z.string().datetime()}).strict();
export const stopped=z.object({stopped:z.literal(true)}).strict();
export const recovered=z.object({privateAccessCode:z.string().regex(/^[A-Za-z0-9_-]{43}$/),revokedCount:z.number().int().nonnegative()}).strict();
const str={type:'string' as const},id={...str,format:'uuid'},bool={type:'boolean' as const},date={...str,format:'date-time'},modeDoc={...str,enum:['view','act']};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const reasonDoc={...str,minLength:12,maxLength:500},confirm={...bool,enum:[true]};
const targetDoc=obj({grantId:id,accountId:id,personId:id,role:str,firstName:str,lastName:str,email:{...str,format:'email'},privateAccessCodeEnabled:bool,organizationId:{...id,nullable:true},siteId:{...id,nullable:true},syntheticSitePerson:bool,canAct:bool});
export const doc={
 start:obj({grantId:id,mode:modeDoc,reason:reasonDoc}),
 stop:obj({confirm}),
 recover:obj({grantId:id,reason:reasonDoc,confirm,operation:{...str,enum:['enroll','rotate'],default:'rotate'}},['grantId','reason','confirm']),
 status:obj({active:bool,mode:{...modeDoc,nullable:true},expiresAt:{...date,nullable:true}}),
 targets:obj({targets:{type:'array' as const,maxItems:25,items:targetDoc},limited:bool}),
 started:obj({mode:modeDoc,expiresAt:date}),
 stopped:obj({stopped:confirm}),
 recovered:obj({privateAccessCode:{...str,pattern:'^[A-Za-z0-9_-]{43}$'},revokedCount:{type:'integer' as const,minimum:0}})
};

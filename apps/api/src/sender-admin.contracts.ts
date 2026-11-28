import {z} from 'zod';
const id=z.string().uuid(),s=z.string();
export const scopeQuery=z.object({organizationId:id.optional()}).strict().transform(v=>({organizationId:v.organizationId??null}));
export const pageQuery=z.object({limit:s.regex(/^[1-9][0-9]{0,2}$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),afterName:s.max(500).optional(),afterId:id.optional()}).strict().refine(v=>(v.afterName===undefined)===(v.afterId===undefined)).transform(v=>({...v,limit:v.limit??50}));
const current=z.object({id,sender_from:s,postal_address:s,verification_reference:s}).strict();
const cursor=z.object({afterName:s,afterId:id}).strict();
export const results={current:current.nullable(),page:z.object({items:z.array(z.object({id,name:s}).strict()).max(100),nextCursor:cursor.nullable()}).strict(),receipt:z.object({ok:z.literal(true)}).strict()};
const str={type:'string' as const},uuid={...str,format:'uuid'},nullableId={...uuid,nullable:true},yes={type:'boolean' as const,enum:[true]};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
export const inputs={
 change:obj({organizationId:nullableId,from:{...str,format:'email',maxLength:254},address:{...str,minLength:1,maxLength:500},reference:{...str,minLength:5,maxLength:500},expectedId:nullableId,confirmed:yes},['from','address','reference','expectedId','confirmed']),
 revoke:obj({organizationId:nullableId,expectedId:uuid,confirmed:yes},['expectedId','confirmed'])
};
export const docs={
 current:{...obj({id:uuid,sender_from:str,postal_address:str,verification_reference:str}),nullable:true},
 page:obj({items:{type:'array' as const,maxItems:100,items:obj({id:uuid,name:str})},nextCursor:{...obj({afterName:str,afterId:uuid}),nullable:true}}),
 receipt:obj({ok:yes})
};

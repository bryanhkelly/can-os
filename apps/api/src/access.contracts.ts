import {z} from 'zod';
const uuid=z.string().uuid();
const email=z.string().trim().email().max(254);
const name=z.string().trim().min(1).max(80);
const returnTo=z.string().max(2048).optional();
export const requestBody=z.object({email,returnTo}).strict();
export const verificationBody=z.union([
 z.object({token:z.string().regex(/^[A-Za-z0-9_-]{40,128}$/),returnTo}).strict(),
 z.object({email,code:z.string().regex(/^(?:[0-9]{6}|[A-Za-z0-9_-]{43})$/),returnTo}).strict(),
]);
export const registerBody=z.object({email,firstName:name,lastName:name,adultConfirmed:z.literal(true),returnTo}).strict();
export const siteSignupBody=z.object({email,firstName:name,lastName:name,name:z.string().trim().min(2).max(160),organizationName:z.string().trim().min(2).max(160).optional(),organizationDomain:z.string().trim().max(253).optional(),organizationType:z.enum(['other_partner','church','christian_school','microschool_operator','consortium','denomination']).optional()}).strict();
export const accepted=z.object({accepted:z.literal(true),privateAccessCode:z.string().optional(),demo:z.boolean().optional()}).strict();
export const verified=z.object({ok:z.literal(true),role:z.string(),launchSiteId:uuid.optional(),homeSiteId:uuid.optional()}).strict();
export const session=z.object({authenticated:z.literal(true),activeGrantId:uuid,role:z.string(),grants:z.array(z.object({id:uuid,personId:uuid,role:z.string(),organizationId:uuid.nullable(),siteId:uuid.nullable()}).strict()),ownerDelegation:z.object({mode:z.string(),expiresAt:z.union([z.string(),z.date()])}).strict().optional()}).strict();
export const empty=z.object({}).strict();
const str={type:'string' as const},id={...str,format:'uuid'},bool={type:'boolean' as const};
const em={...str,format:'email',maxLength:254};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const identityFields={email:em,firstName:{...str,minLength:1,maxLength:80},lastName:{...str,minLength:1,maxLength:80}};
export const doc={
 request:obj({email:em,returnTo:str},['email']),
 verify:{oneOf:[obj({token:{...str,pattern:'^[A-Za-z0-9_-]{40,128}$'},returnTo:str},['token']),obj({email:em,code:{...str,pattern:'^(?:[0-9]{6}|[A-Za-z0-9_-]{43})$'},returnTo:str},['email','code'])]},
 register:obj({...identityFields,adultConfirmed:{...bool,enum:[true]},returnTo:str},['email','firstName','lastName','adultConfirmed']),
 site:obj({...identityFields,name:{...str,minLength:2,maxLength:160},organizationName:str,organizationDomain:str,organizationType:{...str,enum:['other_partner','church','christian_school','microschool_operator','consortium','denomination']}},['email','firstName','lastName','name']),
 accepted:obj({accepted:{...bool,enum:[true]},privateAccessCode:str,demo:bool},['accepted']),
 verified:obj({ok:{...bool,enum:[true]},role:str,launchSiteId:id,homeSiteId:id},['ok','role']),
 empty:obj({}),
 session:obj({authenticated:{...bool,enum:[true]},activeGrantId:id,role:str,grants:{type:'array' as const,items:obj({id,personId:id,role:str,organizationId:{...id,nullable:true},siteId:{...id,nullable:true}})},ownerDelegation:obj({mode:str,expiresAt:{...str,format:'date-time'}})},['authenticated','activeGrantId','role','grants'])
};

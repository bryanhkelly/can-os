import {z} from 'zod';
const uuid=z.string().uuid(),str=z.string(),bool=z.boolean();
export const roles=['teacher','registrar','specialist','counselor','room_facilitator','site_staff','site_leader','paraeducator','safeguarding_responder','safeguarding_lead','site_website_editor'] as const;
const reason=z.string().trim().min(12).max(500);
export const invite=z.object({email:z.string().trim().email().max(254),firstName:z.string().trim().min(1).max(80),lastName:z.string().trim().min(1).max(80),role:z.enum(roles),siteId:uuid,privateIdentityConfirmation:z.object({reason,existingPersonId:uuid.optional()}).strict().optional()}).strict();
export const query=z.object({query:z.string().trim().max(120).optional()}).strict();
export const grantState=z.object({grantId:uuid,active:bool}).strict();
const site=z.object({id:uuid,name:str,organizationId:uuid}).strict();
export const sites=z.object({sites:z.array(site),requireSiteSelection:bool}).strict();
const grant=z.object({grantId:uuid,role:str,organizationId:uuid.nullable(),siteId:uuid.nullable(),active:bool}).strict();
const personGrant=grant.extend({accountId:uuid,accountEmail:str});
const person=z.object({personId:uuid,firstName:str,lastName:str,preferredName:str.nullable(),active:bool,grants:z.array(personGrant)}).strict();
export const people=z.object({people:z.array(person).max(50)}).strict();
const states=['invited','accepted','qualified','needs_action','inactive'] as const;
const qualifications=['not_required','pending','qualified'] as const;
const nextActions=['accept_invitation','submit_qualifications','await_qualification_review','none','restore_access'] as const;
const onboarding=z.object({status:z.enum(states),accepted:bool,qualificationStatus:z.enum(qualifications),nextAction:z.enum(nextActions)}).strict();
const accountGrant=grant.extend({personId:uuid,personName:str,onboarding});
const account=z.object({accountId:uuid,email:str,disabled:bool,grants:z.array(accountGrant)}).strict();
export const accounts=z.object({accounts:z.array(account)}).strict();
const delivery=['already_active','private_code','demo_code','dispatched','cooldown','ineligible','failed'] as const;
export const invitation=z.object({accountId:uuid,personId:uuid,grantId:uuid,created:bool,pending:bool,privateCredential:bool,privateAccessCode:str.regex(/^[A-Za-z0-9_-]{43}$/).optional(),emailSent:bool,demoAccess:bool.optional(),deliveryStatus:z.enum(delivery)}).strict();
const s={type:'string' as const},id={...s,format:'uuid'},b={type:'boolean' as const},nullableId={...id,nullable:true};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>)=>({type:'array' as const,items});
const grantDoc={grantId:id,role:s,organizationId:nullableId,siteId:nullableId,active:b};
const onboardingDoc=obj({status:{...s,enum:[...states]},accepted:b,qualificationStatus:{...s,enum:[...qualifications]},nextAction:{...s,enum:[...nextActions]}});
export const doc={
 invite:obj({email:{...s,format:'email',maxLength:254},firstName:{...s,minLength:1,maxLength:80},lastName:{...s,minLength:1,maxLength:80},role:{...s,enum:[...roles]},siteId:id,privateIdentityConfirmation:obj({reason:{...s,minLength:12,maxLength:500},existingPersonId:id},['reason'])},['email','firstName','lastName','role','siteId']),
 grantState:obj({grantId:id,active:b}),
 sites:obj({sites:arr(obj({id,name:s,organizationId:id})),requireSiteSelection:b}),
 people:obj({people:{...arr(obj({personId:id,firstName:s,lastName:s,preferredName:{...s,nullable:true},active:b,grants:arr(obj({...grantDoc,accountId:id,accountEmail:s}))})),maxItems:50}}),
 accounts:obj({accounts:arr(obj({accountId:id,email:s,disabled:b,grants:arr(obj({...grantDoc,personId:id,personName:s,onboarding:onboardingDoc}))}))}),
 invitation:obj({accountId:id,personId:id,grantId:id,created:b,pending:b,privateCredential:b,privateAccessCode:{...s,pattern:'^[A-Za-z0-9_-]{43}$'},emailSent:b,demoAccess:b,deliveryStatus:{...s,enum:[...delivery]}},['accountId','personId','grantId','created','pending','privateCredential','emailSent','deliveryStatus'])
};

import {z} from 'zod';
const id=z.string().uuid(),s=z.string(),b=z.boolean(),n=z.number().int().nonnegative(),dt=s.datetime({offset:true});
export const workspaceQuery=z.object({engagementId:id,linkId:id}).strict();
export const membersQuery=workspaceQuery.extend({listId:id,offset:s.regex(/^(0|[1-9][0-9]{0,3})$/).transform(Number).pipe(z.number().int().min(0).max(1000))}).strict();
const metrics={total:n,pending:n,accepted:n,delivered:n,bounced:n,complained:n,failed:n,unconfirmed:n,suppressed:n,cancelled:n};
const campaign=z.object({id,subject:s,scheduled_at:dt,cancelled_at:dt.nullable(),...metrics}).strict();
const list=z.object({id,name:s,recipients:n}).strict();
const member=z.object({email:s,consent_source:s,consent_at:dt,suppression:s.nullable()}).strict();
export const results={
 workspace:z.object({lists:z.array(list).max(100),campaigns:z.array(campaign).max(50),senderReady:b,senderIssues:z.array(s),senderLabel:s}).strict(),
 receipt:z.object({id}).strict(),cancel:z.object({ok:z.literal(true)}).strict(),
 members:z.object({members:z.array(member).max(50),hasMore:b}).strict(),decision:z.object({changed:b}).strict()
};
const str={type:'string' as const},uuid={...str,format:'uuid'},bool={type:'boolean' as const},integer={type:'integer' as const,minimum:0},date={...str,format:'date-time'},yes={...bool,enum:[true]};
const obj=(properties:Record<string,any>)=>({type:'object' as const,additionalProperties:false,properties,required:Object.keys(properties)});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems===undefined?{}:{maxItems})});
const base={engagementId:uuid,linkId:uuid};
const recipients={raw:{...str,maxLength:256000},consentSource:{...str,minLength:5,maxLength:500},attested:yes};
const scheduled={...base,requestId:uuid,scheduledAt:date,confirmed:yes};
export const inputs={
 save:obj({...base,name:{...str,minLength:1,maxLength:120},...recipients}),
 queue:{oneOf:[obj({...scheduled,listId:uuid}),obj({...scheduled,...recipients})]},
 cancel:obj({...base,campaignId:uuid}),
 memberDecision:obj({...base,listId:uuid,email:{...str,maxLength:254},operation:{...str,enum:['remove','withdraw']},confirmed:yes})
};
const metricDoc=Object.fromEntries(Object.keys(metrics).map(key=>[key,integer]));
const campaignDoc=obj({id:uuid,subject:str,scheduled_at:date,cancelled_at:{...date,nullable:true},...metricDoc});
export const docs={
 workspace:obj({lists:arr(obj({id:uuid,name:str,recipients:integer}),100),campaigns:arr(campaignDoc,50),senderReady:bool,senderIssues:arr(str),senderLabel:str}),
 receipt:obj({id:uuid}),cancel:obj({ok:yes}),
 members:obj({members:arr(obj({email:str,consent_source:str,consent_at:date,suppression:{...str,nullable:true}}),50),hasMore:bool}),
 decision:obj({changed:bool})
};

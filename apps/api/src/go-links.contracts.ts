import {z} from 'zod';
const id=z.string().uuid(),s=z.string(),b=z.boolean(),dt=s.datetime({offset:true}),n=z.number().int().nonnegative();
const pages=['home','programs','experiences','courses','classes','academics','admissions','contact'] as const;
const kinds=['site-page','adult-training','class','enrichment','information','website-preview'] as const;
const status=z.enum(['active','paused','revoked']),channel=z.enum(['email','flyer','qr','social','partner','other']);
const availability=z.enum(['available','scheduled','expired','paused','revoked']);
const publicDestinations=[
 z.object({kind:z.literal('site-page'),page:z.enum(pages)}).strict(),
 z.object({kind:z.literal('adult-training'),releaseId:id}).strict(),
 z.object({kind:z.literal('class'),classId:id}).strict(),
 z.object({kind:z.literal('enrichment'),seasonId:id}).strict(),
 z.object({kind:z.literal('information'),journeyId:s.regex(/^[a-z][a-z0-9-]{1,60}$/)}).strict()
] as const;
const createDestination=z.discriminatedUnion('kind',publicDestinations);
const destination=z.discriminatedUnion('kind',[...publicDestinations,z.object({kind:z.literal('website-preview'),snapshotId:id,snapshotDigest:s.regex(/^[a-f0-9]{64}$/),sourceRevision:n,brandVersionId:id}).strict()]);
const management=z.object({name:s.trim().min(1).max(120),channel:channel.nullable().optional(),startsAt:dt.nullable().optional(),expiresAt:dt.nullable().optional()}).strict().refine(v=>!v.startsAt||!v.expiresAt||Date.parse(v.expiresAt)>Date.parse(v.startsAt));
const scope={packageId:id.optional()};
export const siteParams=z.object({siteId:id}).strict();
export const linkParams=siteParams.extend({linkId:id}).strict();
export const bodies={
 create:z.object({...scope,requestId:id,destination:createDestination,management:management.optional()}).strict(),
 manage:z.object({...scope,action:z.enum(['pause','resume'])}).strict(),
 revoke:z.object(scope).strict()
};
export const queries={
 scope:z.object(scope).strict(),
 page:z.object({...scope,cursor:id.optional(),limit:s.regex(/^(?:[1-9]|[1-4][0-9]|50)$/).transform(Number).optional(),term:s.trim().max(80).optional()}).strict(),
 choices:z.object({...scope,kind:z.enum(kinds),term:s.trim().max(80).optional()}).strict()
};
const link=z.object({id,code:s.regex(/^[A-Za-z0-9_-]{12}$/),destination,status,name:s,channel:channel.nullable(),startsAt:dt.nullable(),expiresAt:dt.nullable(),createdAt:dt}).strict();
const evidence=z.object({linkId:id,redirects30d:n,linkOpens30d:n,pageViews30d:n,redirectResponses30d:n,unclassifiedEntries30d:n,referralRegistrations30d:n.nullable(),registrationEvidence:z.enum(['referenced_noncredit_claim','not_connected']),observationQuality:z.literal('unfiltered_automated_traffic'),periodStart:s,periodEnd:s}).strict();
export const results={
 link,transition:z.object({id,status}).strict(),inspection:z.object({availability,destinationAvailable:b,title:s,navigable:b}).strict(),
 choices:z.array(z.object({destination,title:s,description:s}).strict()),
 page:z.object({items:z.array(link.extend({packageId:id.nullable(),availability,evidence:evidence.nullable()})).max(50),nextCursor:id.nullable()}).strict()
};
const str={type:'string' as const},uuid={...str,format:'uuid'},date={...str,format:'date-time'},bool={type:'boolean' as const},count={type:'integer' as const,minimum:0};
const en=(values:readonly string[])=>({...str,enum:[...values]});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems===undefined?{}:{maxItems})});
const variants=[obj({kind:en(['site-page']),page:en(pages)}),obj({kind:en(['adult-training']),releaseId:uuid}),obj({kind:en(['class']),classId:uuid}),obj({kind:en(['enrichment']),seasonId:uuid}),obj({kind:en(['information']),journeyId:{...str,pattern:'^[a-z][a-z0-9-]{1,60}$'}})];
const destinationDoc={oneOf:[...variants,obj({kind:en(['website-preview']),snapshotId:uuid,snapshotDigest:{...str,pattern:'^[a-f0-9]{64}$'},sourceRevision:count,brandVersionId:uuid})]};
const nullableDate={...date,nullable:true},nullableUuid={...uuid,nullable:true};
const fields={id:uuid,code:{...str,pattern:'^[A-Za-z0-9_-]{12}$'},destination:destinationDoc,status:en(status.options),name:str,channel:{...en(channel.options),nullable:true},startsAt:nullableDate,expiresAt:nullableDate,createdAt:date};
const evidenceDoc=obj({linkId:uuid,redirects30d:count,linkOpens30d:count,pageViews30d:count,redirectResponses30d:count,unclassifiedEntries30d:count,referralRegistrations30d:{...count,nullable:true},registrationEvidence:en(['referenced_noncredit_claim','not_connected']),observationQuality:en(['unfiltered_automated_traffic']),periodStart:str,periodEnd:str});
export const inputs={
 create:obj({packageId:uuid,requestId:uuid,destination:{oneOf:variants},management:obj({name:{...str,minLength:1,maxLength:120},channel:fields.channel,startsAt:nullableDate,expiresAt:nullableDate},['name'])},['requestId','destination']),
 manage:obj({packageId:uuid,action:en(['pause','resume'])},['action']),revoke:obj({packageId:uuid},[])
};
export const docs={
 link:obj(fields),transition:obj({id:uuid,status:fields.status}),inspection:obj({availability:en(availability.options),destinationAvailable:bool,title:str,navigable:bool}),
 choices:arr(obj({destination:destinationDoc,title:str,description:str})),
 page:obj({items:arr(obj({...fields,packageId:nullableUuid,availability:en(availability.options),evidence:{...evidenceDoc,nullable:true}}),50),nextCursor:nullableUuid})
};

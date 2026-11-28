import {z} from 'zod';
const uuid=z.string().uuid(),count=z.number().int().nonnegative(),yes=z.literal(true);
export const results={
 schedule:z.object({classId:uuid,sessions:z.array(z.object({classSessionId:uuid,planId:uuid,duplicate:z.boolean()}).strict()).max(12),created:count,note:z.string()}).strict(),
 change:z.object({changed:yes,duplicate:z.boolean(),cancelledSessionId:uuid,replacementSessionId:uuid.nullable()}).strict(),
 open:z.object({classSessionId:uuid,facilitatedSessionId:uuid,pairingCode:z.string().nullable(),pairingExpiresAt:z.string().datetime({offset:true}).nullable(),alreadyStarted:z.boolean()}).strict(),
 revoke:z.object({revoked:yes,alreadyEnded:z.boolean()}).strict(),
 transfer:z.object({transferred:yes,duplicate:z.boolean(),facilitatedSessionId:uuid,currentFacilitatorPersonId:uuid}).strict(),
 agenda:z.object({classSessionId:uuid,revisionNo:z.number().int().positive(),duplicate:z.boolean()}).strict(),
};
const str={type:'string' as const},id={...str,format:'uuid'},bool={type:'boolean' as const},integer={type:'integer' as const,minimum:0},truth={...bool,enum:[true]},nullableId={...id,nullable:true};
const date={...str,format:'date-time'},reason={...str,minLength:15,maxLength:500};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,minItems?:number,maxItems?:number)=>({type:'array' as const,items,...(minItems?{minItems}:{}),...(maxItems?{maxItems}:{})});
const target={classId:id,classSessionId:id};
const window={startsAt:date,endsAt:date};
export const inputs={
 schedule:obj({classId:id,cadence:{...str,enum:['custom','weekly'],default:'custom'},meetings:arr(obj({requestId:id,...window}),1,12)},['classId','meetings']),
 change:obj({...target,requestId:id,reason,replacement:{...obj(window),nullable:true}}),
 open:obj(target),revoke:obj({...target,reason}),
 transfer:obj({...target,requestId:id,expectedFacilitatorPersonId:id,toPersonId:id,reason}),
 agenda:obj({...target,requestId:id,expectedRevisionNo:{...integer,maximum:1000},items:arr(obj({kind:{...str,enum:['study','watch','practice','assignment','assessment']},referenceId:id}),1,24)})
};
export const outputDocs={
 schedule:obj({classId:id,sessions:arr(obj({classSessionId:id,planId:id,duplicate:bool}),1,12),created:integer,note:str}),
 change:obj({changed:truth,duplicate:bool,cancelledSessionId:id,replacementSessionId:nullableId}),
 open:obj({classSessionId:id,facilitatedSessionId:id,pairingCode:{...str,nullable:true},pairingExpiresAt:{...date,nullable:true},alreadyStarted:bool}),
 revoke:obj({revoked:truth,alreadyEnded:bool}),
 transfer:obj({transferred:truth,duplicate:bool,facilitatedSessionId:id,currentFacilitatorPersonId:id}),
 agenda:obj({classSessionId:id,revisionNo:{...integer,minimum:1},duplicate:bool}),
};

const titleItem=z.object({id:uuid,title:z.string()}).strict();
export const agendaParams=z.object({classId:uuid,classSessionId:uuid}).strict();
export const agendaResult=z.object({classId:uuid,classSessionId:uuid,courseVersionId:uuid,revisionNo:count,publishedAt:z.string().datetime({offset:true}).nullable(),startsAt:z.string().datetime({offset:true}),items:z.array(z.object({kind:z.enum(['study','watch','practice','assignment','assessment']),referenceId:uuid,title:z.string()}).strict()).max(24),canEdit:z.boolean(),options:z.object({lessons:z.array(titleItem).max(500),assignments:z.array(titleItem).max(500),assessments:z.array(titleItem).max(500)}).strict().nullable(),note:z.string()}).strict();
const titleDoc=obj({id,title:str});
export const agendaDoc=obj({...target,courseVersionId:id,revisionNo:integer,publishedAt:{...date,nullable:true},startsAt:date,items:arr(obj({kind:{...str,enum:['study','watch','practice','assignment','assessment']},referenceId:id,title:str}),undefined,24),canEdit:bool,options:{...obj({lessons:arr(titleDoc,undefined,500),assignments:arr(titleDoc,undefined,500),assessments:arr(titleDoc,undefined,500)}),nullable:true},note:str});

import {z} from 'zod';
const uuid=z.string().uuid(),str=z.string(),date=z.string().datetime({offset:true}),rating=z.number().int().min(1).max(5);
const questions=['clarity','technology','value'] as const;
const methods=['paper','shared_device','verbal'] as const;
const assisted=z.object({facilitatedSessionId:uuid,activityReleaseId:uuid,courseAttemptId:uuid,requestId:uuid,method:z.enum(methods),answerChoice:z.number().int().min(0).max(7).nullable(),answerText:str.trim().min(1).max(1000).nullable(),evidenceNote:str.trim().min(15).max(500)}).strict().refine(v=>(v.answerChoice===null)!==(v.answerText===null));
export const inputs={attempt:z.object({courseAttemptId:uuid}).strict(),enrollment:z.object({classEnrollmentId:uuid}).strict(),empty:z.object({}).strict(),feedback:z.object({facilitatedSessionId:uuid,questionKey:z.enum(questions),rating}).strict(),assisted};
export const results={
 feedbackHistory:z.object({rooms:z.array(z.object({facilitatedSessionId:uuid,startedAt:date,feedbackClosesAt:date,ratings:z.object({clarity:rating.optional(),technology:rating.optional(),value:rating.optional()}).strict()}).strict()).max(5),notice:str}).strict(),
 feedbackSaved:z.object({saved:z.literal(true),note:str}).strict(),
 assisted:z.object({recorded:z.literal(true),duplicate:z.boolean(),facilitatorAttributed:z.literal(true),notice:str.optional()}).strict(),
 participation:z.object({source:z.enum(['class','school','noncredit']),hasBaseline:z.boolean(),hasFinal:z.boolean()}).strict(),
 calendar:z.object({classTitle:str,siteName:str,sessions:z.array(z.object({id:uuid,startsAt:date,endsAt:date}).strict()).max(100)}).strict(),
};
const s={type:'string' as const},id={...s,format:'uuid'},b={type:'boolean' as const},t={...b,enum:[true]},dt={...s,format:'date-time'},r={type:'integer' as const,minimum:1,maximum:5};
const en=(values:readonly string[])=>({...s,enum:[...values]});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems:number)=>({type:'array' as const,items,maxItems});
export const bodies={
 feedback:obj({facilitatedSessionId:id,questionKey:en(questions),rating:r}),
 assisted:{...obj({facilitatedSessionId:id,activityReleaseId:id,courseAttemptId:id,requestId:id,method:en(methods),answerChoice:{type:'integer',minimum:0,maximum:7,nullable:true},answerText:{...s,minLength:1,maxLength:1000,nullable:true},evidenceNote:{...s,minLength:15,maxLength:500}}),description:'Exactly one of answerChoice and answerText must be non-null.'},
};
export const docs={
 feedbackHistory:obj({rooms:arr(obj({facilitatedSessionId:id,startedAt:dt,feedbackClosesAt:dt,ratings:obj({clarity:r,technology:r,value:r},[])}),5),notice:s}),
 feedbackSaved:obj({saved:t,note:s}),
 assisted:obj({recorded:t,duplicate:b,facilitatorAttributed:t,notice:s},['recorded','duplicate','facilitatorAttributed']),
 participation:obj({source:en(['class','school','noncredit']),hasBaseline:b,hasFinal:b}),
 calendar:obj({classTitle:s,siteName:s,sessions:arr(obj({id,startsAt:dt,endsAt:dt}),100)}),
};

import {z} from 'zod';
const uuid=z.string().uuid(),bool=z.boolean(),yes=z.literal(true),no=z.literal(false),str=z.string(),count=z.number().int().nonnegative(),date=z.string().datetime({offset:true});
export const roomParams=z.object({facilitatedSessionId:uuid}).strict();
export const learnerParams=roomParams.extend({courseAttemptId:uuid}).strict();
const prompt={id:uuid,prompt:str,answerType:z.enum(['single_choice','text']),choices:z.array(str).max(8)};
export const results={
 pairResult:z.object({facilitatedSessionId:uuid,paired:yes,note:str}).strict(),
 leftResult:z.object({left:bool}).strict(),
 renewResult:z.object({facilitatedSessionId:uuid,pairingCode:str,pairingExpiresAt:date,duplicate:bool}).strict(),
 endedResult:z.object({ended:yes,alreadyEnded:bool}).strict(),
 recordedResult:z.object({recorded:yes,duplicate:bool}).strict(),
 attendanceResult:z.object({saved:yes,duplicate:bool,noDeviceEvidence:bool,corrected:bool.optional(),notice:str.optional()}).strict(),
 projectorResult:z.object({accepted:yes,duplicate:bool,note:str}).strict(),
 activityResult:z.object({id:uuid,duplicate:bool}).strict(),
 closedResult:z.object({closed:bool,duplicate:bool}).strict(),
 responseResult:z.object({saved:yes,duplicate:bool,graded:no}).strict(),
 presenceResult:z.object({recorded:bool,duplicate:bool,throttled:bool}).strict(),
 choicesResult:z.object({choices:z.array(z.object({courseAttemptId:uuid,courseTitle:str,classId:uuid.nullable()}).strict()).max(90),notice:str}).strict(),
 rosterResult:z.object({facilitatedSessionId:uuid,attestationsOpen:bool,members:z.array(z.object({courseAttemptId:uuid,displayName:str,source:str,pairedDevice:bool,latestStatus:str,latestMethod:str.nullable(),lastAssertedAt:date.nullable()}).strict()),partial:bool,notice:str}).strict(),
 projectorReadResult:z.object({roomState:z.enum(['live','ended','expired','blocked']),latest:z.object({id:uuid,lessonId:uuid,assetVersionId:uuid,commandKind:str,positionSeconds:count,issuedAt:date}).strict().nullable(),note:str}).strict(),
 activitiesResult:z.object({activities:z.array(z.object({...prompt,closed:bool,releasedAt:date,responded:bool}).strict()).max(40),truncated:bool,notice:str}).strict(),
 presentationResult:z.object({roomState:str,current:z.object(prompt).strict().nullable(),note:str}).strict()
};
const s={type:'string' as const},id={...s,format:'uuid'},b={type:'boolean' as const},t={...b,enum:[true]},n={type:'integer' as const,minimum:0},dt={...s,format:'date-time'},nil={...id,nullable:true};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems?{maxItems}:{})});
const en=(values:string[])=>({...s,enum:values});
const room={facilitatedSessionId:id},learner={...room,courseAttemptId:id},media={...room,requestId:id,lessonId:id,assetVersionId:id},position={...n,maximum:43200};
const activity={id,prompt:s,answerType:en(['single_choice','text']),choices:arr(s,8)};
export const inputs={
 none:obj({}),room:obj(room),learner:obj(learner),
 pair:obj({courseAttemptId:id,pairingCode:{...s,minLength:10,maxLength:11}}),
 renew:obj({...room,requestId:id},['facilitatedSessionId']),
 playback:obj({...media,kind:en(['opened','played','paused','ended']),positionSeconds:{...position,nullable:true}}),
 attendance:obj({...learner,requestId:id,status:en(['present','absent','unknown']),method:en(['in_person_roll_call','remote_live_check']),evidenceNote:{...s,maxLength:250,nullable:true}}),
 projector:obj({...media,commandKind:en(['load','play','pause','seek','stop']),positionSeconds:position}),
 activity:obj({...room,requestId:id,lessonId:nil,prompt:{...s,minLength:5,maxLength:1000},answerType:activity.answerType,choices:arr({...s,minLength:1,maxLength:200},8)}),
 close:obj({...room,activityReleaseId:id}),
 response:obj({...learner,activityReleaseId:id,clientSubmissionId:id,clientInstanceId:id,answerChoice:{...n,maximum:7,nullable:true},answerText:{...s,minLength:1,maxLength:1000,nullable:true}}),
 presence:obj({...learner,clientInstanceId:id,clientEventId:id,eventKind:en(['joined','heartbeat','away','left'])}),
};
export const docs={
 pairResult:obj({...room,paired:t,note:s}),
 leftResult:obj({left:b}),
 renewResult:obj({...room,pairingCode:s,pairingExpiresAt:dt,duplicate:b}),
 endedResult:obj({ended:t,alreadyEnded:b}),
 recordedResult:obj({recorded:t,duplicate:b}),
 attendanceResult:obj({saved:t,duplicate:b,noDeviceEvidence:b,corrected:b,notice:s},['saved','duplicate','noDeviceEvidence']),
 projectorResult:obj({accepted:t,duplicate:b,note:s}),
 activityResult:obj({id,duplicate:b}),
 closedResult:obj({closed:b,duplicate:b}),
 responseResult:obj({saved:t,duplicate:b,graded:{...b,enum:[false]}}),
 presenceResult:obj({recorded:b,duplicate:b,throttled:b}),
 choicesResult:obj({choices:arr(obj({courseAttemptId:id,courseTitle:s,classId:nil}),90),notice:s}),
 rosterResult:obj({...room,attestationsOpen:b,members:arr(obj({courseAttemptId:id,displayName:s,source:s,pairedDevice:b,latestStatus:s,latestMethod:{...s,nullable:true},lastAssertedAt:{...dt,nullable:true}})),partial:b,notice:s}),
 projectorReadResult:obj({roomState:en(['live','ended','expired','blocked']),latest:{...obj({id,lessonId:id,assetVersionId:id,commandKind:s,positionSeconds:n,issuedAt:dt}),nullable:true},note:s}),
 activitiesResult:obj({activities:arr(obj({...activity,closed:b,releasedAt:dt,responded:b}),40),truncated:b,notice:s}),
 presentationResult:obj({roomState:s,current:{...obj(activity),nullable:true},note:s})
};

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

export const attemptParams=z.object({courseAttemptId:uuid}).strict();
const playback=z.object({roomId:uuid,kind:z.enum(['opened','played','paused','ended']),lessonId:uuid,assetVersionId:uuid,positionSeconds:count.nullable(),occurredAt:date}).strict();
export const mediaResults={
 list:z.object({facilitatedSessionId:uuid,media:z.array(z.object({lessonId:uuid,lessonTitle:str,assetVersionId:uuid,trackVersionId:uuid}).strict()).max(25),truncated:bool,note:str}).strict(),
 access:z.object({downloadUrl:z.string().url().refine(v=>v.startsWith('https://')),expiresInSeconds:z.union([z.literal(0),z.literal(30)])}).strict(),
 joined:z.object({rooms:z.array(z.object({facilitatedSessionId:uuid,siteId:uuid,startedAt:date,latestPlayback:playback.nullable()}).strict()).max(5),notice:str}).strict(),
};
export const mediaDocs={
 list:obj({...room,media:arr(obj({lessonId:id,lessonTitle:s,assetVersionId:id,trackVersionId:id}),25),truncated:b,note:s}),
 request:obj({...room,lessonId:id,assetVersionId:id}),
 access:obj({downloadUrl:{...s,format:'uri'},expiresInSeconds:{...n,enum:[0,30]}}),
 joined:obj({rooms:arr(obj({...room,siteId:id,startedAt:dt,latestPlayback:{...obj({roomId:id,kind:en(['opened','played','paused','ended']),lessonId:id,assetVersionId:id,positionSeconds:{...n,nullable:true},occurredAt:dt}),nullable:true}}),5),notice:s})
};

const hostChoice={deploymentId:uuid,courseVersionId:uuid,courseTitle:str,siteId:uuid,deploymentName:str};
const hostPlayback=z.object({sessionId:uuid,kind:z.enum(['opened','played','paused','ended']),lessonId:uuid,assetVersionId:uuid,occurredAt:date}).strict();
const hostRoom={id:uuid,deploymentId:uuid,courseVersionId:uuid,siteId:uuid,hostOrganizationId:uuid,facilitatorPersonId:uuid,state:z.enum(['live','ended','expired']),expiresAt:date,pairedLearners:count,latestPlayback:hostPlayback.nullable(),startedAt:date,pairingExpiresAt:date,endedAt:date.nullable()};
export const hostResults={
 workspace:z.object({siteId:uuid,choices:z.array(z.object(hostChoice).strict()),rooms:z.array(z.object(hostRoom).strict()).max(30),asOf:date,note:str}).strict(),
 activity:z.object({roomState:z.enum(['live','ended','expired']),releases:z.array(z.object({...prompt,closed:bool,releasedAt:date,responseEvents:count,respondingLearners:count,choiceCounts:z.array(count).max(8)}).strict()).max(50),pairedCount:count,activeDevicesEstimate:count,partial:bool,labels:z.object({device:str,response:str}).strict()}).strict(),
};
const hostChoiceDoc=obj({deploymentId:id,courseVersionId:id,courseTitle:s,siteId:id,deploymentName:s});
const hostPlaybackDoc=obj({sessionId:id,kind:en(['opened','played','paused','ended']),lessonId:id,assetVersionId:id,occurredAt:dt});
const hostRoomDoc=obj({id,deploymentId:id,courseVersionId:id,siteId:id,hostOrganizationId:id,facilitatorPersonId:id,state:en(['live','ended','expired']),expiresAt:dt,pairedLearners:n,latestPlayback:{...hostPlaybackDoc,nullable:true},startedAt:dt,pairingExpiresAt:dt,endedAt:{...dt,nullable:true}});
export const hostDocs={
 workspace:obj({siteId:id,choices:arr(hostChoiceDoc),rooms:arr(hostRoomDoc,30),asOf:dt,note:s}),
 activity:obj({roomState:en(['live','ended','expired']),releases:arr(obj({...activity,closed:b,releasedAt:dt,responseEvents:n,respondingLearners:n,choiceCounts:arr(n,8)}),50),pairedCount:n,activeDevicesEstimate:n,partial:b,labels:obj({device:s,response:s})}),
};
export const emptyHostQuery=z.object({}).strict();

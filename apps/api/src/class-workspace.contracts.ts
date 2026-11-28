import {z} from 'zod';
const uuid=z.string().uuid(),str=z.string(),bool=z.boolean(),count=z.number().int().nonnegative(),date=z.string().datetime({offset:true}),nil=uuid.nullable();
const views=['learn','teach','manage'] as const;
const tabs=['overview','lessons','assignments','assessments','discussions','progress','sessions','classroom','roster','offering','reports','completion'] as const;
const view=z.enum(views),tab=z.enum(tabs);
const member={enrollmentId:uuid,personId:uuid,name:str,status:str,creditMode:str};
const candidate={personId:uuid,name:str};
const lesson={id:uuid,title:str,unitTitle:str,lessonOrder:z.number().int()};
const offering={id:uuid,state:str,versionNo:z.number().int(),visibility:str,enrollmentMethods:z.array(str),allowedCreditModes:z.array(str),capacity:count.nullable()};
const session={id:uuid,planId:nil,roomId:nil,roomState:str.nullable(),state:str,startsAt:date,endsAt:date,isMySession:bool,agendaRequired:bool,agendaReady:bool};
const learner={classEnrollmentId:uuid,courseAttemptId:uuid,creditMode:str,status:str};
const staff={...candidate,id:uuid,roleCode:str,attendanceAuthorized:bool};
export const params=z.object({classId:uuid}).strict();
export const queries={
 workspace:z.object({view:view.optional(),tab:str.trim().max(40).optional(),lesson:uuid.optional(),session:uuid.optional()}).strict(),
 roster:z.object({offset:str.regex(/^[0-9]{1,6}$/).default('0').transform(Number).pipe(count.max(100000))}).strict(),
};
export const results={
 workspace:z.object({classId:uuid,title:str,courseVersionId:uuid,siteId:nil,siteTimeZone:str,deliveryMode:z.enum(['self_paced','scheduled','facilitated','hybrid']),state:str,view,tab,availableViews:z.array(view).max(3),availableTabs:z.array(tab),learner:z.object(learner).strict().nullable(),staffRole:z.enum(['teacher','facilitator']).nullable(),canVerifyAttendance:bool,canControlRoom:bool,canViewRoster:bool,rosterCount:count,roster:z.array(z.object(member).strict()).max(100),rosterTruncated:bool,offering:z.object(offering).strict().nullable(),lessons:z.array(z.object(lesson).strict()).max(500),staffCandidates:z.array(z.object(candidate).strict()).max(100),staffAssignments:z.array(z.object(staff).strict()).max(100),learnerCandidates:z.array(z.object(candidate).strict()).max(101),sessions:z.array(z.object(session).strict()).max(100),sessionsTruncated:bool,sessionAgendasEnabled:bool,selectedLessonId:nil,selectedSessionId:nil}).strict(),
 roster:z.object({members:z.array(z.object({...member,courseAttemptId:nil}).strict()).max(50),total:count,nextOffset:count.nullable()}).strict(),
};
const s={type:'string' as const},id={...s,format:'uuid'},b={type:'boolean' as const},n={type:'integer' as const,minimum:0},dt={...s,format:'date-time'},ni={...id,nullable:true};
const en=(values:readonly string[])=>({...s,enum:[...values]});
const obj=(properties:Record<string,any>)=>({type:'object' as const,additionalProperties:false,properties,required:Object.keys(properties)});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems===undefined?{}:{maxItems})});
const memberDoc={enrollmentId:id,personId:id,name:s,status:s,creditMode:s},candidateDoc={personId:id,name:s};
const learnerDoc=obj({classEnrollmentId:id,courseAttemptId:id,creditMode:s,status:s});
const offeringDoc=obj({id,state:s,versionNo:n,visibility:s,enrollmentMethods:arr(s),allowedCreditModes:arr(s),capacity:{...n,nullable:true}});
const sessionDoc=obj({id,planId:ni,roomId:ni,roomState:{...s,nullable:true},state:s,startsAt:dt,endsAt:dt,isMySession:b,agendaRequired:b,agendaReady:b});
export const docs={
 workspace:obj({classId:id,title:s,courseVersionId:id,siteId:ni,siteTimeZone:s,deliveryMode:en(['self_paced','scheduled','facilitated','hybrid']),state:s,view:en(views),tab:en(tabs),availableViews:arr(en(views),3),availableTabs:arr(en(tabs)),learner:{...learnerDoc,nullable:true},staffRole:{...en(['teacher','facilitator']),nullable:true},canVerifyAttendance:b,canControlRoom:b,canViewRoster:b,rosterCount:n,roster:arr(obj(memberDoc),100),rosterTruncated:b,offering:{...offeringDoc,nullable:true},lessons:arr(obj({id,title:s,unitTitle:s,lessonOrder:{type:'integer'}}),500),staffCandidates:arr(obj(candidateDoc),100),staffAssignments:arr(obj({...candidateDoc,id,roleCode:s,attendanceAuthorized:b}),100),learnerCandidates:arr(obj(candidateDoc),101),sessions:arr(sessionDoc,100),sessionsTruncated:b,sessionAgendasEnabled:b,selectedLessonId:ni,selectedSessionId:ni}),
 roster:obj({members:arr(obj({...memberDoc,courseAttemptId:ni}),50),total:n,nextOffset:{...n,nullable:true}}),
};

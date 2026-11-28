import {z} from 'zod';
const uuid=z.string().uuid(),str=z.string(),bool=z.boolean(),count=z.number().int().nonnegative(),positive=z.number().int().positive(),num=z.number().finite().nullable(),date=z.string().datetime({offset:true}),nil=uuid.nullable(),txt=str.nullable();
const delivery=z.enum(['self_paced','scheduled','facilitated','hybrid']);
const teacherClass={classId:uuid,title:str,deliveryMode:delivery};
const learner={learnerPersonId:uuid,name:str};
const approvalSummary={approvalRequestId:uuid,learnerPersonId:uuid,classTitle:str,state:str,acceptedEnrollmentId:nil};
const enrollment={classEnrollmentId:uuid,classId:uuid,learnerPersonId:uuid,status:str,title:str};
const page=(item:z.ZodTypeAny)=>z.object({items:z.array(item).max(100),nextOffset:count.nullable()}).strict();
const idParam=z.object({classId:uuid}).strict();
const revisionParam=idParam.extend({submissionId:uuid}).strict();
const pageQuery=z.object({offset:z.string().regex(/^\d{1,7}$/).transform(Number).pipe(count.max(1000000)).optional()}).strict();
const revisionQuery=z.object({beforeRevision:z.string().regex(/^[1-9]\d{0,8}$/).transform(Number).optional()}).strict();
const historicalQuery=z.object({beforeId:uuid.optional()}).strict();
const empty=z.object({}).strict();
export const params={class:idParam,revision:revisionParam};
export const queries={page:pageQuery,revision:revisionQuery,historical:historicalQuery,none:empty,class:empty};
export const bodies={
 followUp:z.object({classEnrollmentId:uuid,assignmentId:uuid}).strict(),
 feedback:z.object({submissionId:uuid,feedback:str.trim().min(3).max(3000),practiceScore:z.number().int().min(0).max(10).nullable()}).strict(),
 request:z.object({classOfferingVersionId:uuid,learnerPersonId:uuid,requestId:uuid}).strict(),
 accept:z.object({approvalRequestId:uuid,creditMode:z.enum(['audit','not_applicable']),consentAccepted:z.literal(true)}).strict(),
 withdraw:z.object({classEnrollmentId:uuid}).strict()
};
export const results={
 teacherClasses:z.object({kind:z.literal('teacher'),classes:z.array(z.object(teacherClass).strict()).max(100)}).strict(),
 teacherToday:z.object({kind:z.literal('teacher'),classes:z.array(z.object({...teacherClass,enrollmentCount:count,reviewCount:count,overdueCount:count}).strict()).max(100)}).strict(),
 homework:z.object({items:z.array(z.object({id:uuid,studentName:str,assignmentTitle:str,status:str,responseText:str,teacherFeedback:txt,isPracticeSubmission:bool,practiceScore:num,practiceScoreMax:num,submittedAt:date.nullable()}).strict()).max(100),partial:bool,nextOffset:count.nullable()}).strict(),
 missing:page(z.object({classEnrollmentId:uuid,assignmentId:uuid,assignmentTitle:str,dueAt:date,status:str,followUpActionId:nil,assignedToAnotherTeacher:bool,studentName:str}).strict()),
 followUps:page(z.object({actionId:uuid,status:str,assignmentTitle:str,studentName:str}).strict()),
 followUp:z.object({actionId:nil,created:bool,assignedToAnotherTeacher:bool}).strict(),
 revisions:z.object({items:z.array(z.object({revisionNo:positive,status:str,responseText:str,practiceFeedback:txt,practiceScore:num,practiceScoreMax:num,submittedAt:date.nullable(),recordedAt:date,source:str}).strict()).max(20),nextBefore:positive.nullable()}).strict(),
 feedback:z.object({submissionId:uuid,status:z.literal('returned'),practiceOnly:z.literal(true)}).strict(),
 assessments:z.object({items:z.array(z.object({key:str,assessmentStatus:str,formStatus:str,administrationStatus:str,ready:bool}).strict()).max(50),partial:bool}).strict(),
 historical:z.object({items:z.array(z.object({id:uuid,kind:z.enum(['submission','section_grade']),title:str,learnerName:txt,status:str,attempt:count.nullable(),response:txt,feedback:txt,score:txt,maximum:txt,letterGrade:txt,submittedAt:txt,finalizedAt:txt}).strict()).max(20),nextBefore:nil}).strict(),
 learners:z.array(z.object(learner).strict()).max(100),
 approvals:z.array(z.object({...approvalSummary,classId:uuid,classOfferingVersionId:uuid,expiresAt:date,consentText:txt,allowedCreditModes:z.array(z.enum(['for_credit','audit','not_applicable']))}).strict()).max(100),
 enrollments:z.array(z.object(enrollment).strict()).max(100),
 community:z.object({learners:z.array(z.object(learner).strict()).max(100),approvals:z.array(z.object(approvalSummary).strict()).max(100),enrollments:z.array(z.object(enrollment).strict()).max(100)}).strict(),
 request:z.object({approvalRequestId:uuid,state:str,duplicate:bool}).strict(),
 accept:z.object({classEnrollmentId:uuid,courseAttemptId:uuid}).strict(),
 withdraw:z.object({alreadyWithdrawn:bool}).strict()
};
const s={type:'string' as const},id={...s,format:'uuid'},b={type:'boolean' as const},n={type:'integer' as const,minimum:0},pos={...n,minimum:1},dt={...s,format:'date-time'},nid={...id,nullable:true},ns={...s,nullable:true},nn={type:'number' as const,nullable:true};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems:number)=>({type:'array' as const,items,maxItems});
const en=(values:readonly string[])=>({...s,enum:[...values]});
const tc={classId:id,title:s,deliveryMode:en(delivery.options)};
const ld=obj({learnerPersonId:id,name:s});
const ad={approvalRequestId:id,learnerPersonId:id,classTitle:s,state:s,acceptedEnrollmentId:nid};
const ed=obj({classEnrollmentId:id,classId:id,learnerPersonId:id,status:s,title:s});
const nullableCount={...n,nullable:true};
const pageDoc=(item:Record<string,any>)=>obj({items:arr(obj(item),100),nextOffset:nullableCount});
export const inputDocs={
 followUp:obj({classEnrollmentId:id,assignmentId:id}),
 feedback:obj({submissionId:id,feedback:{...s,minLength:3,maxLength:3000},practiceScore:{...n,maximum:10,nullable:true}}),
 request:obj({classOfferingVersionId:id,learnerPersonId:id,requestId:id}),
 accept:obj({approvalRequestId:id,creditMode:en(['audit','not_applicable']),consentAccepted:{...b,enum:[true]}}),
 withdraw:obj({classEnrollmentId:id})
};
export const docs={
 teacherClasses:obj({kind:en(['teacher']),classes:arr(obj(tc),100)}),
 teacherToday:obj({kind:en(['teacher']),classes:arr(obj({...tc,enrollmentCount:n,reviewCount:n,overdueCount:n}),100)}),
 homework:obj({items:arr(obj({id,studentName:s,assignmentTitle:s,status:s,responseText:s,teacherFeedback:ns,isPracticeSubmission:b,practiceScore:nn,practiceScoreMax:nn,submittedAt:{...dt,nullable:true}}),100),partial:b,nextOffset:nullableCount}),
 missing:pageDoc({classEnrollmentId:id,assignmentId:id,assignmentTitle:s,dueAt:dt,status:s,followUpActionId:nid,assignedToAnotherTeacher:b,studentName:s}),
 followUps:pageDoc({actionId:id,status:s,assignmentTitle:s,studentName:s}),
 followUp:obj({actionId:nid,created:b,assignedToAnotherTeacher:b}),
 revisions:obj({items:arr(obj({revisionNo:pos,status:s,responseText:s,practiceFeedback:ns,practiceScore:nn,practiceScoreMax:nn,submittedAt:{...dt,nullable:true},recordedAt:dt,source:s}),20),nextBefore:{...pos,nullable:true}}),
 feedback:obj({submissionId:id,status:en(['returned']),practiceOnly:{...b,enum:[true]}}),
 assessments:obj({items:arr(obj({key:s,assessmentStatus:s,formStatus:s,administrationStatus:s,ready:b}),50),partial:b}),
 historical:obj({items:arr(obj({id,kind:en(['submission','section_grade']),title:s,learnerName:ns,status:s,attempt:nullableCount,response:ns,feedback:ns,score:ns,maximum:ns,letterGrade:ns,submittedAt:ns,finalizedAt:ns}),20),nextBefore:nid}),
 learners:arr(ld,100),
 approvals:arr(obj({...ad,classId:id,classOfferingVersionId:id,expiresAt:dt,consentText:ns,allowedCreditModes:arr(en(['for_credit','audit','not_applicable']),3)}),100),
 enrollments:arr(ed,100),
 community:obj({learners:arr(ld,100),approvals:arr(obj(ad),100),enrollments:arr(ed,100)}),
 request:obj({approvalRequestId:id,state:s,duplicate:b}),
 accept:obj({classEnrollmentId:id,courseAttemptId:id}),
 withdraw:obj({alreadyWithdrawn:b})
};

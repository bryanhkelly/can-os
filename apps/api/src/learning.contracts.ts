import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
export const enrollmentParams = z.object({classEnrollmentId:z.string().uuid()}).strict();
export function enrollmentId(params:unknown):string {
  const result=enrollmentParams.safeParse(params);
  if(!result.success)throw new BadRequestException();
  return result.data.classEnrollmentId;
}
const uuid=z.string().uuid();
const count=z.number().int().nonnegative();
export const resumeSchema=z.object({
  classId:uuid,title:z.string(),lesson:z.object({id:uuid,title:z.string()}).strict().nullable(),
  completed:count,total:count,
}).strict();
export const homeworkSchema=z.object({
  assignments:z.array(z.object({id:uuid,title:z.string(),dueAt:z.string().datetime().nullable(),
    status:z.string(),submittedAt:z.string().datetime().nullable()}).strict()).max(100),
}).strict();
const id={type:'string' as const,format:'uuid'};
const title={type:'string' as const};
const date={type:'string' as const,format:'date-time',nullable:true};
const integer={type:'integer' as const,minimum:0};
export const resumeDoc={type:'object' as const,additionalProperties:false,
  required:['classId','title','lesson','completed','total'],properties:{
    classId:id,title,lesson:{type:'object' as const,nullable:true,additionalProperties:false,
      required:['id','title'],properties:{id,title}},completed:integer,total:integer,
  }};
export const homeworkDoc={type:'object' as const,additionalProperties:false,required:['assignments'],
  properties:{assignments:{type:'array' as const,maxItems:100,items:{type:'object' as const,additionalProperties:false,
    required:['id','title','dueAt','status','submittedAt'],properties:{id,title,dueAt:date,status:title,submittedAt:date}}}}};

export function validated<T extends z.ZodTypeAny>(schema:T,value:unknown):z.infer<T>{
  const result=schema.safeParse(value);
  if(!result.success)throw new BadRequestException();
  return result.data;
}
export const lessonParams=enrollmentParams.extend({lessonId:uuid}).strict();
export const assignmentParams=enrollmentParams.extend({assignmentId:uuid}).strict();
export const emptyCommand=z.object({}).strict();
export const submissionBody=z.object({responseText:z.string().trim().min(5).max(20000)}).strict();
export const completionResult=z.object({recorded:z.literal(true),alreadyCompleted:z.boolean()}).strict();
export const submissionResult=z.object({submissionId:uuid,alreadySubmitted:z.boolean()}).strict();
export const emptyDoc={type:'object' as const,additionalProperties:false};
export const submissionBodyDoc={type:'object' as const,additionalProperties:false,required:['responseText'],properties:{responseText:{type:'string' as const,minLength:5,maxLength:20000}}};
export const completionDoc={type:'object' as const,additionalProperties:false,required:['recorded','alreadyCompleted'],properties:{recorded:{type:'boolean' as const,enum:[true]},alreadyCompleted:{type:'boolean' as const}}};
export const submissionResultDoc={type:'object' as const,additionalProperties:false,required:['submissionId','alreadySubmitted'],properties:{submissionId:id,alreadySubmitted:{type:'boolean' as const}}};

const iso=z.string().datetime();
const video=z.object({url:z.string(),title:z.string(),reviewStatus:z.string()}).strict();
const lesson=z.object({unitId:uuid,unitTitle:z.string(),unitOrder:z.number().int(),lessonId:uuid,lessonTitle:z.string(),lessonOrder:z.number().int(),progressStatus:z.string().nullable(),observedAt:iso.nullable(),lessonBody:z.string(),videoResources:z.array(video).max(10)}).strict();
const outcome=z.object({id:uuid,kind:z.string(),result:z.string(),recordedAt:iso}).strict();
const award=z.object({kind:z.string(),issuedAt:iso,revokedAt:iso.nullable()}).strict();
export const workspaceSchema=z.object({
 classId:uuid,classEnrollmentId:uuid,courseAttemptId:uuid,classTitle:z.string(),courseVersionId:uuid,
 enrollmentStatus:z.string(),creditMode:z.string(),lessons:z.array(lesson).max(500),outcomes:z.array(outcome).max(100),awards:z.array(award).max(100),
}).strict();
const signedInteger={type:'integer' as const};
const requiredDate={type:'string' as const,format:'date-time'};
const nullableText={type:'string' as const,nullable:true};
const obj=<T extends Record<string,unknown>>(properties:T)=>({type:'object' as const,additionalProperties:false,required:Object.keys(properties),properties});
const videoDoc=obj({url:title,title,reviewStatus:title});
const lessonDoc=obj({unitId:id,unitTitle:title,unitOrder:signedInteger,lessonId:id,lessonTitle:title,lessonOrder:signedInteger,progressStatus:nullableText,observedAt:date,lessonBody:title,videoResources:{type:'array' as const,maxItems:10,items:videoDoc}});
const outcomeDoc=obj({id,kind:title,result:title,recordedAt:requiredDate});
const awardDoc=obj({kind:title,issuedAt:requiredDate,revokedAt:date});
export const workspaceDoc=obj({
 classId:id,classEnrollmentId:id,courseAttemptId:id,classTitle:title,courseVersionId:id,enrollmentStatus:title,creditMode:title,
 lessons:{type:'array' as const,maxItems:500,items:lessonDoc},outcomes:{type:'array' as const,maxItems:100,items:outcomeDoc},awards:{type:'array' as const,maxItems:100,items:awardDoc},
});

const detailedAssignment=z.object({
 id:uuid,title:z.string(),dueAt:iso.nullable(),status:z.string(),submittedAt:iso.nullable(),
 instructions:z.string(),responseText:z.string(),practiceFeedback:z.string().nullable(),
 practiceScore:z.number().finite().nullable(),practiceScoreMax:z.number().finite().nullable(),submitted:z.boolean(),
}).strict();
export const homeworkWorkspaceSchema=z.object({courseAttemptId:uuid,legacySectionId:uuid.nullable(),assignments:z.array(detailedAssignment).max(100)}).strict();
const nullableNumber={type:'number' as const,nullable:true};
const detailedAssignmentDoc=obj({id,title,dueAt:date,status:title,submittedAt:date,instructions:title,responseText:title,practiceFeedback:nullableText,practiceScore:nullableNumber,practiceScoreMax:nullableNumber,submitted:{type:'boolean' as const}});
export const homeworkWorkspaceDoc=obj({courseAttemptId:id,legacySectionId:{...id,nullable:true},assignments:{type:'array' as const,maxItems:100,items:detailedAssignmentDoc}});

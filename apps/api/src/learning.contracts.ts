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

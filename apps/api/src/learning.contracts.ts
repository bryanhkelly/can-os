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

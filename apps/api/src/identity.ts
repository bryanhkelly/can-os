import { Controller, Get, Req, ForbiddenException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags, ApiOkResponse, ApiResponse } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CanonicalReadOperation, verifiedIdentity } from './security';
import { CanonicalIdentityService } from './identity.service';
import { problemOpenApiSchema } from './contracts';

const uuid = z.string().uuid();
const meSchema = z.object({
  personId: uuid, grantId: uuid, role: z.string().min(1),
  organizationIds: z.array(uuid), siteIds: z.array(uuid), programIds: z.array(uuid),
}).strict();
const classSchema = z.object({
  classId: uuid, title: z.string(), deliveryMode: z.enum(['self_paced','scheduled','facilitated','hybrid']),
  enrollmentId: uuid.nullable(), status: z.enum(['active','pending','not_enrolled']),
  courseAttemptId: uuid.nullable(), creditMode: z.enum(['for_credit','audit','not_applicable']).nullable(),
  canJoin: z.boolean(),
}).strict();
const studentClassesSchema = z.object({kind: z.literal('student'), classes: z.array(classSchema)}).strict();
const id = {type:'string' as const, format:'uuid'};
const ids = {type:'array' as const, items:id};
const nullableId = {...id, nullable:true};
const meProperties = {personId:id,grantId:id,role:{type:'string' as const,minLength:1},organizationIds:ids,siteIds:ids,programIds:ids};
const classProperties = {classId:id,title:{type:'string' as const},deliveryMode:{type:'string' as const,enum:['self_paced','scheduled','facilitated','hybrid']},
  enrollmentId:nullableId,status:{type:'string' as const,enum:['active','pending','not_enrolled']},courseAttemptId:nullableId,
  creditMode:{type:'string' as const,enum:['for_credit','audit','not_applicable'],nullable:true},canJoin:{type:'boolean' as const}};
const meDoc = {type:'object' as const,additionalProperties:false,required:Object.keys(meProperties),properties:meProperties};
const classDoc = {type:'object' as const,additionalProperties:false,required:Object.keys(classProperties),properties:classProperties};
@ApiTags('Identity')
@ApiCookieAuth('session')
@Controller('me')
export class IdentityController {
  constructor(private readonly identity:CanonicalIdentityService){}
  @Get()
  @CanonicalReadOperation()
  @ApiOperation({operationId:'getCurrentIdentity',summary:'Read current verified Person and membership scope'})
  @ApiOkResponse({schema:meDoc})
  @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  me(@Req() request:FastifyRequest){
    return this.identity.run(verifiedIdentity(request),async identity=>meSchema.parse(identity.me));
  }
  @Get('student/classes')
  @CanonicalReadOperation()
  @ApiOperation({operationId:'listMyStudentClasses',summary:'Discover classes through the exact current student Site membership'})
  @ApiOkResponse({schema:{type:'object',additionalProperties:false,required:['kind','classes'],properties:{kind:{type:'string',enum:['student']},classes:{type:'array',items:classDoc}}}})
  @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  classes(@Req() request:FastifyRequest){
    return this.identity.run(verifiedIdentity(request),async identity=>{
      if (meSchema.parse(identity.me).role !== 'student') throw new ForbiddenException();
      return studentClassesSchema.parse(await identity.readStudentClasses());
    });
  }
}

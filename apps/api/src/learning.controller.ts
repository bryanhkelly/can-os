import { Controller, Get, Param, Req, applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags, ApiOkResponse, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CanonicalReadOperation, verifiedIdentity } from './security';
import { CanonicalIdentityService } from './identity.service';
import { problemOpenApiSchema } from './contracts';
import { enrollmentId, resumeSchema, resumeDoc, homeworkSchema, homeworkDoc } from './learning.contracts';

function LearnerRead(){
  return applyDecorators(CanonicalReadOperation(),
    ApiParam({name:'classEnrollmentId',type:String,format:'uuid',required:true}),
    ...[400,401,403,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Learning')
@ApiCookieAuth('session')
@Controller('me/class-enrollments')
export class LearningController{
  constructor(private readonly identity:CanonicalIdentityService){}
  @Get(':classEnrollmentId/resume')
  @LearnerRead()
  @ApiOperation({operationId:'getMyClassResume',summary:'Read the next eligible lesson and progress for own active enrollment'})
  @ApiOkResponse({schema:resumeDoc})
  resume(@Req() request:FastifyRequest,@Param() params:unknown){
    const id=enrollmentId(params);
    return this.identity.run(verifiedIdentity(request),async actor=>resumeSchema.parse(await actor.readLearningResume(id)));
  }
  @Get(':classEnrollmentId/assignments')
  @LearnerRead()
  @ApiOperation({operationId:'listMyClassAssignments',summary:'Read own active enrollment assignment summaries (maximum 100)'})
  @ApiOkResponse({schema:homeworkDoc})
  assignments(@Req() request:FastifyRequest,@Param() params:unknown){
    const id=enrollmentId(params);
    return this.identity.run(verifiedIdentity(request),async actor=>homeworkSchema.parse(await actor.readHomeworkSummary(id)));
  }
}

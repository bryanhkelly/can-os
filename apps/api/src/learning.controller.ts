import { Controller, Get, Post, Body, HttpCode, Param, Query, Req, applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags, ApiOkResponse, ApiParam, ApiResponse, ApiBody, ApiHeader, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CanonicalReadOperation, CanonicalWriteOperation, verifiedIdentity } from './security';
import { CanonicalIdentityService } from './identity.service';
import { problemOpenApiSchema } from './contracts';
import { enrollmentId, workspaceSchema, workspaceDoc, homeworkWorkspaceSchema, homeworkWorkspaceDoc, resumeSchema, resumeDoc, homeworkSchema, homeworkDoc, validated, lessonParams, assignmentParams, emptyCommand, submissionBody, completionResult, submissionResult, emptyDoc, submissionBodyDoc, completionDoc, submissionResultDoc } from './learning.contracts';

import {queries as historyQueries,results as historyResults,docs as historyDocs} from './role-workspaces.contracts';

function LearnerRead(){
  return applyDecorators(CanonicalReadOperation(),
    ApiParam({name:'classEnrollmentId',type:String,format:'uuid',required:true}),
    ...[400,401,403,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
function LearnerWrite(resource:'lessonId'|'assignmentId'){
  return applyDecorators(CanonicalWriteOperation(),HttpCode(200),
    ApiHeader({name:'Origin',required:true,description:'Exact configured same-origin URL'}),
    ApiParam({name:'classEnrollmentId',type:String,format:'uuid',required:true}),
    ApiParam({name:resource,type:String,format:'uuid',required:true}),
    ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Learning')
@ApiCookieAuth('session')
@Controller('me/class-enrollments')
export class LearningController{
  constructor(private readonly identity:CanonicalIdentityService){}
  @Get(':classEnrollmentId/learning')
  @LearnerRead()
  @ApiOperation({operationId:'getMyClassLearning',summary:'Read own authorized class lesson workspace and recorded outcomes'})
  @ApiOkResponse({schema:workspaceDoc})
  workspace(@Req() request:FastifyRequest,@Param() params:unknown){
    const id=enrollmentId(params);
    return this.identity.run(verifiedIdentity(request),async actor=>workspaceSchema.parse(await actor.readLearningWorkspace(id)));
  }
  @Get(':classEnrollmentId/resume')
  @LearnerRead()
  @ApiOperation({operationId:'getMyClassResume',summary:'Read the next eligible lesson and progress for own active enrollment'})
  @ApiOkResponse({schema:resumeDoc})
  resume(@Req() request:FastifyRequest,@Param() params:unknown){
    const id=enrollmentId(params);
    return this.identity.run(verifiedIdentity(request),async actor=>resumeSchema.parse(await actor.readLearningResume(id)));
  }
  @Get(':classEnrollmentId/assignment-workspace')
  @LearnerRead()
  @ApiOperation({operationId:'getMyClassAssignmentWorkspace',summary:'Read own active enrollment assignment instructions, responses and practice feedback'})
  @ApiOkResponse({schema:homeworkWorkspaceDoc})
  assignmentWorkspace(@Req() request:FastifyRequest,@Param() params:unknown){
    const id=enrollmentId(params);
    return this.identity.run(verifiedIdentity(request),async actor=>homeworkWorkspaceSchema.parse(await actor.readHomeworkWorkspace(id)));
  }
  @Get(':classEnrollmentId/assignments')
  @LearnerRead()
  @ApiOperation({operationId:'listMyClassAssignments',summary:'Read own active enrollment assignment summaries (maximum 100)'})
  @ApiOkResponse({schema:homeworkDoc})
  assignments(@Req() request:FastifyRequest,@Param() params:unknown){
    const id=enrollmentId(params);
    return this.identity.run(verifiedIdentity(request),async actor=>homeworkSchema.parse(await actor.readHomeworkSummary(id)));
  }
  @Get(':classEnrollmentId/assignments/:assignmentId/revisions')
  @LearnerRead()
  @ApiParam({name:'assignmentId',type:String,format:'uuid',required:true})
  @ApiQuery({name:'beforeRevision',type:Number,required:false})
  @ApiOperation({operationId:'listMyAssignmentRevisions',summary:'Read own current assignment revision history, newest first'})
  @ApiOkResponse({schema:historyDocs.revisions})
  revisions(@Req() request:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
    const input={...validated(assignmentParams,params),...validated(historyQueries.revision,query)};
    return this.identity.run(verifiedIdentity(request),async actor=>historyResults.revisions.parse(await actor.readHomeworkHistory(input)));
  }
  @Get(':classEnrollmentId/historical-work')
  @LearnerRead()
  @ApiQuery({name:'beforeId',type:String,required:false})
  @ApiOperation({operationId:'listMyHistoricalClassWork',summary:'Read own preserved published school evidence under current student authority'})
  @ApiOkResponse({schema:historyDocs.historical})
  historical(@Req() request:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
    const input={classEnrollmentId:enrollmentId(params),...validated(historyQueries.historical,query)};
    return this.identity.run(verifiedIdentity(request),async actor=>historyResults.historical.parse(await actor.readHistoricalWork(input)));
  }
  @Post(':classEnrollmentId/lessons/:lessonId/completion')
  @LearnerWrite('lessonId')
  @ApiOperation({operationId:'completeMyLesson',summary:'Record own lesson completion; identical retry is acknowledged'})
  @ApiBody({schema:emptyDoc})
  @ApiOkResponse({schema:completionDoc})
  complete(@Req() request:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
    const ids=validated(lessonParams,params);validated(emptyCommand,body);
    return this.identity.run(verifiedIdentity(request),async actor=>completionResult.parse(await actor.completeLesson(ids.classEnrollmentId,ids.lessonId)));
  }
  @Post(':classEnrollmentId/assignments/:assignmentId/submission')
  @LearnerWrite('assignmentId')
  @ApiOperation({operationId:'submitMyAssignment',summary:'Submit own text homework; identical retry returns existing submission'})
  @ApiBody({schema:submissionBodyDoc})
  @ApiOkResponse({schema:submissionResultDoc})
  submit(@Req() request:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
    const ids=validated(assignmentParams,params);const input=validated(submissionBody,body);
    return this.identity.run(verifiedIdentity(request),async actor=>submissionResult.parse(await actor.submitHomework(ids.classEnrollmentId,ids.assignmentId,input.responseText)));
  }
}

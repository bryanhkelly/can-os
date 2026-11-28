import { Controller,Get,Post,Req,Param,Query,Body,HttpCode,applyDecorators } from '@nestjs/common';
import { ApiTags,ApiCookieAuth,ApiParam,ApiOperation,ApiOkResponse,ApiBody,ApiHeader,ApiResponse,ApiQuery } from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {CanonicalIdentityService} from './identity.service';
import {CanonicalReadOperation,CanonicalWriteOperation,verifiedIdentity} from './security';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './instructional.contracts';

function InstructionOperation(method:'GET'|'POST'){
 return applyDecorators(method==='GET'?CanonicalReadOperation():CanonicalWriteOperation(),
 ApiParam({name:'courseAttemptId',type:String,format:'uuid',required:true}),
 ...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Recorded instruction')
@ApiCookieAuth('session')
@Controller('me/course-attempts/:courseAttemptId')
export class InstructionalController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('instructors')
 @InstructionOperation('GET')
 @ApiOperation({operationId:'listMyRecordedInstructors',summary:'List eligible recorded presenters under current course policy'})
 @ApiOkResponse({schema:c.outputDocs.choices})
 choices(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const attempt=validated(c.attemptParams,params);
  validated(c.noQuery,query);
  return this.identity.run(verifiedIdentity(req),async actor=>c.output.choices.parse(await actor.instruction.choices(attempt.courseAttemptId)));
 }
 @Get('instruction')
 @InstructionOperation('GET')
 @ApiOperation({operationId:'getMyRecordedInstruction',summary:'Read selected published instructional track'})
 @ApiOkResponse({schema:c.outputDocs.selected})
 selected(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const attempt=validated(c.attemptParams,params);
  validated(c.noQuery,query);
  return this.identity.run(verifiedIdentity(req),async actor=>c.output.selected.parse(await actor.instruction.selected(attempt.courseAttemptId)));
 }
 @Get('practice-history')
 @InstructionOperation('GET')
 @ApiOperation({operationId:'getMyRecordedPracticeHistory',summary:'Read at most ten authorized formative practice attempts, newest first; continue using nextBeforeId'})
 @ApiQuery({name:"beforeId",required:false,type:String,description:"Opaque continuation from the preceding page in this course attempt"})
 @ApiOkResponse({schema:c.outputDocs.history})
 history(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const attempt=validated(c.attemptParams,params);
  const input={...attempt,...validated(c.historyQuery,query)};
  return this.identity.run(verifiedIdentity(req),async actor=>c.output.history.parse(await actor.instruction.history(input)));
 }
 @Post('instructor-selections')
 @InstructionOperation('POST')
 @ApiOperation({operationId:'selectMyRecordedInstructor',summary:'Select or switch presenter with expected revision and request ID'})
 @ApiBody({schema:c.inputDocs.select})
 @ApiOkResponse({schema:c.outputDocs.select})
 select(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const attempt=validated(c.attemptParams,params);
  const input={...attempt,...validated(c.input.select,body)};
  return this.identity.run(verifiedIdentity(req),async actor=>c.output.select.parse(await actor.instruction.select(input)));
 }
 @Post('instruction-asset-access')
 @InstructionOperation('POST')
 @ApiOperation({operationId:'getMyRecordedAssetAccess',summary:'Authorize short-lived access to a selected instructional asset'})
 @ApiBody({schema:c.inputDocs.download})
 @ApiOkResponse({schema:c.outputDocs.download})
 download(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const attempt=validated(c.attemptParams,params);
  const input={...attempt,...validated(c.input.download,body)};
  return this.identity.run(verifiedIdentity(req),async actor=>c.output.download.parse(await actor.instruction.download(input)));
 }
 @Post('recorded-lesson-completions')
 @InstructionOperation('POST')
 @ApiOperation({operationId:'completeMyRecordedLesson',summary:'Record canonical lesson completion under current track policy'})
 @ApiBody({schema:c.inputDocs.complete})
 @ApiOkResponse({schema:c.outputDocs.complete})
 complete(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const attempt=validated(c.attemptParams,params);
  const input={...attempt,...validated(c.input.complete,body)};
  return this.identity.run(verifiedIdentity(req),async actor=>c.output.complete.parse(await actor.instruction.complete(input)));
 }
 @Post('practice-attempts')
 @InstructionOperation('POST')
 @ApiOperation({operationId:'recordMyFormativePractice',summary:'Record formative practice for current selected presenter'})
 @ApiBody({schema:c.inputDocs.practice})
 @ApiOkResponse({schema:c.outputDocs.practice})
 practice(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const attempt=validated(c.attemptParams,params);
  const input={...attempt,...validated(c.input.practice,body)};
  return this.identity.run(verifiedIdentity(req),async actor=>c.output.practice.parse(await actor.instruction.practice(input)));
 }
}

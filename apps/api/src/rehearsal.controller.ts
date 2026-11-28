import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './rehearsal.contracts';
function RehearsalOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('canonical',method),ApiCookieAuth('session'),
 ...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Classroom rehearsal')
@Controller('classroom-rehearsal')
export class RehearsalController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('choices')
 @RehearsalOperation('GET')
 @ApiOperation({operationId:'getClassroomRehearsalChoices',summary:'List currently authorized facilitator rehearsal choices without learner participation'})
 @ApiOkResponse({schema:c.docs.choices})
 choices(@Req() req:FastifyRequest,@Query() query:unknown){
  validated(c.inputs.none,query);
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>c.results.choices.parse(await workflow.getClassroomRehearsalChoices(undefined)));
 }
 @Get('media')
 @RehearsalOperation('GET')
 @ApiOperation({operationId:'getClassroomRehearsalMedia',summary:'List currently approved rehearsal recordings'})
 @ApiQuery({name:'deploymentId',type:String,required:true,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'courseVersionId',type:String,required:true,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'siteId',type:String,required:true,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'adoptionId',type:String,required:true,schema:{type:'string',format:'uuid'}})
 @ApiOkResponse({schema:c.docs.media})
 media(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(c.inputs.scope,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>c.results.media.parse(await workflow.getClassroomRehearsalMedia(input)));
 }
 @Post('media-access')
 @RehearsalOperation('POST')
 @ApiOperation({operationId:'getClassroomRehearsalMediaAccess',summary:'Authorize current facilitator preview media; private links expire in 30 seconds'})
 @ApiBody({schema:c.inputDocs.media})
 @ApiOkResponse({schema:c.docs.access})
 access(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(c.inputs.media,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>c.results.access.parse(await workflow.getClassroomRehearsalMediaAccess(input)));
 }
 @Post('playback-events')
 @RehearsalOperation('POST')
 @ApiOperation({operationId:'recordClassroomRehearsalPlayback',summary:'Record rehearsal-only observation; identical request retry acknowledged'})
 @ApiBody({schema:c.inputDocs.playback})
 @ApiOkResponse({schema:c.docs.playback})
 playback(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(c.inputs.playback,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>c.results.playback.parse(await workflow.recordClassroomRehearsalPlayback(input)));
 }
}

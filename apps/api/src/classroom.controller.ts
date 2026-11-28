import {Controller,Get,Post,Body,Param,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {validated} from './learning.contracts';
import {problemOpenApiSchema} from './contracts';
import {inputs,results,outputDocs,agendaParams,agendaResult,agendaDoc} from './classroom.contracts';
function ClassroomCommand(){
 return applyDecorators(GovernedWorkflowOperation('canonical'),HttpCode(200),ApiHeader({name:'Origin',required:true}),ApiCookieAuth('session'),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Classroom sessions')
@Controller()
export class ClassroomController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('class-session-schedules')
 @ClassroomCommand()
 @ApiOperation({operationId:'scheduleNativeClassSessions',summary:'Schedule a bounded series of future Class meetings'})
 @ApiBody({schema:inputs.schedule})
 @ApiOkResponse({schema:outputDocs.schedule})
 scheduleNativeClassSessions(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>results.schedule.parse(await workflow.scheduleNativeClassSessions(body)));
 }
 @Post('class-session-schedule-changes')
 @ClassroomCommand()
 @ApiOperation({operationId:'changeNativeClassSessionSchedule',summary:'Cancel or replace an unopened Class Session'})
 @ApiBody({schema:inputs.change})
 @ApiOkResponse({schema:outputDocs.change})
 changeNativeClassSessionSchedule(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>results.change.parse(await workflow.changeNativeClassSessionSchedule(body)));
 }
 @Post('class-session-openings')
 @ClassroomCommand()
 @ApiOperation({operationId:'openNativeClassSession',summary:'Open exact scheduled Class Session with current assigned host'})
 @ApiBody({schema:inputs.open})
 @ApiOkResponse({schema:outputDocs.open})
 openNativeClassSession(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>results.open.parse(await workflow.openNativeClassSession(body)));
 }
 @Post('class-session-revocations')
 @ClassroomCommand()
 @ApiOperation({operationId:'revokeNativeClassSession',summary:'Emergency stop under independent current Site manager authority'})
 @ApiBody({schema:inputs.revoke})
 @ApiOkResponse({schema:outputDocs.revoke})
 revokeNativeClassSession(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>results.revoke.parse(await workflow.revokeNativeClassSession(body)));
 }
 @Post('classroom-control-transfers')
 @ClassroomCommand()
 @ApiOperation({operationId:'transferNativeClassroomControl',summary:'Independent manager-directed room control transfer'})
 @ApiBody({schema:inputs.transfer})
 @ApiOkResponse({schema:outputDocs.transfer})
 transferNativeClassroomControl(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>results.transfer.parse(await workflow.transferNativeClassroomControl(body)));
 }
 @Post('class-session-agenda-revisions')
 @ClassroomCommand()
 @ApiOperation({operationId:'publishNativeClassSessionAgenda',summary:'Publish immutable agenda revision from approved Course content'})
 @ApiBody({schema:inputs.agenda})
 @ApiOkResponse({schema:outputDocs.agenda})
 publishNativeClassSessionAgenda(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>results.agenda.parse(await workflow.publishNativeClassSessionAgenda(body)));
 }
 @Get('classes/:classId/sessions/:classSessionId/agenda')
 @GovernedWorkflowOperation('canonical','GET')
 @ApiCookieAuth('session')
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 @ApiParam({name:'classSessionId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'getNativeClassSessionAgenda',summary:'Read exact authorized Session agenda and current editable options'})
 @ApiOkResponse({schema:agendaDoc})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 agenda(@Req() req:FastifyRequest,@Param() params:unknown){
  const input=validated(agendaParams,params),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>agendaResult.parse(await workflow.getNativeClassSessionAgenda(input)));
 }
}

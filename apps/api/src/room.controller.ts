import {Controller,Get,Post,Body,Param,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService,type WorkflowMode} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import {inputs,results,docs,roomParams,learnerParams,attemptParams,mediaResults,mediaDocs,hostResults,hostDocs,emptyHostQuery} from './room.contracts';
import * as evidence from './learning-evidence.contracts';
function RoomOperation(mode:WorkflowMode,method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation(mode,method),ApiCookieAuth('session'),
 ...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),
 ...[400,401,403,409,415,429,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Classroom Connect')
@Controller()
export class RoomController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('me/course-attempts/:courseAttemptId/classroom-feedback')
 @RoomOperation('learner','GET')
 @ApiParam({name:'courseAttemptId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'getRecentClassroomFeedback',summary:'Read own feedback and eligible recently paired rooms; no attendance or grade evidence'})
 @ApiOkResponse({schema:evidence.docs.feedbackHistory})
 feedbackHistory(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  validated(evidence.inputs.empty,query);
  const input=validated(evidence.inputs.attempt,params),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>evidence.results.feedbackHistory.parse(await workflow.getRecentClassroomFeedback(input)));
 }
 @Post('me/course-attempts/:courseAttemptId/classroom-feedback')
 @RoomOperation('learner','POST')
 @ApiParam({name:'courseAttemptId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'submitClassroomFeedback',summary:'Save or revise own subjective rating within the current feedback window'})
 @ApiBody({schema:evidence.bodies.feedback})
 @ApiOkResponse({schema:evidence.docs.feedbackSaved})
 feedback(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(evidence.inputs.attempt,params),...validated(evidence.inputs.feedback,body)},workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>evidence.results.feedbackSaved.parse(await workflow.submitClassroomFeedback(input)));
 }
 @Post('classroom-assisted-activities')
 @RoomOperation('canonical','POST')
 @ApiOperation({operationId:'recordClassroomAssistedActivity',summary:'Record facilitator-attributed paper, verbal or shared-device practice evidence separately from learner submissions'})
 @ApiBody({schema:evidence.bodies.assisted})
 @ApiOkResponse({schema:evidence.docs.assisted})
 assisted(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(evidence.inputs.assisted,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>evidence.results.assisted.parse(await workflow.recordClassroomAssistedActivity(input)));
 }
 @Get('me/course-attempts/:courseAttemptId/participation-kind')
 @RoomOperation('learner','GET')
 @ApiParam({name:'courseAttemptId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'getLearnerCourseParticipationKind',summary:'Read authorized course participation source and baseline/final check availability'})
 @ApiOkResponse({schema:evidence.docs.participation})
 participationKind(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  validated(evidence.inputs.empty,query);
  const input=validated(evidence.inputs.attempt,params),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>evidence.results.participation.parse(await workflow.getLearnerCourseParticipationKind(input)));
 }
 @Get('me/class-enrollments/:classEnrollmentId/calendar')
 @RoomOperation('canonical','GET')
 @ApiParam({name:'classEnrollmentId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'getMyNativeClassCalendar',summary:'Read upcoming own authorized adult learner Class schedule; no pairing secrets'})
 @ApiOkResponse({schema:evidence.docs.calendar})
 calendar(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  validated(evidence.inputs.empty,query);
  const input=validated(evidence.inputs.enrollment,params),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>evidence.results.calendar.parse(await workflow.getMyNativeClassCalendar(input)));
 }
 @Get('me/facilitated-classroom-workspace')
 @RoomOperation('canonical','GET')
 @ApiOperation({operationId:'getMyFacilitatedClassroomWorkspace',summary:'Read facilitator-owned rooms and current authorized hosting choices'})
 @ApiOkResponse({schema:hostDocs.workspace})
 workspace(@Req() req:FastifyRequest,@Query() query:unknown){
  validated(emptyHostQuery,query);
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>hostResults.workspace.parse(await workflow.getFacilitatedHostWorkspace(undefined)));
 }
 @Get('classrooms/:facilitatedSessionId/host-activity')
 @RoomOperation('canonical','GET')
 @ApiParam({name:'facilitatedSessionId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'getClassroomHostActivity',summary:'Read bounded aggregate activity only for current authorized room host'})
 @ApiOkResponse({schema:hostDocs.activity})
 hostActivity(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  validated(emptyHostQuery,query);
  const body=validated(roomParams,params),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>hostResults.activity.parse(await workflow.getClassroomHostActivity(body)));
 }
 @Post('classroom-pairings')
 @RoomOperation('learner','POST')
 @ApiOperation({operationId:'pairWithFacilitatedRoom',summary:'classroom pairings — existing participant and room authority'})
 @ApiBody({schema:inputs.pair})
 @ApiOkResponse({schema:docs.pairResult})
 pairWithFacilitatedRoom(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.pairResult.parse(await workflow.pairWithFacilitatedRoom(body)));
 }
 @Post('classroom-departures')
 @RoomOperation('learner','POST')
 @ApiOperation({operationId:'leaveFacilitatedRoom',summary:'classroom departures — existing participant and room authority'})
 @ApiBody({schema:inputs.learner})
 @ApiOkResponse({schema:docs.leftResult})
 leaveFacilitatedRoom(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.leftResult.parse(await workflow.leaveFacilitatedRoom(body)));
 }
 @Post('classroom-pairing-renewals')
 @RoomOperation('canonical','POST')
 @ApiOperation({operationId:'renewFacilitatedLearningPairing',summary:'classroom pairing renewals — existing participant and room authority'})
 @ApiBody({schema:inputs.renew})
 @ApiOkResponse({schema:docs.renewResult})
 renewFacilitatedLearningPairing(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.renewResult.parse(await workflow.renewFacilitatedLearningPairing(body)));
 }
 @Post('classroom-closures')
 @RoomOperation('canonical','POST')
 @ApiOperation({operationId:'endFacilitatedLearningRoom',summary:'classroom closures — existing participant and room authority'})
 @ApiBody({schema:inputs.room})
 @ApiOkResponse({schema:docs.endedResult})
 endFacilitatedLearningRoom(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.endedResult.parse(await workflow.endFacilitatedLearningRoom(body)));
 }
 @Post('classroom-playback-events')
 @RoomOperation('canonical','POST')
 @ApiOperation({operationId:'recordFacilitatedPlayback',summary:'classroom playback events — existing participant and room authority'})
 @ApiBody({schema:inputs.playback})
 @ApiOkResponse({schema:docs.recordedResult})
 recordFacilitatedPlayback(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.recordedResult.parse(await workflow.recordFacilitatedPlayback(body)));
 }
 @Post('classroom-attestations')
 @RoomOperation('canonical','POST')
 @ApiOperation({operationId:'attestClassroomParticipation',summary:'classroom attestations — existing participant and room authority'})
 @ApiBody({schema:inputs.attendance})
 @ApiOkResponse({schema:docs.attendanceResult})
 attestClassroomParticipation(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.attendanceResult.parse(await workflow.attestClassroomParticipation(body)));
 }
 @Post('classroom-projector-commands')
 @RoomOperation('canonical','POST')
 @ApiOperation({operationId:'issueClassroomProjectorCommand',summary:'classroom projector commands — existing participant and room authority'})
 @ApiBody({schema:inputs.projector})
 @ApiOkResponse({schema:docs.projectorResult})
 issueClassroomProjectorCommand(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.projectorResult.parse(await workflow.issueClassroomProjectorCommand(body)));
 }
 @Post('classroom-activities')
 @RoomOperation('canonical','POST')
 @ApiOperation({operationId:'releaseClassroomActivity',summary:'classroom activities — existing participant and room authority'})
 @ApiBody({schema:inputs.activity})
 @ApiOkResponse({schema:docs.activityResult})
 releaseClassroomActivity(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.activityResult.parse(await workflow.releaseClassroomActivity(body)));
 }
 @Post('classroom-activity-closures')
 @RoomOperation('canonical','POST')
 @ApiOperation({operationId:'closeClassroomActivity',summary:'classroom activity closures — existing participant and room authority'})
 @ApiBody({schema:inputs.close})
 @ApiOkResponse({schema:docs.closedResult})
 closeClassroomActivity(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.closedResult.parse(await workflow.closeClassroomActivity(body)));
 }
 @Post('classroom-responses')
 @RoomOperation('learner','POST')
 @ApiOperation({operationId:'submitClassroomResponse',summary:'classroom responses — existing participant and room authority'})
 @ApiBody({schema:inputs.response})
 @ApiOkResponse({schema:docs.responseResult})
 submitClassroomResponse(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.responseResult.parse(await workflow.submitClassroomResponse(body)));
 }
 @Post('classroom-presence-events')
 @RoomOperation('learner','POST')
 @ApiOperation({operationId:'recordClassroomPresence',summary:'classroom presence events — existing participant and room authority'})
 @ApiBody({schema:inputs.presence})
 @ApiOkResponse({schema:docs.presenceResult})
 recordClassroomPresence(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.presenceResult.parse(await workflow.recordClassroomPresence(body)));
 }
 @Get('me/classroom-course-choices')
 @RoomOperation('learner','GET')
 @ApiOperation({operationId:'getClassroomConnectCourseChoices',summary:'me/classroom course choices — existing participant and room authority'})
 
 @ApiOkResponse({schema:docs.choicesResult})
 getClassroomConnectCourseChoices(@Req() req:FastifyRequest){
  const workflow=verifiedWorkflow(req);
  const body=undefined;
  return this.identity.runWorkflow(async()=>results.choicesResult.parse(await workflow.getClassroomConnectCourseChoices(body)));
 }
 @Get('classrooms/:facilitatedSessionId/attendance')
 @RoomOperation('canonical','GET')
 @ApiOperation({operationId:'getClassroomAttendanceRoster',summary:'classrooms/facilitatedSessionId/attendance — existing participant and room authority'})
 @ApiParam({name:'facilitatedSessionId',type:String,format:'uuid',required:true})
 @ApiOkResponse({schema:docs.rosterResult})
 getClassroomAttendanceRoster(@Req() req:FastifyRequest,@Param() params:unknown){
  const workflow=verifiedWorkflow(req);
  const body=validated(roomParams,params);
  return this.identity.runWorkflow(async()=>results.rosterResult.parse(await workflow.getClassroomAttendanceRoster(body)));
 }
 @Get('classrooms/:facilitatedSessionId/projector')
 @RoomOperation('canonical','GET')
 @ApiOperation({operationId:'getClassroomProjectorCommand',summary:'classrooms/facilitatedSessionId/projector — existing participant and room authority'})
 @ApiParam({name:'facilitatedSessionId',type:String,format:'uuid',required:true})
 @ApiOkResponse({schema:docs.projectorReadResult})
 getClassroomProjectorCommand(@Req() req:FastifyRequest,@Param() params:unknown){
  const workflow=verifiedWorkflow(req);
  const body=validated(roomParams,params);
  return this.identity.runWorkflow(async()=>results.projectorReadResult.parse(await workflow.getClassroomProjectorCommand(body)));
 }
 @Get('classrooms/:facilitatedSessionId/attempts/:courseAttemptId/activities')
 @RoomOperation('learner','GET')
 @ApiOperation({operationId:'getClassroomLearnerActivities',summary:'classrooms/facilitatedSessionId/attempts/courseAttemptId/activities — existing participant and room authority'})
 @ApiParam({name:'facilitatedSessionId',type:String,format:'uuid',required:true})
 @ApiParam({name:'courseAttemptId',type:String,format:'uuid',required:true})
 @ApiOkResponse({schema:docs.activitiesResult})
 getClassroomLearnerActivities(@Req() req:FastifyRequest,@Param() params:unknown){
  const workflow=verifiedWorkflow(req);
  const body=validated(learnerParams,params);
  return this.identity.runWorkflow(async()=>results.activitiesResult.parse(await workflow.getClassroomLearnerActivities(body)));
 }
 @Get('classrooms/:facilitatedSessionId/presentation')
 @RoomOperation('canonical','GET')
 @ApiOperation({operationId:'getClassroomPresentationState',summary:'classrooms/facilitatedSessionId/presentation — existing participant and room authority'})
 @ApiParam({name:'facilitatedSessionId',type:String,format:'uuid',required:true})
 @ApiOkResponse({schema:docs.presentationResult})
 getClassroomPresentationState(@Req() req:FastifyRequest,@Param() params:unknown){
  const workflow=verifiedWorkflow(req);
  const body=validated(roomParams,params);
  return this.identity.runWorkflow(async()=>results.presentationResult.parse(await workflow.getClassroomPresentationState(body)));
 }
 @Get('classrooms/:facilitatedSessionId/media')
 @RoomOperation('canonical','GET')
 @ApiParam({name:'facilitatedSessionId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'getFacilitatedRoomMedia',summary:'List only current authorized audience recordings'})
 @ApiOkResponse({schema:mediaDocs.list})
 media(@Req() req:FastifyRequest,@Param() params:unknown){
  const input=validated(roomParams,params),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>mediaResults.list.parse(await workflow.getFacilitatedRoomMedia(input)));
 }
 @Post('classroom-media-access')
 @RoomOperation('canonical','POST')
 @ApiOperation({operationId:'getFacilitatedRoomMediaAccess',summary:'Authorize short-lived media access for current room audience'})
 @ApiBody({schema:mediaDocs.request})
 @ApiOkResponse({schema:mediaDocs.access})
 mediaAccess(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>mediaResults.access.parse(await workflow.getFacilitatedRoomMediaAccess(body)));
 }
 @Get('me/course-attempts/:courseAttemptId/classrooms')
 @RoomOperation('learner','GET')
 @ApiParam({name:'courseAttemptId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'getLearnerFacilitatedRoom',summary:'Read only currently permitted joined rooms and playback intent'})
 @ApiOkResponse({schema:mediaDocs.joined})
 joined(@Req() req:FastifyRequest,@Param() params:unknown){
  const input=validated(attemptParams,params),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>mediaResults.joined.parse(await workflow.getLearnerFacilitatedRoom(input)));
 }
}

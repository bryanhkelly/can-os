import {Controller,Get,Post,Body,Param,Query,Req,HttpCode,applyDecorators,ForbiddenException} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService,type WorkflowMode} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './role-workspaces.contracts';
function RoleOperation(mode:WorkflowMode,method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation(mode,method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Teacher and guardian')
@Controller()
export class RoleWorkspacesController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('me/teacher/classes')
 @RoleOperation('can','GET')
 @ApiOperation({operationId:'getMyNativeTeachingClasses',summary:'get My Native Teaching Classes; current verified relationship or appointment required'})
 
 
 
 @ApiOkResponse({schema:c.docs.teacherClasses})
 async getMyNativeTeachingClasses(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getMyNativeTeachingClasses(input));
  if(value&&typeof value==='object'&&'kind' in value&&value.kind==='other')throw new ForbiddenException();
  return c.results.teacherClasses.parse(value);
 }
 @Get('me/teacher/today')
 @RoleOperation('can','GET')
 @ApiOperation({operationId:'getNativeTeacherToday',summary:'get Native Teacher Today; current verified relationship or appointment required'})
 
 
 
 @ApiOkResponse({schema:c.docs.teacherToday})
 async getNativeTeacherToday(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getNativeTeacherToday(input));
  if(value&&typeof value==='object'&&'kind' in value&&value.kind==='other')throw new ForbiddenException();
  return c.results.teacherToday.parse(value);
 }
 @Get('classes/:classId/teacher/homework')
 @RoleOperation('canonical','GET')
 @ApiOperation({operationId:'getNativeClassTeacherHomework',summary:'get Native Class Teacher Homework; current verified relationship or appointment required'})
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 
 @ApiQuery({name:'offset',required:false,type:Number})
 @ApiOkResponse({schema:c.docs.homework})
 async getNativeClassTeacherHomework(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.class,params),...validated(c.queries.page,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getNativeClassTeacherHomework(input));
  
  return c.results.homework.parse(value);
 }
 @Get('classes/:classId/teacher/missing-work')
 @RoleOperation('canonical','GET')
 @ApiOperation({operationId:'getNativeClassTeacherMissingWork',summary:'get Native Class Teacher Missing Work; current verified relationship or appointment required'})
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 
 @ApiQuery({name:'offset',required:false,type:Number})
 @ApiOkResponse({schema:c.docs.missing})
 async getNativeClassTeacherMissingWork(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.class,params),...validated(c.queries.page,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getNativeClassTeacherMissingWork(input));
  
  return c.results.missing.parse(value);
 }
 @Get('classes/:classId/teacher/follow-ups')
 @RoleOperation('canonical','GET')
 @ApiOperation({operationId:'getNativeClassTeacherOpenFollowUps',summary:'get Native Class Teacher Open Follow Ups; current verified relationship or appointment required'})
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 
 @ApiQuery({name:'offset',required:false,type:Number})
 @ApiOkResponse({schema:c.docs.followUps})
 async getNativeClassTeacherOpenFollowUps(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.class,params),...validated(c.queries.page,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getNativeClassTeacherOpenFollowUps(input));
  
  return c.results.followUps.parse(value);
 }
 @Post('classes/:classId/teacher/follow-ups')
 @RoleOperation('canonical','POST')
 @ApiOperation({operationId:'createNativeClassMissingWorkFollowUp',summary:'create Native Class Missing Work Follow Up; current verified relationship or appointment required'})
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 
 @ApiBody({schema:c.inputDocs.followUp})
 @ApiOkResponse({schema:c.docs.followUp})
 async createNativeClassMissingWorkFollowUp(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.class,params),...validated(c.bodies.followUp,body)};
  const value=await this.identity.runWorkflow(()=>workflow.createNativeClassMissingWorkFollowUp(input));
  
  return c.results.followUp.parse(value);
 }
 @Get('classes/:classId/teacher/homework/:submissionId/history')
 @RoleOperation('canonical','GET')
 @ApiOperation({operationId:'getNativeClassTeacherHomeworkHistory',summary:'get Native Class Teacher Homework History; current verified relationship or appointment required'})
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 @ApiParam({name:'submissionId',type:String,format:'uuid',required:true})
 @ApiQuery({name:'beforeRevision',required:false,type:Number})
 @ApiOkResponse({schema:c.docs.revisions})
 async getNativeClassTeacherHomeworkHistory(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.revision,params),...validated(c.queries.revision,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getNativeClassTeacherHomeworkHistory(input));
  
  return c.results.revisions.parse(value);
 }
 @Post('classes/:classId/teacher/practice-feedback')
 @RoleOperation('canonical','POST')
 @ApiOperation({operationId:'returnNativeClassPracticeFeedback',summary:'return Native Class Practice Feedback; current verified relationship or appointment required'})
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 
 @ApiBody({schema:c.inputDocs.feedback})
 @ApiOkResponse({schema:c.docs.feedback})
 async returnNativeClassPracticeFeedback(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.class,params),...validated(c.bodies.feedback,body)};
  const value=await this.identity.runWorkflow(()=>workflow.returnNativeClassPracticeFeedback(input));
  
  return c.results.feedback.parse(value);
 }
 @Get('classes/:classId/teacher/assessment-readiness')
 @RoleOperation('canonical','GET')
 @ApiOperation({operationId:'getNativeClassTeacherAssessments',summary:'get Native Class Teacher Assessments; current verified relationship or appointment required'})
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 
 
 @ApiOkResponse({schema:c.docs.assessments})
 async getNativeClassTeacherAssessments(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.class,params),...validated(c.queries.class,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getNativeClassTeacherAssessments(input));
  
  return c.results.assessments.parse(value);
 }
 @Get('classes/:classId/teacher/historical-work')
 @RoleOperation('canonical','GET')
 @ApiOperation({operationId:'getNativeClassTeacherHistoricalWork',summary:'get Native Class Teacher Historical Work; current verified relationship or appointment required'})
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 
 @ApiQuery({name:'beforeId',required:false,type:String})
 @ApiOkResponse({schema:c.docs.historical})
 async getNativeClassTeacherHistoricalWork(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.class,params),...validated(c.queries.historical,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getNativeClassTeacherHistoricalWork(input));
  
  return c.results.historical.parse(value);
 }
 @Get('me/guardian/learners')
 @RoleOperation('can','GET')
 @ApiOperation({operationId:'getMyNativeGuardianLearners',summary:'get My Native Guardian Learners; current verified relationship or appointment required'})
 
 
 
 @ApiOkResponse({schema:c.docs.learners})
 async getMyNativeGuardianLearners(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getMyNativeGuardianLearners(input));
  
  return c.results.learners.parse(value);
 }
 @Get('me/guardian/class-approvals')
 @RoleOperation('can','GET')
 @ApiOperation({operationId:'getMyNativeGuardianClassApprovals',summary:'get My Native Guardian Class Approvals; current verified relationship or appointment required'})
 
 
 
 @ApiOkResponse({schema:c.docs.approvals})
 async getMyNativeGuardianClassApprovals(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getMyNativeGuardianClassApprovals(input));
  
  return c.results.approvals.parse(JSON.parse(JSON.stringify(value)));
 }
 @Get('me/guardian/class-enrollments')
 @RoleOperation('can','GET')
 @ApiOperation({operationId:'getMyNativeGuardianClassEnrollments',summary:'get My Native Guardian Class Enrollments; current verified relationship or appointment required'})
 
 
 
 @ApiOkResponse({schema:c.docs.enrollments})
 async getMyNativeGuardianClassEnrollments(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getMyNativeGuardianClassEnrollments(input));
  
  return c.results.enrollments.parse(value);
 }
 @Get('me/guardian/community')
 @RoleOperation('can','GET')
 @ApiOperation({operationId:'getGuardianCommunitySummary',summary:'get Guardian Community Summary; current verified relationship or appointment required'})
 
 
 
 @ApiOkResponse({schema:c.docs.community})
 async getGuardianCommunitySummary(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getGuardianCommunitySummary(input));
  
  return c.results.community.parse(value);
 }
 @Post('guardian-class-approval-requests')
 @RoleOperation('can','POST')
 @ApiOperation({operationId:'requestNativeGuardianClassApproval',summary:'request Native Guardian Class Approval; current verified relationship or appointment required'})
 
 
 @ApiBody({schema:c.inputDocs.request})
 @ApiOkResponse({schema:c.docs.request})
 async requestNativeGuardianClassApproval(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.bodies.request,body)};
  const value=await this.identity.runWorkflow(()=>workflow.requestNativeGuardianClassApproval(input));
  
  return c.results.request.parse(value);
 }
 @Post('guardian-class-approval-acceptances')
 @RoleOperation('can','POST')
 @ApiOperation({operationId:'acceptNativeGuardianClassApproval',summary:'accept Native Guardian Class Approval; current verified relationship or appointment required'})
 
 
 @ApiBody({schema:c.inputDocs.accept})
 @ApiOkResponse({schema:c.docs.accept})
 async acceptNativeGuardianClassApproval(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.bodies.accept,body)};
  const value=await this.identity.runWorkflow(()=>workflow.acceptNativeGuardianClassApproval(input));
  
  return c.results.accept.parse(value);
 }
 @Post('guardian-class-withdrawals')
 @RoleOperation('can','POST')
 @ApiOperation({operationId:'withdrawMyGuardianNativeClassEnrollment',summary:'withdraw My Guardian Native Class Enrollment; current verified relationship or appointment required'})
 
 
 @ApiBody({schema:c.inputDocs.withdraw})
 @ApiOkResponse({schema:c.docs.withdraw})
 async withdrawMyGuardianNativeClassEnrollment(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.bodies.withdraw,body)};
  const value=await this.identity.runWorkflow(()=>workflow.withdrawMyGuardianNativeClassEnrollment(input));
  
  return c.results.withdraw.parse(value);
 }
}

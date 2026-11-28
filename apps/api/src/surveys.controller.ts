import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService,type WorkflowMode} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './surveys.contracts';
function SurveyOperation(mode:WorkflowMode,method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation(mode,method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Canonical surveys')
@Controller()
export class SurveysController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('survey-drafts')
 @SurveyOperation('canonical','GET')
 @ApiOperation({operationId:'readCanonicalSurveyDraftAccess',summary:'read Canonical Survey Draft Access; verified canonical authority'})
 
 @ApiOkResponse({schema:c.docs.drafts})
 async readCanonicalSurveyDraftAccess(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.empty,query);
  return c.results.drafts.parse(await this.identity.runWorkflow(()=>workflow.readCanonicalSurveyDraftAccess(input)));
 }
 @Post('survey-drafts')
 @SurveyOperation('canonical','POST')
 @ApiOperation({operationId:'createCanonicalSurveyDraft',summary:'create Canonical Survey Draft; verified canonical authority'})
 @ApiBody({schema:c.inputs.draft})
 @ApiOkResponse({schema:c.docs.draftReceipt})
 async createCanonicalSurveyDraft(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.draftReceipt.parse(await this.identity.runWorkflow(()=>workflow.createCanonicalSurveyDraft(input)));
 }
 @Get('survey-review-queue')
 @SurveyOperation('canonical','GET')
 @ApiOperation({operationId:'readCanonicalSurveyReviewQueue',summary:'read Canonical Survey Review Queue; verified canonical authority'})
 
 @ApiOkResponse({schema:c.docs.queue})
 async readCanonicalSurveyReviewQueue(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.empty,query);
  return c.results.queue.parse(await this.identity.runWorkflow(()=>workflow.readCanonicalSurveyReviewQueue(input)));
 }
 @Get('survey-publication-queue')
 @SurveyOperation('canonical','GET')
 @ApiOperation({operationId:'readCanonicalSurveyPublicationQueue',summary:'read Canonical Survey Publication Queue; verified canonical authority'})
 
 @ApiOkResponse({schema:c.docs.queue})
 async readCanonicalSurveyPublicationQueue(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.empty,query);
  return c.results.queue.parse(await this.identity.runWorkflow(()=>workflow.readCanonicalSurveyPublicationQueue(input)));
 }
 @Post('survey-reviews')
 @SurveyOperation('canonical','POST')
 @ApiOperation({operationId:'recordCanonicalSurveyReview',summary:'record Canonical Survey Review; verified canonical authority'})
 @ApiBody({schema:c.inputs.review})
 @ApiOkResponse({schema:c.docs.reviewReceipt})
 async recordCanonicalSurveyReview(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.reviewReceipt.parse(await this.identity.runWorkflow(()=>workflow.recordCanonicalSurveyReview(input)));
 }
 @Post('survey-publications')
 @SurveyOperation('canonical','POST')
 @ApiOperation({operationId:'publishCanonicalSurveyVersion',summary:'publish Canonical Survey Version; verified canonical authority'})
 @ApiBody({schema:c.inputs.publish})
 @ApiOkResponse({schema:c.docs.publication})
 async publishCanonicalSurveyVersion(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.publication.parse(await this.identity.runWorkflow(()=>workflow.publishCanonicalSurveyVersion(input)));
 }
 @Get('course-surveys')
 @SurveyOperation('learner','GET')
 @ApiOperation({operationId:'listNoncreditCourseSurveys',summary:'list Noncredit Course Surveys; verified learner authority'})
 @ApiQuery({name:'courseAttemptId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.docs.courseList})
 async listNoncreditCourseSurveys(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.course,query);
  return c.results.courseList.parse(await this.identity.runWorkflow(()=>workflow.listNoncreditCourseSurveys(input)));
 }
 @Get('course-survey')
 @SurveyOperation('learner','GET')
 @ApiOperation({operationId:'getCourseSurvey',summary:'get Course Survey; verified learner authority'})
 @ApiQuery({name:'courseAttemptId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'campaignId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.docs.courseSurvey})
 async getCourseSurvey(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.scope,query);
  return c.results.courseSurvey.parse(await this.identity.runWorkflow(()=>workflow.getCourseSurvey(input)));
 }
 @Post('course-survey-responses')
 @SurveyOperation('learner','POST')
 @ApiOperation({operationId:'submitCourseSurvey',summary:'submit Course Survey; verified learner authority'})
 @ApiBody({schema:c.inputs.submission})
 @ApiOkResponse({schema:c.docs.response})
 async submitCourseSurvey(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.response.parse(await this.identity.runWorkflow(()=>workflow.submitCourseSurvey(input)));
 }

 @Get('class-survey-campaign-options')
 @SurveyOperation('canonical','GET')
 @ApiOperation({operationId:'getNativeClassSurveyCampaignOptions',summary:'get Native Class Survey Campaign Options; verified canonical authority'})
 @ApiQuery({name:'classId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.classRoomDocs.classOptions})
 async getNativeClassSurveyCampaignOptions(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.classQuery,query);
  return c.classRoomResults.classOptions.parse(await this.identity.runWorkflow(()=>workflow.getNativeClassSurveyCampaignOptions(input)));
 }

 @Post('class-survey-campaign-links')
 @SurveyOperation('canonical','POST')
 @ApiOperation({operationId:'linkNativeClassSurveyCampaign',summary:'link Native Class Survey Campaign; verified canonical authority'})
 @ApiBody({schema:c.classRoomInputs.classLink})
 @ApiOkResponse({schema:c.classRoomDocs.classLink})
 async linkNativeClassSurveyCampaign(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.classRoomResults.classLink.parse(await this.identity.runWorkflow(()=>workflow.linkNativeClassSurveyCampaign(input)));
 }

 @Get('classroom-survey-options')
 @SurveyOperation('canonical','GET')
 @ApiOperation({operationId:'getClassroomSurveyOptions',summary:'get Classroom Survey Options; verified canonical authority'})
 @ApiQuery({name:'facilitatedSessionId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.classRoomDocs.roomOptions})
 async getClassroomSurveyOptions(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.roomQuery,query);
  return c.classRoomResults.roomOptions.parse(await this.identity.runWorkflow(()=>workflow.getClassroomSurveyOptions(input)));
 }

 @Post('classroom-survey-links')
 @SurveyOperation('canonical','POST')
 @ApiOperation({operationId:'attachClassroomSurvey',summary:'attach Classroom Survey; verified canonical authority'})
 @ApiBody({schema:c.classRoomInputs.roomLink})
 @ApiOkResponse({schema:c.classRoomDocs.roomLink})
 async attachClassroomSurvey(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.classRoomResults.roomLink.parse(await this.identity.runWorkflow(()=>workflow.attachClassroomSurvey(input)));
 }

 @Get('classroom-learner-surveys')
 @SurveyOperation('learner','GET')
 @ApiOperation({operationId:'getClassroomLearnerSurveys',summary:'get Classroom Learner Surveys; verified learner authority'})
 @ApiQuery({name:'facilitatedSessionId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'courseAttemptId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.classRoomDocs.roomLearner})
 async getClassroomLearnerSurveys(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.roomLearnerQuery,query);
  return c.classRoomResults.roomLearner.parse(await this.identity.runWorkflow(()=>workflow.getClassroomLearnerSurveys(input)));
 }
}

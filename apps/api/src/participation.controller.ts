import {Controller,Post,Req,Res,Body,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService,type WorkflowMode} from './identity.service';
import {validated} from './learning.contracts';
import {problemOpenApiSchema} from './contracts';
import {docs,registrationReceipt,enrollmentResult,readyReceipt,emptyCommand,readyDoc,emptyDoc} from './participation.contracts';
function Command(mode:WorkflowMode){
 return applyDecorators(GovernedWorkflowOperation(mode),HttpCode(200),ApiHeader({name:'Origin',required:true}),ApiCookieAuth('session'),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Participation')
@Controller()
export class ParticipationController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('noncredit-registrations')
 @Command('can')
 @ApiOperation({operationId:'registerNoncredit',summary:'Verified adult registration, Course Attempt and governed Class placement; receipt distinguishes each record'})
 @ApiBody({schema:docs.registration})
 @ApiOkResponse({schema:docs.registrationResult,headers:{'Set-Cookie':{schema:{type:'string'},description:'Existing restricted learner-session cookie; never returned in JSON'}}})
 async register(@Req() req:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const receipt=await this.identity.runWorkflow(async()=>registrationReceipt.parse(await workflow.registerNoncredit(body)));
  reply.header('Set-Cookie',receipt.cookie);
  reply.header('Referrer-Policy','no-referrer');
  return receipt.result;
 }
 @Post('class-enrollments')
 @Command('canonical')
 @ApiOperation({operationId:'enrollNativeClass',summary:'Verified adult Class enrollment under exact published terms'})
 @ApiBody({schema:docs.enrollment})
 @ApiOkResponse({schema:docs.enrollmentResult})
 enroll(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>enrollmentResult.parse(await workflow.enrollNativeClass(body)));
 }
 @Post('me/learning-session/resume')
 @Command('can')
 @ApiOperation({operationId:'resumeLinkedNativeClassLearner',summary:'Resume previously verified learner binding; no new enrollment'})
 @ApiBody({schema:emptyDoc})
 @ApiOkResponse({schema:readyDoc})
 async resumeLinkedNativeClassLearner(@Req() req:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply,@Body() body:unknown){
  validated(emptyCommand,body);
  const workflow=verifiedWorkflow(req);
  const receipt=await this.identity.runWorkflow(async()=>readyReceipt.parse(await workflow.resumeLinkedNativeClassLearner(undefined)));
  reply.header('Set-Cookie',receipt.cookie);reply.header('Referrer-Policy','no-referrer');
  return receipt.result;
 }
 @Post('me/learning-session/activate')
 @Command('can')
 @ApiOperation({operationId:'activateReviewedNativeClassLearner',summary:'Consume existing independent adult review; no new enrollment'})
 @ApiBody({schema:emptyDoc})
 @ApiOkResponse({schema:readyDoc})
 async activateReviewedNativeClassLearner(@Req() req:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply,@Body() body:unknown){
  validated(emptyCommand,body);
  const workflow=verifiedWorkflow(req);
  const receipt=await this.identity.runWorkflow(async()=>readyReceipt.parse(await workflow.activateReviewedNativeClassLearner(undefined)));
  reply.header('Set-Cookie',receipt.cookie);reply.header('Referrer-Policy','no-referrer');
  return receipt.result;
 }
}

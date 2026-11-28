import {Controller,Get,Post,Req,Res,Body,Query,HttpCode,Header,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService,type WorkflowMode} from './identity.service';
import {validated} from './learning.contracts';
import {problemOpenApiSchema} from './contracts';
import {docs,registrationReceipt,enrollmentResult,readyReceipt,emptyCommand,readyDoc,emptyDoc} from './participation.contracts';
import {waitlistJoinInput,waitlistCancelInput,withdrawRegistrationInput,waitlistQuery,waitlistJoinResult,waitlistCancelResult,withdrawRegistrationResult,waitlistPageResult,participationDocs as p} from './participation.contracts';
import * as admission from './participation.contracts';
function Command(mode:WorkflowMode){
 return applyDecorators(GovernedWorkflowOperation(mode),HttpCode(200),ApiHeader({name:'Origin',required:true}),ApiCookieAuth('session'),...(mode==='canonical'?[ApiCookieAuth('nativeSession')]:[]),
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

 @Post('noncredit-waitlist-entries')
 @Command('can')
 @ApiOperation({operationId:'joinNoncreditWaitlist',summary:'Join a full published release queue without creating a registration, attempt, or enrollment'})
 @ApiBody({schema:p.join})
 @ApiOkResponse({schema:p.joinResult})
 joinWaitlist(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(waitlistJoinInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>waitlistJoinResult.parse(await workflow.joinNoncreditWaitlist(input)));
 }
 @Post('noncredit-waitlist-cancellations')
 @Command('can')
 @ApiOperation({operationId:'cancelMyNoncreditWaitlist',summary:'Cancel only the current verified Person’s queue entry; accepted entries require withdrawal'})
 @ApiBody({schema:p.cancel})
 @ApiOkResponse({schema:p.cancelResult})
 cancelWaitlist(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(waitlistCancelInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>waitlistCancelResult.parse(await workflow.cancelMyNoncreditWaitlist(input)));
 }
 @Get('me/noncredit-waitlist')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @ApiOperation({operationId:'getMyNoncreditWaitlistPage',summary:'Read only the current verified Person’s active waitlist records; cursor fields must be supplied together'})
 @ApiQuery({name:'joinedAt',required:false,type:String,format:'date-time'})
 @ApiQuery({name:'waitlistId',required:false,type:String,format:'uuid'})
 @ApiQuery({name:'releaseId',required:false,type:String,format:'uuid'})
 @ApiOkResponse({schema:p.page})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 waitlist(@Req() req:FastifyRequest,@Query() query:unknown){
  const q=validated(waitlistQuery,query),workflow=verifiedWorkflow(req);
  const cursor=q.joinedAt&&q.waitlistId?{joinedAt:q.joinedAt,waitlistId:q.waitlistId}:null;
  return this.identity.runWorkflow(async()=>waitlistPageResult.parse(await workflow.getMyNoncreditWaitlistPage({cursor,releaseId:q.releaseId})));
 }
 @Post('noncredit-registration-withdrawals')
 @Command('can')
 @ApiOperation({operationId:'withdrawMyNoncreditRegistration',summary:'Withdraw an owned unfinished registration and its linked active placement without deleting history'})
 @ApiBody({schema:p.withdraw})
 @ApiOkResponse({schema:p.withdrawResult})
 withdrawRegistration(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(withdrawRegistrationInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>withdrawRegistrationResult.parse(await workflow.withdrawMyNoncreditRegistration(input)));
 }

 @Get('admission-offer-options')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @ApiOperation({operationId:'getAdmissionOfferOptions',summary:'Registrar reads school years for an exact scoped application'})
 @ApiQuery({name:'applicationId',required:false,type:String,format:'uuid'})
 @ApiQuery({name:'siteId',required:false,type:String,format:'uuid'})
 @ApiQuery({name:'programId',required:false,type:String,format:'uuid'})
 @ApiOkResponse({schema:admission.admissionDocs.options})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 getAdmissionOfferOptions(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.admissionOptionsInput,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.admissionOptionsResult.parse(await workflow.getAdmissionOfferOptions(input)));
 }
 @Post('admission-offers')
 @Command('can')
 @ApiOperation({operationId:'issueAdmissionOffer',summary:'Issue an offer from the scoped application; no enrollment activation'})
 @ApiBody({schema:admission.admissionDocs.issue})
 @ApiOkResponse({schema:admission.admissionDocs.offerReceipt})
 issueAdmissionOffer(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.issueOfferInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.offerReceipt.parse(await workflow.issueAdmissionOffer(input)));
 }
 @Post('admission-offer-responses')
 @Command('can')
 @ApiOperation({operationId:'respondToAdmissionOffer',summary:'Verified guardian accepts or declines the exact offer; does not activate enrollment'})
 @ApiBody({schema:admission.admissionDocs.respond})
 @ApiOkResponse({schema:admission.admissionDocs.offerReceipt})
 respondToAdmissionOffer(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.respondOfferInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.offerReceipt.parse(await workflow.respondToAdmissionOffer(input)));
 }
 @Post('admission-enrollment-activations')
 @Command('can')
 @ApiOperation({operationId:'activateOfferedEnrollment',summary:'Registrar activates a previously accepted offer after existing readiness checks'})
 @ApiBody({schema:admission.admissionDocs.activate})
 @ApiOkResponse({schema:admission.admissionDocs.activationReceipt})
 activateOfferedEnrollment(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.activateOfferInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.activationReceipt.parse(await workflow.activateOfferedEnrollment(input)));
 }
 @Post('admission-offer-withdrawals')
 @Command('can')
 @ApiOperation({operationId:'withdrawIssuedAdmissionOffer',summary:'Registrar withdraws an unaccepted issued offer with audited reason'})
 @ApiBody({schema:admission.admissionDocs.withdraw})
 @ApiOkResponse({schema:admission.admissionDocs.offerReceipt})
 withdrawIssuedAdmissionOffer(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.withdrawOfferInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.offerReceipt.parse(await workflow.withdrawIssuedAdmissionOffer(input)));
 }
 @Post('class-enrollment-withdrawals')
 @Command('canonical')
 @ApiOperation({operationId:'withdrawMyNativeClassEnrollment',summary:'Adult learner withdraws only their own eligible Class placement'})
 @ApiBody({schema:admission.admissionDocs.classWithdraw})
 @ApiOkResponse({schema:admission.admissionDocs.classExitReceipt})
 withdrawMyNativeClassEnrollment(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.classWithdrawInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.classExitReceipt.parse(await workflow.withdrawMyNativeClassEnrollment(input)));
 }
 @Post('class-enrollment-cancellations')
 @Command('canonical')
 @ApiOperation({operationId:'cancelNativeClassEnrollment',summary:'Exact-Site manager cancels an eligible Class placement with existing policy'})
 @ApiBody({schema:admission.admissionDocs.classCancel})
 @ApiOkResponse({schema:admission.admissionDocs.classExitReceipt})
 cancelNativeClassEnrollment(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.classCancelInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.classExitReceipt.parse(await workflow.cancelNativeClassEnrollment(input)));
 }

 @Post('class-approval-requests')
 @Command('canonical')
 @ApiOperation({operationId:'requestNativeClassApproval',summary:'Request independent Class approval without enrollment or seat rights'})
 @ApiBody({schema:admission.classParticipationDocs.request})
 @ApiOkResponse({schema:admission.classParticipationDocs.approvalReceipt})
 requestNativeClassApproval(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.requestClassApprovalInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.classApprovalReceipt.parse(await workflow.requestNativeClassApproval(input)));
 }
 @Post('class-approval-decisions')
 @Command('canonical')
 @ApiOperation({operationId:'decideNativeClassApproval',summary:'Exact-Site independent reviewer decides eligibility without enrolling learner'})
 @ApiBody({schema:admission.classParticipationDocs.decide})
 @ApiOkResponse({schema:admission.classParticipationDocs.approvalReceipt})
 decideNativeClassApproval(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.decideClassApprovalInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.classApprovalReceipt.parse(await workflow.decideNativeClassApproval(input)));
 }
 @Post('class-invitations')
 @Command('canonical')
 @ApiOperation({operationId:'issueNativeClassInvitation',summary:'Exact-Site manager issues a verified adult invitation without reserving a seat'})
 @ApiBody({schema:admission.classParticipationDocs.issue})
 @ApiOkResponse({schema:admission.classParticipationDocs.invitationReceipt})
 issueNativeClassInvitation(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.issueClassInvitationInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.classInvitationReceipt.parse(await workflow.issueNativeClassInvitation(input)));
 }
 @Post('class-invitation-declines')
 @Command('canonical')
 @ApiOperation({operationId:'declineNativeClassInvitation',summary:'Decline own invitation without withdrawing an enrollment'})
 @ApiBody({schema:admission.classParticipationDocs.decline})
 @ApiOkResponse({schema:admission.classParticipationDocs.declineReceipt})
 declineNativeClassInvitation(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.declineClassInvitationInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.declineInvitationReceipt.parse(await workflow.declineNativeClassInvitation(input)));
 }
 @Post('class-enrollment-assignments')
 @Command('canonical')
 @ApiOperation({operationId:'assignAdultToNativeClass',summary:'Assign verified affiliated adult using shared Class capacity and repeat policy'})
 @ApiBody({schema:admission.classParticipationDocs.assign})
 @ApiOkResponse({schema:docs.enrollmentResult})
 assignAdultToNativeClass(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.assignAdultInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.enrollmentResult.parse(await workflow.assignAdultToNativeClass(input)));
 }
 @Get('me/class-approvals')
 @GovernedWorkflowOperation('canonical','GET')
 @ApiCookieAuth('session')
 @ApiCookieAuth('nativeSession')
 @ApiOperation({operationId:'getMyNativeClassApprovals',summary:"Current learner's own Class approval requests"})
 
 @ApiOkResponse({schema:admission.classParticipationDocs.myApprovals})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 getMyNativeClassApprovals(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.emptyCommand,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.myClassApprovalsResult.parse(JSON.parse(JSON.stringify(await workflow.getMyNativeClassApprovals(input)))));
 }
 @Get('class-approval-queue')
 @GovernedWorkflowOperation('canonical','GET')
 @ApiCookieAuth('session')
 @ApiCookieAuth('nativeSession')
 @ApiOperation({operationId:'getNativeClassApprovalQueue',summary:"Pending approvals for an authorized exact-Site Class"})
 @ApiQuery({name:'classId',required:true,type:String,format:'uuid'})
 @ApiOkResponse({schema:admission.classParticipationDocs.queue})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 getNativeClassApprovalQueue(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.classApprovalQueueInput,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.classApprovalQueueResult.parse(JSON.parse(JSON.stringify(await workflow.getNativeClassApprovalQueue(input)))));
 }
 @Get('me/class-invitations')
 @GovernedWorkflowOperation('canonical','GET')
 @ApiCookieAuth('session')
 @ApiCookieAuth('nativeSession')
 @ApiOperation({operationId:'getMyNativeClassInvitations',summary:"Current learner's own Class invitations"})
 
 @ApiOkResponse({schema:admission.classParticipationDocs.myInvitations})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 getMyNativeClassInvitations(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.emptyCommand,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.myClassInvitationsResult.parse(JSON.parse(JSON.stringify(await workflow.getMyNativeClassInvitations(input)))));
 }

 @Post('admission-inquiries')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'createAdmissionsInquiry',summary:'Create a scoped registrar inquiry; no offer or enrollment'})
 @ApiBody({schema:admission.intakeDocs.inquiry})
 @ApiOkResponse({schema:admission.intakeDocs.inquiryReceipt})
 createAdmissionsInquiry(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.admissionsInquiryInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.inquiryReceipt.parse(await workflow.createAdmissionsInquiry(input)));
 }
 @Post('admission-stage-transitions')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'transitionAdmissionsStage',summary:'Apply a governed admissions decision'})
 @ApiBody({schema:admission.intakeDocs.transition})
 @ApiOkResponse({schema:admission.intakeDocs.stageReceipt})
 transitionAdmissionsStage(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.admissionsTransitionInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.stageReceipt.parse(await workflow.transitionAdmissionsStage(input)));
 }
 @Post('admission-guardian-verifications')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'verifyAdmissionsGuardianRelationship',summary:'Independently verify the recorded guardian relationship'})
 @ApiBody({schema:admission.intakeDocs.verification})
 @ApiOkResponse({schema:admission.intakeDocs.verificationReceipt})
 verifyAdmissionsGuardianRelationship(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.guardianVerificationInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.guardianVerificationReceipt.parse(await workflow.verifyAdmissionsGuardianRelationship(input)));
 }
 @Post('admission-guardian-accounts')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'provisionInquiryGuardianAccount',summary:'Provision the verified guardian's scoped account'})
 @ApiBody({schema:admission.intakeDocs.application})
 @ApiOkResponse({schema:admission.intakeDocs.provisionReceipt})
 provisionInquiryGuardianAccount(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.admissionsApplicationInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.guardianProvisionReceipt.parse(await workflow.provisionInquiryGuardianAccount(input)));
 }
 @Post('admission-guardian-invitations')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'sendAdmissionsGuardianInvitation',summary:'Request the existing verified guardian sign-in workflow'})
 @ApiBody({schema:admission.intakeDocs.application})
 @ApiOkResponse({schema:admission.intakeDocs.invitationReceipt})
 sendAdmissionsGuardianInvitation(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.admissionsApplicationInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.guardianInvitationReceipt.parse(await workflow.sendAdmissionsGuardianInvitation(input)));
 }
 @Get('admission-intake-programs')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'listAdmissionsIntakePrograms',summary:'List authorized admissions programs'})
 
 @ApiOkResponse({schema:admission.intakeDocs.programs})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:500,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 listAdmissionsIntakePrograms(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.emptyCommand,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.intakeProgramsResult.parse(await workflow.listAdmissionsIntakePrograms(input)));
 }
 @Get('admission-existing-students')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'listAdmissionsExistingStudentsPage',summary:'Page through authorized existing students and verified guardians'})
 @ApiQuery({name:'siteId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'programId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'applicationId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'search',required:false,schema:{type:'string',maxLength:100}})
 @ApiQuery({name:'pageSize',required:false,schema:{type:'integer',minimum:1,maximum:100,default:40}})
 @ApiQuery({name:'page',required:false,schema:{type:'integer',minimum:1,maximum:10000,default:1}})
 @ApiOkResponse({schema:admission.intakeDocs.students})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:500,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 listAdmissionsExistingStudentsPage(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.admissionsIntakeQuery,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.existingStudentsResult.parse(await workflow.listAdmissionsExistingStudentsPage(input)));
 }
 @Get('admission-stage-counts')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'getAdmissionsStageCounts',summary:'Count applications by stage within authorized scope'})
 @ApiQuery({name:'siteId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'programId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'search',required:false,schema:{type:'string',maxLength:100}})
 @ApiOkResponse({schema:admission.intakeDocs.counts})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:500,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 getAdmissionsStageCounts(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.admissionsCountsQuery,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.admissionsCountsResult.parse(await workflow.getAdmissionsStageCounts(input)));
 }
 @Get('admission-household-search')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'searchAdmissionsHouseholds',summary:'Search verified sibling reuse candidates'})
 @ApiQuery({name:'programId',required:true,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'search',required:true,schema:{type:'string',maxLength:100,minLength:2}})
 @ApiOkResponse({schema:admission.intakeDocs.households})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:500,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 searchAdmissionsHouseholds(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.admissionsHouseholdsQuery,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.admissionsHouseholdsResult.parse(await workflow.searchAdmissionsHouseholds(input)));
 }
 @Get('admission-applications')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'listAdmissionsIntake',summary:'Page through scoped admissions applications'})
 @ApiQuery({name:'siteId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'programId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'applicationId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'search',required:false,schema:{type:'string',maxLength:100}})
 @ApiQuery({name:'pageSize',required:false,schema:{type:'integer',minimum:1,maximum:100,default:40}})
 @ApiQuery({name:'page',required:false,schema:{type:'integer',minimum:1,maximum:10000,default:1}})
 @ApiOkResponse({schema:admission.intakeDocs.intake})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:500,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 listAdmissionsIntake(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.admissionsIntakeQuery,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.admissionsIntakeResult.parse(await workflow.listAdmissionsIntake(input)));
 }

 @Post('family-applications')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'startGuardianFamilyApplication',summary:'Verified guardian starts a scoped family application'})
 @ApiBody({schema:admission.familyDocs.application})
 @ApiOkResponse({schema:admission.intakeDocs.inquiryReceipt})
 startGuardianFamilyApplication(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.familyApplicationInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.inquiryReceipt.parse(await workflow.startGuardianFamilyApplication(input)));
 }
 @Post('admission-guardian-access-revocations')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'revokeAdmissionsGuardianAccess',summary:'Registrar revokes exact guardian grant and its bound sessions'})
 @ApiBody({schema:admission.familyDocs.access})
 @ApiOkResponse({schema:admission.familyDocs.revoked})
 revokeAdmissionsGuardianAccess(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.guardianAccessChangeInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.guardianRevokeReceipt.parse(await workflow.revokeAdmissionsGuardianAccess(input)));
 }
 @Post('admission-guardian-access-restorations')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'restoreAdmissionsGuardianAccess',summary:'Registrar restores exact guardian grant without restoring revoked sessions'})
 @ApiBody({schema:admission.familyDocs.access})
 @ApiOkResponse({schema:admission.familyDocs.restored})
 restoreAdmissionsGuardianAccess(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.guardianAccessChangeInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.guardianRestoreReceipt.parse(await workflow.restoreAdmissionsGuardianAccess(input)));
 }
 @Get('me/family-application-workspace')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'getGuardianFamilyApplicationWorkspace',summary:'Verified guardian reads authorized school programs and own family applications'})
 @ApiOkResponse({schema:admission.familyDocs.workspace})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:500,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 getGuardianFamilyApplicationWorkspace(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.emptyCommand,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.familyWorkspaceResult.parse(await workflow.getGuardianFamilyApplicationWorkspace(input)));
 }

 @Post('admission-interest-assignments')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'assignPublicSiteInterestToProgram',summary:'Assign a Site interest to an authorized admissions Program'})
 @ApiBody({schema:admission.interestDocs.assign})
 @ApiOkResponse({schema:admission.interestDocs.assigned})
 assignPublicSiteInterestToProgram(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.interestAssignmentInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.interestAssignmentReceipt.parse(await workflow.assignPublicSiteInterestToProgram(input)));
 }
 @Post('admission-interest-invitations')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'invitePublicAdmissionsInterestToApply',summary:'Request verified-email application invitation for consented adult interest'})
 @ApiBody({schema:admission.interestDocs.invite})
 @ApiOkResponse({schema:admission.interestDocs.invited})
 invitePublicAdmissionsInterestToApply(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.interestInvitationInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.interestInvitationReceipt.parse(await workflow.invitePublicAdmissionsInterestToApply(input)));
 }
 @Post('admission-interest-status-changes')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'setPublicAdmissionsInterestStatus',summary:'Record authorized follow-up or close an interest'})
 @ApiBody({schema:admission.interestDocs.status})
 @ApiOkResponse({schema:admission.interestDocs.changed})
 setPublicAdmissionsInterestStatus(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.interestStatusInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.interestStatusReceipt.parse(await workflow.setPublicAdmissionsInterestStatus(input)));
 }
 @Get('admission-interests')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'listPublicAdmissionsInterests',summary:'Scoped admissions interest inbox with stable pagination'})
 @ApiQuery({name:'interestId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'siteId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'programId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'cursor',required:false,schema:{type:'string',maxLength:80}})
 @ApiOkResponse({schema:admission.interestDocs.page})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:500,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 listPublicAdmissionsInterests(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.publicInterestQuery,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.publicInterestPageResult.parse(await workflow.listPublicAdmissionsInterests(input)));
 }
 @Get('me/admission-offers')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'getGuardianAdmissionOffers',summary:'Read offers only for independently verified guardian relationships'})
 @ApiQuery({name:'studentPersonId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiOkResponse({schema:admission.interestDocs.guardianOffers})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:500,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 getGuardianAdmissionOffers(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.guardianOffersQuery,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.guardianOffersResult.parse(await workflow.getGuardianAdmissionOffers(input)));
 }

 @Get('me/transfer-destinations')
 @GovernedWorkflowOperation('can','GET')
 @ApiCookieAuth('session')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'listPublicTransferDestinations',summary:'Verified family discovers published authorized academic transfer destinations'})
 @ApiOkResponse({schema:admission.transferDocs.destinations})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:500,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 listPublicTransferDestinations(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(admission.emptyCommand,query),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.transferDestinationsResult.parse(await workflow.listPublicTransferDestinations(input)));
 }
 @Post('transfer-destination-family-starts')
 @Command('can')
 @Header('Cache-Control','private, no-store')
 @Header('Referrer-Policy','no-referrer')
 @ApiOperation({operationId:'requestTransferDestinationFamilyStart',summary:'Request verified-email entry to a different authorized school for an existing verified transfer'})
 @ApiBody({schema:admission.transferDocs.request})
 @ApiOkResponse({schema:admission.transferDocs.receipt})
 requestTransferDestinationFamilyStart(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(admission.transferDestinationInput,body),workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>admission.transferDestinationReceipt.parse(await workflow.requestTransferDestinationFamilyStart(input)));
 }
}

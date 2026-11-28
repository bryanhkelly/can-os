import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './credentials.contracts';
function Operation(method:'GET'|'POST'){return applyDecorators(GovernedWorkflowOperation('canonical',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
@ApiTags('Private noncredit credentials')
@Controller()
export class CredentialsController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('me/credentials')
 @Operation('GET')
 @ApiOperation({operationId:'listMyNoncreditCredentials',summary:'Private learner-owned awards; restricted reader must be enabled'})
 @ApiOkResponse({schema:c.docs.list})
 async listMyNoncreditCredentials(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.empty,query);return c.listResult.parse(await this.identity.runWorkflow(()=>workflow.listMyNoncreditCredentials(input)));}
 @Post('me/credential-downloads')
 @Operation('POST')
 @ApiOperation({operationId:'downloadMyNoncreditCredential',summary:'Private current learner-owned credential artifact'})
 @ApiBody({schema:c.docs.download})
 @ApiOkResponse({schema:c.docs.artifact})
 async downloadMyNoncreditCredential(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.download,body);return c.artifactResult.parse(await this.identity.runWorkflow(()=>workflow.downloadMyNoncreditCredential(input)));}
 @Post('credential-previews')
 @Operation('POST')
 @ApiOperation({operationId:'previewNoncreditCredential',summary:'Provider-scoped SAMPLE artifact; not an issuance or verification'})
 @ApiBody({schema:c.docs.preview})
 @ApiOkResponse({schema:c.docs.artifact})
 async previewNoncreditCredential(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.preview,body);return c.artifactResult.parse(await this.identity.runWorkflow(()=>workflow.previewNoncreditCredential(input)));}
 @Post('completion-evidence-review-requests')
 @Operation('POST')
 @ApiOperation({operationId:'requestCompletionEvidenceReview',summary:'Request an independent review of exact source-bound completion evidence'})
 @ApiBody({schema:c.evidenceDocs.request})
 @ApiOkResponse({schema:c.evidenceDocs.requested})
 async requestCompletionEvidenceReview(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.evidenceRequest,body);return c.requested.parse(await this.identity.runWorkflow(()=>workflow.requestCompletionEvidenceReview(input)));}
 @Get('completion-evidence-review-queue')
 @Operation('GET')
 @ApiOperation({operationId:'getPendingCompletionEvidenceReviews',summary:'Read exact-Site pending evidence requests excluding own submissions'})
 @ApiQuery({name:'page',schema:{type:'integer',minimum:0,maximum:100,default:0},required:false})
 @ApiOkResponse({schema:c.evidenceDocs.queue})
 async getPendingCompletionEvidenceReviews(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.evidenceQueue,query);return c.queueResult.parse(await this.identity.runWorkflow(()=>workflow.getPendingCompletionEvidenceReviews(input)));}
 @Post('completion-evidence-review-decisions')
 @Operation('POST')
 @ApiOperation({operationId:'decideCompletionEvidenceReview',summary:'Approve or reject independently reviewed evidence'})
 @ApiBody({schema:c.evidenceDocs.decision})
 @ApiOkResponse({schema:c.evidenceDocs.decided})
 async decideCompletionEvidenceReview(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.evidenceDecision,body);return c.decided.parse(await this.identity.runWorkflow(()=>workflow.decideCompletionEvidenceReview(input)));}
 @Post('credential-revocations')
 @Operation('POST')
 @ApiOperation({operationId:'revokeLearningAwardIssuance',summary:'Revoke a credential with independent source-bound evidence and current issuer authority'})
 @ApiBody({schema:c.evidenceDocs.revocation})
 @ApiOkResponse({schema:c.evidenceDocs.revoked})
 async revokeLearningAwardIssuance(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.revocation,body);return c.revoked.parse(await this.identity.runWorkflow(()=>workflow.revokeLearningAwardIssuance(input)));}
 @Get('class-completion-review')
 @Operation('GET')
 @ApiOperation({operationId:'getNativeClassCompletionReview',summary:'Read independently governed Class completion readiness'})
 @ApiQuery({name:'classEnrollmentId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.classDocs.review})
 async getNativeClassCompletionReview(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.classInspect,query);return c.classReviewResult.parse(await this.identity.runWorkflow(()=>workflow.getNativeClassCompletionReview(input)));}
 @Get('class-completion-queue')
 @Operation('GET')
 @ApiOperation({operationId:'getNativeClassCompletionQueue',summary:'Read bounded exact-Site Class completion queue'})
 @ApiQuery({name:'classId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'page',schema:{type:'integer',minimum:0,maximum:100,default:0},required:false})
 @ApiOkResponse({schema:c.classDocs.queue})
 async getNativeClassCompletionQueue(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.classQueue,query);return c.classQueueResult.parse(await this.identity.runWorkflow(()=>workflow.getNativeClassCompletionQueue(input)));}
 @Post('class-completion-decisions')
 @Operation('POST')
 @ApiOperation({operationId:'decideNativeClassCompletion',summary:'Record or supersede an independently governed Class outcome'})
 @ApiBody({schema:c.classDocs.decision})
 @ApiOkResponse({schema:c.classDocs.decisionResult})
 async decideNativeClassCompletion(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.classDecision,body);return c.classDecisionResult.parse(await this.identity.runWorkflow(()=>workflow.decideNativeClassCompletion(input)));}
 @Post('class-completion-policies')
 @Operation('POST')
 @ApiOperation({operationId:'publishNativeClassCompletionPolicy',summary:'Publish immutable Class policy for future enrollments'})
 @ApiBody({schema:c.classDocs.policy})
 @ApiOkResponse({schema:c.classDocs.policyResult})
 async publishNativeClassCompletionPolicy(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.classPolicy,body);return c.classPolicyResult.parse(await this.identity.runWorkflow(()=>workflow.publishNativeClassCompletionPolicy(input)));}
}

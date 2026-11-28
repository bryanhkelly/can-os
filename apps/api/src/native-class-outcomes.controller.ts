import {Controller,Get,Post,Body,Query,Req} from '@nestjs/common';
import {ApiTags,ApiOperation,ApiBody,ApiOkResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {validated} from './learning.contracts';
import * as c from './credentials.contracts';
import {Operation} from './assessments-outcomes-operation';
@ApiTags('Native Class outcomes')
@Controller()
export class NativeClassOutcomesController {
 constructor(private readonly identity:CanonicalIdentityService){}
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
 @Post('class-knowledge-check-access')
 @Operation('POST')
 @ApiOperation({operationId:'provisionNativeClassKnowledgeCheckAccess',summary:'provisionNativeClassKnowledgeCheckAccess'})
 @ApiBody({schema:c.nativeDocs.provision})
 @ApiOkResponse({schema:c.nativeDocs.grant})
 async provisionNativeClassKnowledgeCheckAccess(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.nativeProvision,body);return c.nativeGrant.parse(await this.identity.runWorkflow(()=>workflow.provisionNativeClassKnowledgeCheckAccess(input)));}
 @Get('class-knowledge-review-queue')
 @Operation('GET')
 @ApiOperation({operationId:'getNativeClassPendingKnowledgeReviews',summary:'getNativeClassPendingKnowledgeReviews'})
 @ApiQuery({name:'classId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.nativeDocs.pending})
 async getNativeClassPendingKnowledgeReviews(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.nativeClassQuery,query);return c.nativePending.parse(await this.identity.runWorkflow(()=>workflow.getNativeClassPendingKnowledgeReviews(input)));}
 @Post('class-knowledge-check-finalizations')
 @Operation('POST')
 @ApiOperation({operationId:'finalizeNativeClassKnowledgeCheck',summary:'finalizeNativeClassKnowledgeCheck'})
 @ApiBody({schema:c.nativeDocs.finalize})
 @ApiOkResponse({schema:c.nativeDocs.finalized})
 async finalizeNativeClassKnowledgeCheck(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.nativeFinalize,body);return c.nativeFinalized.parse(await this.identity.runWorkflow(()=>workflow.finalizeNativeClassKnowledgeCheck(input)));}
}

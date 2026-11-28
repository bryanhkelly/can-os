import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService,type WorkflowMode} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './knowledge-check.contracts';
function Operation(mode:WorkflowMode,method:'GET'|'POST'){return applyDecorators(GovernedWorkflowOperation(mode,method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
@ApiTags('Canonical knowledge checks and completion')
@Controller()
export class KnowledgeCheckController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('knowledge-check')
 @Operation('learner','GET')
 @ApiOperation({operationId:'getNoncreditKnowledgeCheck',summary:'get Noncredit Knowledge Check'})
 @ApiQuery({name:'courseAttemptId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'phase',enum:['baseline','final'],required:false})
 @ApiOkResponse({schema:c.docs.check})
 async getNoncreditKnowledgeCheck(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.courseQuery,query);return c.results.check.parse(await this.identity.runWorkflow(()=>workflow.getNoncreditKnowledgeCheck(input)));}

 @Post('knowledge-check-attempts')
 @Operation('learner','POST')
 @ApiOperation({operationId:'beginNoncreditKnowledgeCheckAttempt',summary:'begin Noncredit Knowledge Check Attempt'})
 @ApiBody({schema:c.inputs.start})
 @ApiOkResponse({schema:c.docs.attempt})
 async beginNoncreditKnowledgeCheckAttempt(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.attempt.parse(await this.identity.runWorkflow(()=>workflow.beginNoncreditKnowledgeCheckAttempt(input)));}

 @Post('knowledge-check-draft-answers')
 @Operation('learner','POST')
 @ApiOperation({operationId:'saveNoncreditKnowledgeCheckAnswer',summary:'save Noncredit Knowledge Check Answer'})
 @ApiBody({schema:c.inputs.draft})
 @ApiOkResponse({schema:c.docs.saved})
 async saveNoncreditKnowledgeCheckAnswer(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.saved.parse(await this.identity.runWorkflow(()=>workflow.saveNoncreditKnowledgeCheckAnswer(input)));}

 @Post('knowledge-check-submissions')
 @Operation('learner','POST')
 @ApiOperation({operationId:'submitNoncreditKnowledgeCheckAnswers',summary:'submit Noncredit Knowledge Check Answers'})
 @ApiBody({schema:c.inputs.submit})
 @ApiOkResponse({schema:c.docs.submitted})
 async submitNoncreditKnowledgeCheckAnswers(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.submitted.parse(await this.identity.runWorkflow(()=>workflow.submitNoncreditKnowledgeCheckAnswers(input)));}

 @Post('knowledge-check-finalizations')
 @Operation('canonical','POST')
 @ApiOperation({operationId:'finalizeNoncreditKnowledgeCheckResult',summary:'finalize Noncredit Knowledge Check Result'})
 @ApiBody({schema:c.inputs.review})
 @ApiOkResponse({schema:c.docs.finalized})
 async finalizeNoncreditKnowledgeCheckResult(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.finalized.parse(await this.identity.runWorkflow(()=>workflow.finalizeNoncreditKnowledgeCheckResult(input)));}

 @Post('knowledge-check-access')
 @Operation('canonical','POST')
 @ApiOperation({operationId:'provisionNoncreditKnowledgeCheckAccess',summary:'provision Noncredit Knowledge Check Access'})
 @ApiBody({schema:c.inputs.course})
 @ApiOkResponse({schema:c.docs.grant})
 async provisionNoncreditKnowledgeCheckAccess(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.grant.parse(await this.identity.runWorkflow(()=>workflow.provisionNoncreditKnowledgeCheckAccess(input)));}

 @Get('completion-readiness')
 @Operation('learner','GET')
 @ApiOperation({operationId:'getNoncreditCompletionReadiness',summary:'get Noncredit Completion Readiness'})
 @ApiQuery({name:'courseAttemptId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.docs.completion})
 async getNoncreditCompletionReadiness(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.completionQuery,query);return c.results.completion.parse(await this.identity.runWorkflow(()=>workflow.getNoncreditCompletionReadiness(input)));}

}

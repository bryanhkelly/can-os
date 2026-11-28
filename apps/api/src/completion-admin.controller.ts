import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './completion-admin.contracts';
function Operation(method:'GET'|'POST'){return applyDecorators(GovernedWorkflowOperation('canonical',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
@ApiTags('Provider completion administration')
@Controller()
export class CompletionAdminController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('noncredit-completion-decisions')
 @Operation('POST')
 @ApiOperation({operationId:'decideNoncreditCompletion',summary:'decide Noncredit Completion; independently authorized provider'})
 @ApiBody({schema:c.inputs.decision})
 @ApiOkResponse({schema:c.docs.decision})
 async decideNoncreditCompletion(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.decision.parse(await this.identity.runWorkflow(()=>workflow.decideNoncreditCompletion(input)));}

 @Get('noncredit-completion-policy-catalog')
 @Operation('GET')
 @ApiOperation({operationId:'getNoncreditCompletionPolicyCatalog',summary:'get Noncredit Completion Policy Catalog; independently authorized provider'})
 
 @ApiOkResponse({schema:c.docs.catalog})
 async getNoncreditCompletionPolicyCatalog(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.empty,query);return c.results.catalog.parse(await this.identity.runWorkflow(()=>workflow.getNoncreditCompletionPolicyCatalog(input)));}

 @Post('noncredit-completion-policies')
 @Operation('POST')
 @ApiOperation({operationId:'publishNoncreditCompletionPolicy',summary:'publish Noncredit Completion Policy; independently authorized provider'})
 @ApiBody({schema:c.inputs.policy})
 @ApiOkResponse({schema:c.docs.policy})
 async publishNoncreditCompletionPolicy(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.policy.parse(await this.identity.runWorkflow(()=>workflow.publishNoncreditCompletionPolicy(input)));}

 @Get('noncredit-completion-review')
 @Operation('GET')
 @ApiOperation({operationId:'getNoncreditCompletionReview',summary:'get Noncredit Completion Review; independently authorized provider'})
 @ApiQuery({name:'registrationId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.docs.review})
 async getNoncreditCompletionReview(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.reviewQuery,query);return c.results.review.parse(await this.identity.runWorkflow(()=>workflow.getNoncreditCompletionReview(input)));}

 @Get('noncredit-completion-queue')
 @Operation('GET')
 @ApiOperation({operationId:'getNoncreditCompletionQueue',summary:'get Noncredit Completion Queue; independently authorized provider'})
 @ApiQuery({name:'page',schema:{type:'integer',minimum:0,maximum:100,default:0},required:false})
 @ApiOkResponse({schema:c.docs.queue})
 async getNoncreditCompletionQueue(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.queueQuery,query);return c.results.queue.parse(await this.identity.runWorkflow(()=>workflow.getNoncreditCompletionQueue(input)));}

 @Post('noncredit-completion-corrections')
 @Operation('POST')
 @ApiOperation({operationId:'correctNoncreditCompletion',summary:'correct Noncredit Completion; independently authorized provider'})
 @ApiBody({schema:c.inputs.correction})
 @ApiOkResponse({schema:c.docs.correction})
 async correctNoncreditCompletion(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.correction.parse(await this.identity.runWorkflow(()=>workflow.correctNoncreditCompletion(input)));}

}

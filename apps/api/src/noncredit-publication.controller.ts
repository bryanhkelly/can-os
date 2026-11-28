import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './noncredit-publication.contracts';
function Operation(method:'GET'|'POST'){return applyDecorators(GovernedWorkflowOperation('canonical',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
@ApiTags('Noncredit enrollment publication')
@Controller()
export class NoncreditPublicationController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('noncredit-enrollment-publisher')
 @Operation('GET')
 @ApiOperation({operationId:'getNoncreditEnrollmentPublisher',summary:'get Noncredit Enrollment Publisher; verified provider'})
 
 @ApiOkResponse({schema:c.docs.publisher})
 async getNoncreditEnrollmentPublisher(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.empty,query);return c.results.publisher.parse(await this.identity.runWorkflow(()=>workflow.getNoncreditEnrollmentPublisher(input)));}

 @Get('noncredit-training-readiness')
 @Operation('GET')
 @ApiOperation({operationId:'getNoncreditTrainingReadiness',summary:'get Noncredit Training Readiness; verified provider'})
 @ApiQuery({name:'deploymentId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'adoptionId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'trainingVersionId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'courseVersionId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.docs.readiness})
 async getNoncreditTrainingReadiness(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.selection,query);return c.results.readiness.parse(await this.identity.runWorkflow(()=>workflow.getNoncreditTrainingReadiness(input)));}

 @Post('noncredit-enrollment-releases')
 @Operation('POST')
 @ApiOperation({operationId:'publishNoncreditSelfEnrollment',summary:'publish Noncredit Self Enrollment; verified provider'})
 @ApiBody({schema:c.inputs.noncreditPublishCommand})
 @ApiOkResponse({schema:c.docs.receipt})
 async publishNoncreditSelfEnrollment(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.receipt.parse(await this.identity.runWorkflow(()=>workflow.publishNoncreditSelfEnrollment(input)));}

 @Post('noncredit-enrollment-closures')
 @Operation('POST')
 @ApiOperation({operationId:'closeNoncreditSelfEnrollment',summary:'close Noncredit Self Enrollment; verified provider'})
 @ApiBody({schema:c.inputs.closeInput})
 @ApiOkResponse({schema:c.docs.closed})
 async closeNoncreditSelfEnrollment(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.closed.parse(await this.identity.runWorkflow(()=>workflow.closeNoncreditSelfEnrollment(input)));}

 @Post('noncredit-multisite-releases')
 @Operation('POST')
 @ApiOperation({operationId:'publishNoncreditAcrossAuthorizedSites',summary:'publish Noncredit Across Authorized Sites; verified provider'})
 @ApiBody({schema:c.inputs.multiSitePublishInput})
 @ApiOkResponse({schema:c.docs.multi})
 async publishNoncreditAcrossAuthorizedSites(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=body;return c.results.multi.parse(await this.identity.runWorkflow(()=>workflow.publishNoncreditAcrossAuthorizedSites(input)));}

}

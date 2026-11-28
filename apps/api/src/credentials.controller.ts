import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse} from '@nestjs/swagger';
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
}

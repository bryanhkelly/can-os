import {Controller,Get,Post,Body,Query,Req} from '@nestjs/common';
import {ApiTags,ApiOperation,ApiBody,ApiOkResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {validated} from './learning.contracts';
import * as c from './credentials.contracts';
import {Operation} from './assessments-outcomes-operation';
@ApiTags('Credentials')
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
 @Post('credential-revocations')
 @Operation('POST')
 @ApiOperation({operationId:'revokeLearningAwardIssuance',summary:'Revoke a credential with independent source-bound evidence and current issuer authority'})
 @ApiBody({schema:c.evidenceDocs.revocation})
 @ApiOkResponse({schema:c.evidenceDocs.revoked})
 async revokeLearningAwardIssuance(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.revocation,body);return c.revoked.parse(await this.identity.runWorkflow(()=>workflow.revokeLearningAwardIssuance(input)));}
}

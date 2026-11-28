import {Controller,Get,Post,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiHeader,ApiBody,ApiOkResponse,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {CanonicalReadOperation,CanonicalWriteOperation,verifiedIdentity} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './issuer-approval.contracts';
const errors=()=>[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}}));
const Read=()=>applyDecorators(CanonicalReadOperation(),...errors());
const Write=()=>applyDecorators(CanonicalWriteOperation(),HttpCode(200),ApiHeader({name:'Origin',required:true}),...errors());
@ApiTags('Identity — Credential Issuer Authority')
@ApiCookieAuth('session')
@Controller('identity/credential-issuer')
export class IssuerApprovalController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('mine')
 @Read()
 @ApiOperation({operationId:'getMyCredentialIssuerApproval',summary:'Read the current exact-grant issuer approval'})
 @ApiOkResponse({schema:c.doc.my})
 getMyCredentialIssuerApproval(@Req() request:FastifyRequest){
  return this.identity.run(verifiedIdentity(request),async actor=>c.myApproval.parse(await actor.getMyCredentialIssuerApproval()));
 }
 @Get('pending')
 @Read()
 @ApiOperation({operationId:'listPendingCredentialIssuerApprovals',summary:'Read pending requests as independent credential reviewer'})
 @ApiOkResponse({schema:c.doc.pending})
 listPendingCredentialIssuerApprovals(@Req() request:FastifyRequest){
  return this.identity.run(verifiedIdentity(request),async actor=>c.pending.parse(await actor.listPendingCredentialIssuerApprovals()));
 }
 @Get('approved')
 @Read()
 @ApiOperation({operationId:'listActiveCredentialIssuerApprovals',summary:'Read approved requests, including expired approvals awaiting revocation'})
 @ApiOkResponse({schema:c.doc.active})
 listActiveCredentialIssuerApprovals(@Req() request:FastifyRequest){
  return this.identity.run(verifiedIdentity(request),async actor=>c.active.parse(await actor.listActiveCredentialIssuerApprovals()));
 }
 @Post('requests')
 @Write()
 @ApiOperation({operationId:'requestCanonicalCredentialIssuerApproval',summary:'Request credential issuance authority for the current exact staff grant'})
 @ApiBody({schema:c.doc.request})
 @ApiOkResponse({schema:c.doc.requested})
 requestCanonicalCredentialIssuerApproval(@Req() request:FastifyRequest,@Body() body:unknown){
  const input=validated(c.requestBody,body);
  return this.identity.run(verifiedIdentity(request),async actor=>c.requested.parse(await actor.requestCanonicalCredentialIssuerApproval(input)));
 }
 @Post('decisions')
 @Write()
 @ApiOperation({operationId:'reviewCanonicalCredentialIssuerApproval',summary:'Independently approve or reject a pending issuer request'})
 @ApiBody({schema:c.doc.review})
 @ApiOkResponse({schema:c.doc.reviewed})
 reviewCanonicalCredentialIssuerApproval(@Req() request:FastifyRequest,@Body() body:unknown){
  const input=validated(c.reviewBody,body);
  return this.identity.run(verifiedIdentity(request),async actor=>c.reviewed.parse(await actor.reviewCanonicalCredentialIssuerApproval(input)));
 }
 @Post('revocations')
 @Write()
 @ApiOperation({operationId:'revokeCanonicalCredentialIssuerApproval',summary:'Independently revoke an approved issuer request'})
 @ApiBody({schema:c.doc.revoke})
 @ApiOkResponse({schema:c.doc.revoked})
 revokeCanonicalCredentialIssuerApproval(@Req() request:FastifyRequest,@Body() body:unknown){
  const input=validated(c.revokeBody,body);
  return this.identity.run(verifiedIdentity(request),async actor=>c.revoked.parse(await actor.revokeCanonicalCredentialIssuerApproval(input)));
 }
}

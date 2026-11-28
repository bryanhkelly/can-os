import {Controller,Get,Post,Req,Query,Body,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiHeader,ApiQuery,ApiBody,ApiOkResponse,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {OwnerControlOperation,verifiedOwnerControl} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './owner-control.contracts';

function OwnerRead(){return applyDecorators(OwnerControlOperation('GET'),...([400,401,403,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}}))));}
function OwnerWrite(){return applyDecorators(OwnerControlOperation('POST'),HttpCode(200),ApiHeader({name:'Origin',required:true}),...([400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}}))));}

@ApiTags('Identity — Platform Owner')
@ApiCookieAuth('session')
@Controller('owner')
export class OwnerControlController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('delegation')
 @OwnerRead()
 @ApiOperation({operationId:'getOwnerDelegation',summary:'Read original owner delegation status, including expired delegation'})
 @ApiOkResponse({schema:c.doc.status})
 status(@Req() request:FastifyRequest){
  const owner=verifiedOwnerControl(request);
  return this.identity.runWorkflow(async()=>c.status.parse(await owner.status()));
 }
 @Get('delegation-targets')
 @OwnerRead()
 @ApiOperation({operationId:'listOwnerDelegationTargets',summary:'Search current eligible memberships as undelegated owner'})
 @ApiQuery({name:'search',required:true,schema:{type:'string',minLength:2,maxLength:100}})
 @ApiOkResponse({schema:c.doc.targets})
 targets(@Req() request:FastifyRequest,@Query() query:unknown){
  const owner=verifiedOwnerControl(request),input=validated(c.searchQuery,query);
  return this.identity.runWorkflow(async()=>c.targets.parse(await owner.targets(input.search)));
 }
 @Post('delegation')
 @OwnerWrite()
 @ApiOperation({operationId:'startOwnerDelegation',summary:'Start an audited, expiring view or act delegation'})
 @ApiBody({schema:c.doc.start})
 @ApiOkResponse({schema:c.doc.started})
 start(@Req() request:FastifyRequest,@Body() body:unknown){
  const owner=verifiedOwnerControl(request),input=validated(c.startBody,body);
  return this.identity.runWorkflow(async()=>c.started.parse(await owner.start(input)));
 }
 @Post('delegation/return')
 @OwnerWrite()
 @ApiOperation({operationId:'returnToPlatformOwner',summary:'Return to the original owner even during read-only or expired delegation'})
 @ApiBody({schema:c.doc.stop})
 @ApiOkResponse({schema:c.doc.stopped})
 stop(@Req() request:FastifyRequest,@Body() body:unknown){
  const owner=verifiedOwnerControl(request);
  validated(c.stopBody,body);
  return this.identity.runWorkflow(async()=>c.stopped.parse(await owner.stop()));
 }
 @Post('private-credential-recovery')
 @OwnerWrite()
 @ApiOperation({operationId:'recoverPrivateAccountCredential',summary:'Audited private credential enrollment or rotation; existing owner and target restrictions apply'})
 @ApiBody({schema:c.doc.recover})
 @ApiOkResponse({schema:c.doc.recovered})
 recover(@Req() request:FastifyRequest,@Body() body:unknown){
  const owner=verifiedOwnerControl(request),input=validated(c.recoverBody,body);
  return this.identity.runWorkflow(async()=>c.recovered.parse(await owner.recover(input)));
 }
}

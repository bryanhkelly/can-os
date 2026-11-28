import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './sender-admin.contracts';
function SenderOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),
 ...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Communication sender administration')
@Controller()
export class SenderAdminController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('communication-senders/current')
 @SenderOperation('GET')
 @ApiOperation({operationId:'readSenderAdministration',summary:'Read exact platform or organization sender approval as verified platform owner'})
 @ApiQuery({name:'organizationId',schema:{type:'string',format:'uuid'},required:false,description:'Omit to read the platform approval'})
 @ApiOkResponse({schema:c.docs.current})
 async readSenderAdministration(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input=validated(c.scopeQuery,query);
  return c.results.current.parse(await this.identity.runWorkflow(()=>workflow.readSenderAdministration(input)));
 }
 @Get('communication-senders/organizations')
 @SenderOperation('GET')
 @ApiOperation({operationId:'listSenderOrganizationsPage',summary:'Discover sender administration organizations in bounded pages'})
 @ApiQuery({name:'limit',schema:{type:'integer',minimum:1,maximum:100,default:50},required:false})
 @ApiQuery({name:'afterName',schema:{type:'string',maxLength:500},required:false})
 @ApiQuery({name:'afterId',schema:{type:'string',format:'uuid'},required:false})
 @ApiOkResponse({schema:c.docs.page})
 async listSenderOrganizationsPage(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input=validated(c.pageQuery,query);
  return c.results.page.parse(await this.identity.runWorkflow(()=>workflow.listSenderOrganizationsPage(input)));
 }
 @Post('communication-sender-approvals')
 @SenderOperation('POST')
 @ApiOperation({operationId:'changeSenderAdministration',summary:'Approve sender identity with explicit expected current version'})
 @ApiBody({schema:c.inputs.change})
 @ApiOkResponse({schema:c.docs.receipt})
 async changeSenderAdministration(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input=body;
  return c.results.receipt.parse(await this.identity.runWorkflow(()=>workflow.changeSenderAdministration(input)));
 }
 @Post('communication-sender-revocations')
 @SenderOperation('POST')
 @ApiOperation({operationId:'revokeSenderAdministration',summary:'Revoke the exact current sender approval'})
 @ApiBody({schema:c.inputs.revoke})
 @ApiOkResponse({schema:c.docs.receipt})
 async revokeSenderAdministration(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input=body;
  return c.results.receipt.parse(await this.identity.runWorkflow(()=>workflow.revokeSenderAdministration(input)));
 }
}

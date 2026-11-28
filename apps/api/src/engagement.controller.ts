import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './engagement.contracts';
function EngagementOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Engagement registry')
@Controller()
export class EngagementController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('engagement-definitions')
 @EngagementOperation('POST')
 @ApiOperation({operationId:'createEngagementDefinition',summary:'Publish immutable, authorized engagement definition'})
 @ApiBody({schema:c.inputs.publish})
 @ApiOkResponse({schema:c.docs.published})
 async createEngagementDefinition(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.published.parse(await this.identity.runWorkflow(()=>workflow.createEngagementDefinition(input)));
 }
 @Post('engagement-go-links')
 @EngagementOperation('POST')
 @ApiOperation({operationId:'createEngagementGoLink',summary:'Issue a channel link to an exact published version'})
 @ApiBody({schema:c.inputs.createLink})
 @ApiOkResponse({schema:c.docs.issued})
 async createEngagementGoLink(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.issued.parse(await this.identity.runWorkflow(()=>workflow.createEngagementGoLink(input)));
 }
 @Get('engagement-go-links')
 @EngagementOperation('GET')
 @ApiOperation({operationId:'listEngagementGoLinks',summary:'List at most 500 owned engagement links with attributable evidence'})
 @ApiQuery({name:'engagementId',required:true,schema:{type:'string',format:'uuid'}})
 @ApiOkResponse({schema:c.docs.links})
 async listEngagementGoLinks(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.engagementQuery,query);
  return c.results.links.parse(await this.identity.runWorkflow(()=>workflow.listEngagementGoLinks(input)));
 }
 @Post('engagement-retirements')
 @EngagementOperation('POST')
 @ApiOperation({operationId:'retireEngagementDefinition',summary:'Retire engagement without erasing history'})
 @ApiBody({schema:c.inputs.engagement})
 @ApiOkResponse({schema:c.docs.retired})
 async retireEngagementDefinition(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.retired.parse(await this.identity.runWorkflow(()=>workflow.retireEngagementDefinition(input)));
 }
 @Post('engagement-go-link-revocations')
 @EngagementOperation('POST')
 @ApiOperation({operationId:'revokeEngagementGoLink',summary:'Revoke exact engagement link'})
 @ApiBody({schema:c.inputs.link})
 @ApiOkResponse({schema:c.docs.revoked})
 async revokeEngagementGoLink(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.revoked.parse(await this.identity.runWorkflow(()=>workflow.revokeEngagementGoLink(input)));
 }
 @Get('site-engagement-definitions')
 @EngagementOperation('GET')
 @ApiOperation({operationId:'listSiteEngagementDefinitions',summary:'List Site and package scoped engagement library'})
 @ApiQuery({name:'siteId',required:true,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'packageId',required:true,schema:{type:'string',format:'uuid'}})
 @ApiOkResponse({schema:c.docs.definitions})
 async listSiteEngagementDefinitions(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.siteQuery,query);
  return c.results.definitions.parse(await this.identity.runWorkflow(()=>workflow.listSiteEngagementDefinitions(input)));
 }
 @Get('engagement-email-draft')
 @EngagementOperation('GET')
 @ApiOperation({operationId:'prepareEngagementEmailDraft',summary:'Prepare saved email invitation without sending'})
 @ApiQuery({name:'engagementId',required:true,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'linkId',required:true,schema:{type:'string',format:'uuid'}})
 @ApiOkResponse({schema:c.docs.draft})
 async prepareEngagementEmailDraft(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.linkQuery,query);
  return c.results.draft.parse(await this.identity.runWorkflow(()=>workflow.prepareEngagementEmailDraft(input)));
 }
 @Get('engagement-owner-destinations')
 @EngagementOperation('GET')
 @ApiOperation({operationId:'listOwnerEngagementDestinations',summary:'Discover directly owned public destinations'})
 @ApiQuery({name:'ownerKind',required:true,enum:['platform','organization']})
 @ApiQuery({name:'organizationId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'kind',required:true,enum:['information','adult-training']})
 @ApiQuery({name:'siteId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiQuery({name:'term',required:false,schema:{type:'string',maxLength:90}})
 @ApiOkResponse({schema:c.docs.choices})
 async listOwnerEngagementDestinations(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.destinationsQuery,query);
  return c.results.choices.parse(await this.identity.runWorkflow(()=>workflow.listOwnerEngagementDestinations(input)));
 }
 @Get('owner-engagement-definitions')
 @EngagementOperation('GET')
 @ApiOperation({operationId:'listOwnerEngagementDefinitions',summary:'Read platform or organization engagement library'})
 @ApiQuery({name:'ownerKind',required:true,enum:['platform','organization']})
 @ApiQuery({name:'organizationId',required:false,schema:{type:'string',format:'uuid'}})
 @ApiOkResponse({schema:c.docs.definitions})
 async listOwnerEngagementDefinitions(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.ownerQuery,query);
  return c.results.definitions.parse(await this.identity.runWorkflow(()=>workflow.listOwnerEngagementDefinitions(input)));
 }
}

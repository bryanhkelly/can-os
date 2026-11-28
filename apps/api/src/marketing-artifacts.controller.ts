import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './marketing-artifacts.contracts';
function ArtifactOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Site marketing artifacts')
@Controller()
export class MarketingArtifactsController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('site-marketing-artifact-previews')
 @ArtifactOperation('POST')
 @ApiOperation({operationId:'previewSiteMarketingArtifact',summary:'preview Site Marketing Artifact; verified Site scope'})
 @ApiBody({schema:c.inputs.previewInputSchema})
 @ApiOkResponse({schema:c.docs.preview})
 async previewSiteMarketingArtifact(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.preview.parse(await this.identity.runWorkflow(()=>workflow.previewSiteMarketingArtifact(input)));
 }
 @Post('site-marketing-package-releases')
 @ArtifactOperation('POST')
 @ApiOperation({operationId:'createSiteMarketingPackageRelease',summary:'create Site Marketing Package Release; verified Site scope'})
 @ApiBody({schema:c.inputs.packageReleaseInput})
 @ApiOkResponse({schema:c.docs.receipt})
 async createSiteMarketingPackageRelease(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.receipt.parse(await this.identity.runWorkflow(()=>workflow.createSiteMarketingPackageRelease(input)));
 }
 @Get('site-marketing-package-releases')
 @ArtifactOperation('GET')
 @ApiOperation({operationId:'listSiteMarketingPackageReleases',summary:'list Site Marketing Package Releases; verified Site scope'})
 @ApiQuery({name:'siteId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'packageId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.docs.history})
 async listSiteMarketingPackageReleases(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.scope,query);
  return c.results.history.parse(await this.identity.runWorkflow(()=>workflow.listSiteMarketingPackageReleases(input)));
 }
 @Get('site-marketing-artifact-releases')
 @ArtifactOperation('GET')
 @ApiOperation({operationId:'listSiteMarketingReleases',summary:'list Site Marketing Releases; verified Site scope'})
 @ApiQuery({name:'siteId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'packageId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.docs.legacy})
 async listSiteMarketingReleases(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.scope,query);
  return c.results.legacy.parse(await this.identity.runWorkflow(()=>workflow.listSiteMarketingReleases(input)));
 }
 @Get('site-marketing-artifact-output')
 @ArtifactOperation('GET')
 @ApiOperation({operationId:'getSiteMarketingReleaseOutput',summary:'get Site Marketing Release Output; verified Site scope'})
 @ApiQuery({name:'siteId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'releaseId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.docs.output})
 async getSiteMarketingReleaseOutput(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.release,query);
  return c.results.output.parse(await this.identity.runWorkflow(()=>workflow.getSiteMarketingReleaseOutput(input)));
 }
 @Post('site-marketing-artifact-withdrawals')
 @ArtifactOperation('POST')
 @ApiOperation({operationId:'withdrawSiteMarketingRelease',summary:'withdraw Site Marketing Release; verified Site scope'})
 @ApiBody({schema:c.inputs.withdrawInput})
 @ApiOkResponse({schema:c.docs.withdrawn})
 async withdrawSiteMarketingRelease(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.withdrawn.parse(await this.identity.runWorkflow(()=>workflow.withdrawSiteMarketingRelease(input)));
 }
}

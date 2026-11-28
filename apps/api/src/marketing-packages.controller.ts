import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './marketing-packages.contracts';
function MarketingOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Site marketing packages')
@Controller()
export class MarketingPackagesController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('site-marketing-suggestions')
 @MarketingOperation('GET')
 @ApiOperation({operationId:'readSiteMarketingSuggestionsV61',summary:'read Site Marketing Suggestions V61; exact Site authority'})
 @ApiQuery({name:'siteId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.docs.suggestions})
 async readSiteMarketingSuggestionsV61(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.siteQuery,query);
  return c.results.suggestions.parse(await this.identity.runWorkflow(()=>workflow.readSiteMarketingSuggestionsV61(input)));
 }
 @Get('site-marketing-packages')
 @MarketingOperation('GET')
 @ApiOperation({operationId:'listSiteMarketingPackagesPageV61',summary:'list Site Marketing Packages Page V61; exact Site authority'})
 @ApiQuery({name:'siteId',schema:{type:'string',format:'uuid'},required:true})
 @ApiQuery({name:'cursor',schema:{type:'string',format:'uuid'},required:false})
 @ApiQuery({name:'limit',schema:{type:'integer',minimum:1,maximum:100,default:50},required:false})
 @ApiOkResponse({schema:c.docs.page})
 async listSiteMarketingPackagesPageV61(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),input=validated(c.pageQuery,query);
  return c.results.page.parse(await this.identity.runWorkflow(()=>workflow.listSiteMarketingPackagesPageV61(input)));
 }
 @Post('site-marketing-packages')
 @MarketingOperation('POST')
 @ApiOperation({operationId:'createSiteMarketingPackageV61',summary:'create Site Marketing Package V61; exact Site authority'})
 @ApiBody({schema:c.inputs.createInput})
 @ApiOkResponse({schema:c.docs.package})
 async createSiteMarketingPackageV61(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.package.parse(await this.identity.runWorkflow(()=>workflow.createSiteMarketingPackageV61(input)));
 }
 @Post('site-marketing-package-revisions')
 @MarketingOperation('POST')
 @ApiOperation({operationId:'saveSiteMarketingPackageV61',summary:'save Site Marketing Package V61; exact Site authority'})
 @ApiBody({schema:c.inputs.saveInput})
 @ApiOkResponse({schema:c.docs.package})
 async saveSiteMarketingPackageV61(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.package.parse(await this.identity.runWorkflow(()=>workflow.saveSiteMarketingPackageV61(input)));
 }
 @Post('site-marketing-package-copies')
 @MarketingOperation('POST')
 @ApiOperation({operationId:'duplicateSiteMarketingPackageV61',summary:'duplicate Site Marketing Package V61; exact Site authority'})
 @ApiBody({schema:c.inputs.recordInput})
 @ApiOkResponse({schema:c.docs.package})
 async duplicateSiteMarketingPackageV61(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.package.parse(await this.identity.runWorkflow(()=>workflow.duplicateSiteMarketingPackageV61(input)));
 }
 @Post('site-marketing-package-status')
 @MarketingOperation('POST')
 @ApiOperation({operationId:'archiveSiteMarketingPackageV61',summary:'archive Site Marketing Package V61; exact Site authority'})
 @ApiBody({schema:c.inputs.archiveInput})
 @ApiOkResponse({schema:c.docs.package})
 async archiveSiteMarketingPackageV61(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.package.parse(await this.identity.runWorkflow(()=>workflow.archiveSiteMarketingPackageV61(input)));
 }
 @Post('site-marketing-package-brand')
 @MarketingOperation('POST')
 @ApiOperation({operationId:'selectSiteMarketingPackageBrandV61',summary:'select Site Marketing Package Brand V61; exact Site authority'})
 @ApiBody({schema:c.inputs.brandInput})
 @ApiOkResponse({schema:c.docs.package})
 async selectSiteMarketingPackageBrandV61(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.package.parse(await this.identity.runWorkflow(()=>workflow.selectSiteMarketingPackageBrandV61(input)));
 }
 @Post('site-marketing-package-deletions')
 @MarketingOperation('POST')
 @ApiOperation({operationId:'deleteSiteMarketingPackageV61',summary:'delete Site Marketing Package V61; exact Site authority'})
 @ApiBody({schema:c.inputs.revisionInput})
 @ApiOkResponse({schema:c.docs.deleted})
 async deleteSiteMarketingPackageV61(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),input=body;
  return c.results.deleted.parse(await this.identity.runWorkflow(()=>workflow.deleteSiteMarketingPackageV61(input)));
 }
}

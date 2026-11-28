import {Controller,Get,Post,Body,Param,Query,Req,HttpCode,Header,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './website.contracts';
function WebsiteOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),Header('Referrer-Policy','no-referrer'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Website and Brand editor')
@Controller('sites/:siteId')
export class WebsiteController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('website-preview')
 @WebsiteOperation('GET')
 @ApiOperation({operationId:'getPartnerWebsitePreviewView',summary:'get Partner Website Preview View; private editor operation, not public publication'})
 
 @ApiOkResponse({schema:c.docs.savedPreview})
 async getPartnerWebsitePreviewView(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.params,params),...validated(c.empty,query)},workflow=verifiedWorkflow(req);
  return c.results.savedPreview.parse(await this.identity.runWorkflow(()=>workflow.getPartnerWebsitePreviewView(input)));
 }
 @Post('website-preview')
 @WebsiteOperation('POST')
 @ApiOperation({operationId:'previewChurchWebsiteDraft',summary:'preview Church Website Draft; private editor operation, not public publication'})
 @ApiBody({schema:c.inputs.preview})
 @ApiOkResponse({schema:c.docs.preview})
 async previewChurchWebsiteDraft(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.preview,body)},workflow=verifiedWorkflow(req);
  return c.results.preview.parse(await this.identity.runWorkflow(()=>workflow.previewChurchWebsiteDraft(input)));
 }
 @Post('website-and-brand-versions')
 @WebsiteOperation('POST')
 @ApiOperation({operationId:'saveSiteWebsiteAndBrand',summary:'save Site Website And Brand; private editor operation, not public publication'})
 @ApiBody({schema:c.inputs.save})
 @ApiOkResponse({schema:c.docs.saved})
 async saveSiteWebsiteAndBrand(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.save,body)},workflow=verifiedWorkflow(req);
  return c.results.saved.parse(await this.identity.runWorkflow(()=>workflow.saveSiteWebsiteAndBrand(input)));
 }
 @Post('website-restorations')
 @WebsiteOperation('POST')
 @ApiOperation({operationId:'restoreChurchWebsiteContent',summary:'restore Church Website Content; private editor operation, not public publication'})
 @ApiBody({schema:c.inputs.restore})
 @ApiOkResponse({schema:c.docs.restored})
 async restoreChurchWebsiteContent(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.restore,body)},workflow=verifiedWorkflow(req);
  return c.results.restored.parse(await this.identity.runWorkflow(()=>workflow.restoreChurchWebsiteContent(input)));
 }
 @Post('website-preparations')
 @WebsiteOperation('POST')
 @ApiOperation({operationId:'prepareSchoolWebsite',summary:'prepare School Website; private editor operation, not public publication'})
 @ApiBody({schema:c.inputs.empty})
 @ApiOkResponse({schema:c.docs.prepared})
 async prepareSchoolWebsite(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.empty,body)},workflow=verifiedWorkflow(req);
  return c.results.prepared.parse(await this.identity.runWorkflow(()=>workflow.prepareSchoolWebsite(input)));
 }
}

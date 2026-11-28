import {Controller,Get,Post,Body,Param,Query,Req,HttpCode,Header,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './preview-shares.contracts';
function PreviewShareOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),Header('Referrer-Policy','no-referrer'),Header('Cache-Control','private, no-store'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Frozen website preview shares')
@Controller('sites/:siteId')
export class PreviewSharesController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('preview-shares')
 @PreviewShareOperation('GET')
 
 @ApiOperation({operationId:'listSitePreviewShares',summary:'list Site Preview Shares; unlisted immutable preview, not public publication'})
 
 @ApiOkResponse({schema:c.docs.list})
 async listSitePreviewShares(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.siteParams,params),...validated(c.empty,query)},workflow=verifiedWorkflow(req);
  return c.results.list.parse(await this.identity.runWorkflow(()=>workflow.listSitePreviewShares(input)));
 }
 @Post('preview-shares')
 @PreviewShareOperation('POST')
 
 @ApiOperation({operationId:'createSitePreviewShare',summary:'create Site Preview Share; unlisted immutable preview, not public publication'})
 @ApiBody({schema:c.inputs.create})
 @ApiOkResponse({schema:c.docs.create})
 async createSitePreviewShare(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.siteParams,params),...validated(c.bodies.create,body)},workflow=verifiedWorkflow(req);
  return c.results.create.parse(await this.identity.runWorkflow(()=>workflow.createSitePreviewShare(input)));
 }
 @Post('preview-shares/:shareId/status')
 @PreviewShareOperation('POST')
 @ApiParam({name:'shareId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'setSitePreviewSharePaused',summary:'set Site Preview Share Paused; unlisted immutable preview, not public publication'})
 @ApiBody({schema:c.inputs.status})
 @ApiOkResponse({schema:c.docs.status})
 async setSitePreviewSharePaused(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.shareParams,params),...validated(c.bodies.status,body)},workflow=verifiedWorkflow(req);
  return c.results.status.parse(await this.identity.runWorkflow(()=>workflow.setSitePreviewSharePaused(input)));
 }
 @Post('preview-shares/:shareId/revocation')
 @PreviewShareOperation('POST')
 @ApiParam({name:'shareId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'revokeSitePreviewShare',summary:'revoke Site Preview Share; unlisted immutable preview, not public publication'})
 @ApiBody({schema:c.inputs.revoke})
 @ApiOkResponse({schema:c.docs.status})
 async revokeSitePreviewShare(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.shareParams,params),...validated(c.bodies.revoke,body)},workflow=verifiedWorkflow(req);
  return c.results.status.parse(await this.identity.runWorkflow(()=>workflow.revokeSitePreviewShare(input)));
 }
}

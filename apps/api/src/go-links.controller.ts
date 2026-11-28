import {Controller,Get,Post,Body,Param,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './go-links.contracts';
function LinkOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[ApiQuery({name:'packageId',type:String,required:false})]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Site Go Links')
@Controller('sites/:siteId')
export class GoLinksController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('go-links')
 @LinkOperation('POST')
 
 @ApiOperation({operationId:'createSiteGoLink',summary:'create Site Go Link; current Site and package scope'})
 @ApiBody({schema:c.inputs.create})
 @ApiOkResponse({schema:c.docs.link})
 async createSiteGoLink(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.siteParams,params),...validated(c.bodies.create,body)},workflow=verifiedWorkflow(req);
  return c.results.link.parse(await this.identity.runWorkflow(()=>workflow.createSiteGoLink(input)));
 }
 @Get('go-links')
 @LinkOperation('GET')
 
 @ApiOperation({operationId:'listSiteGoLinksPage',summary:'list Site Go Links Page; current Site and package scope'})
 @ApiQuery({name:'cursor',type:String,required:false})
 @ApiQuery({name:'limit',type:Number,required:false})
 @ApiQuery({name:'term',type:String,required:false})
 @ApiOkResponse({schema:c.docs.page})
 async listSiteGoLinksPage(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.siteParams,params),...validated(c.queries.page,query)},workflow=verifiedWorkflow(req);
  return c.results.page.parse(await this.identity.runWorkflow(()=>workflow.listSiteGoLinksPage(input)));
 }
 @Get('go-link-destinations')
 @LinkOperation('GET')
 
 @ApiOperation({operationId:'listAvailableGoDestinations',summary:'list Available Go Destinations; current Site and package scope'})
 @ApiQuery({name:'kind',enum:['site-page','adult-training','class','enrichment','information','website-preview'],required:true})
 @ApiQuery({name:'term',type:String,required:false})
 @ApiOkResponse({schema:c.docs.choices})
 async listAvailableGoDestinations(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.siteParams,params),...validated(c.queries.choices,query)},workflow=verifiedWorkflow(req);
  return c.results.choices.parse(await this.identity.runWorkflow(()=>workflow.listAvailableGoDestinations(input)));
 }
 @Get('go-links/:linkId/inspection')
 @LinkOperation('GET')
 @ApiParam({name:'linkId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'inspectSavedGoLink',summary:'inspect Saved Go Link; current Site and package scope'})
 
 @ApiOkResponse({schema:c.docs.inspection})
 async inspectSavedGoLink(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.linkParams,params),...validated(c.queries.scope,query)},workflow=verifiedWorkflow(req);
  return c.results.inspection.parse(await this.identity.runWorkflow(()=>workflow.inspectSavedGoLink(input)));
 }
 @Post('go-links/:linkId/status')
 @LinkOperation('POST')
 @ApiParam({name:'linkId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'setSiteGoLinkPaused',summary:'set Site Go Link Paused; current Site and package scope'})
 @ApiBody({schema:c.inputs.manage})
 @ApiOkResponse({schema:c.docs.transition})
 async setSiteGoLinkPaused(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.linkParams,params),...validated(c.bodies.manage,body)},workflow=verifiedWorkflow(req);
  return c.results.transition.parse(await this.identity.runWorkflow(()=>workflow.setSiteGoLinkPaused(input)));
 }
 @Post('go-links/:linkId/revocation')
 @LinkOperation('POST')
 @ApiParam({name:'linkId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'revokeSiteGoLink',summary:'revoke Site Go Link; current Site and package scope'})
 @ApiBody({schema:c.inputs.revoke})
 @ApiOkResponse({schema:c.docs.transition})
 async revokeSiteGoLink(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.linkParams,params),...validated(c.bodies.revoke,body)},workflow=verifiedWorkflow(req);
  return c.results.transition.parse(await this.identity.runWorkflow(()=>workflow.revokeSiteGoLink(input)));
 }
}

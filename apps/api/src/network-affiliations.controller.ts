import {Controller,Get,Post,Param,Query,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiBody,ApiHeader,ApiParam,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './network-affiliations.contracts';
function Operation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Network affiliations')
@Controller()
export class NetworkAffiliationsController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('affiliation-networks')
 @Operation('GET')
 
 
 @ApiOperation({operationId:'listAffiliationNetworks',summary:'listAffiliationNetworks; verified local or denomination HQ authority'})
 
 @ApiOkResponse({schema:c.docs.networks})
 async listAffiliationNetworks(@Req() req:FastifyRequest,@Param() params:unknown,@Query() value:unknown){
  const input={...validated(c.empty,params),...validated(c.empty,value)};
  return c.results.networks.parse(c.wire(await this.identity.runWorkflow(()=>verifiedWorkflow(req).listAffiliationNetworks(input))));
 }
 @Get('sites/:siteId/affiliations')
 @Operation('GET')
 @ApiParam({name:'siteId',type:String,format:'uuid',required:true})
 
 @ApiOperation({operationId:'listSiteAffiliations',summary:'listSiteAffiliations; verified local or denomination HQ authority'})
 
 @ApiOkResponse({schema:c.docs.local})
 async listSiteAffiliations(@Req() req:FastifyRequest,@Param() params:unknown,@Query() value:unknown){
  const input={...validated(c.site,params),...validated(c.empty,value)};
  return c.results.local.parse(c.wire(await this.identity.runWorkflow(()=>verifiedWorkflow(req).listSiteAffiliations(input))));
 }
 @Post('sites/:siteId/affiliations')
 @Operation('POST')
 @ApiParam({name:'siteId',type:String,format:'uuid',required:true})
 
 @ApiOperation({operationId:'requestSiteAffiliation',summary:'requestSiteAffiliation; verified local or denomination HQ authority'})
 @ApiBody({schema:c.inputs.request})
 @ApiOkResponse({schema:c.docs.requested})
 async requestSiteAffiliation(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.site,params),...validated(c.bodies.request,value)};
  return c.results.requested.parse(c.wire(await this.identity.runWorkflow(()=>verifiedWorkflow(req).requestSiteAffiliation(input))));
 }
 @Get('me/network-affiliations')
 @Operation('GET')
 
 
 @ApiOperation({operationId:'listNetworkAffiliations',summary:'listNetworkAffiliations; verified local or denomination HQ authority'})
 
 @ApiOkResponse({schema:c.docs.hq})
 async listNetworkAffiliations(@Req() req:FastifyRequest,@Param() params:unknown,@Query() value:unknown){
  const input={...validated(c.empty,params),...validated(c.empty,value)};
  return c.results.hq.parse(c.wire(await this.identity.runWorkflow(()=>verifiedWorkflow(req).listNetworkAffiliations(input))));
 }
 @Post('me/network-affiliations/:affiliationId/decisions')
 @Operation('POST')
 
 @ApiParam({name:'affiliationId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'reviewNetworkAffiliation',summary:'reviewNetworkAffiliation; verified local or denomination HQ authority'})
 @ApiBody({schema:c.inputs.review})
 @ApiOkResponse({schema:c.docs.decision})
 async reviewNetworkAffiliation(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.affiliation,params),...validated(c.bodies.review,value)};
  return c.results.decision.parse(c.wire(await this.identity.runWorkflow(()=>verifiedWorkflow(req).reviewNetworkAffiliation(input))));
 }
 @Post('sites/:siteId/affiliations/:affiliationId/withdrawals')
 @Operation('POST')
 @ApiParam({name:'siteId',type:String,format:'uuid',required:true})
 @ApiParam({name:'affiliationId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'withdrawSiteAffiliation',summary:'withdrawSiteAffiliation; verified local or denomination HQ authority'})
 @ApiBody({schema:c.inputs.empty})
 @ApiOkResponse({schema:c.docs.decision})
 async withdrawSiteAffiliation(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.siteAffiliation,params),...validated(c.empty,value)};
  return c.results.decision.parse(c.wire(await this.identity.runWorkflow(()=>verifiedWorkflow(req).withdrawSiteAffiliation(input))));
 }
}

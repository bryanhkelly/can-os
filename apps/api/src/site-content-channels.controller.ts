import {Controller,Get,Post,Param,Query,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiBody,ApiHeader,ApiParam,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './site-content-channels.contracts';
function Operation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Site website content channels')
@Controller('sites/:siteId')
export class SiteContentChannelsController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('content-channels')
 @Operation('GET')
 @ApiOperation({operationId:'getSiteContentChannels',summary:'getSiteContentChannels; source-owned website layout, not enrollment or Offering approval'})
 
 @ApiOkResponse({schema:c.docs.config})
 async getSiteContentChannels(@Req() req:FastifyRequest,@Param() params:unknown,@Query() value:unknown){
  const input={...validated(c.params,params),...validated(c.empty,value)};
  return c.results.config.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).getSiteContentChannels(input)));
 }
 @Post('content-channel-revisions')
 @Operation('POST')
 @ApiOperation({operationId:'saveSiteContentChannels',summary:'saveSiteContentChannels; source-owned website layout, not enrollment or Offering approval'})
 @ApiBody({schema:c.inputs.save})
 @ApiOkResponse({schema:c.docs.config})
 async saveSiteContentChannels(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.save,value)};
  return c.results.config.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).saveSiteContentChannels(input)));
 }
 @Post('content-channel-publications')
 @Operation('POST')
 @ApiOperation({operationId:'publishSiteContentChannels',summary:'publishSiteContentChannels; source-owned website layout, not enrollment or Offering approval'})
 @ApiBody({schema:c.inputs.publish})
 @ApiOkResponse({schema:c.docs.published})
 async publishSiteContentChannels(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.publish,value)};
  return c.results.published.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).publishSiteContentChannels(input)));
 }
}

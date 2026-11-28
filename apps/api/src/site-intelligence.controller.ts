import {Controller,Get,Post,Param,Query,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiBody,ApiHeader,ApiParam,ApiQuery,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './site-intelligence.contracts';
function Operation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Site Intelligence')
@Controller('sites/:siteId')
export class SiteIntelligenceController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('intelligence-content')
 @Operation('GET')
 @ApiOperation({operationId:'readSiteIntelligenceContent',summary:'readSiteIntelligenceContent; consent-gated editorial draft, not institutional approval'})
 @ApiQuery({name:'consumer',enum:['website','outreach'],required:true})
 @ApiOkResponse({schema:c.docs.stored})
 async readSiteIntelligenceContent(@Req() req:FastifyRequest,@Param() params:unknown,@Query() value:unknown){
  const input={...validated(c.params,params),...validated(c.consumerQuery,value)};
  return c.results.stored.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).readSiteIntelligenceContent(input)));
 }
 @Post('intelligence-previews')
 @Operation('POST')
 @ApiOperation({operationId:'previewSiteIntelligence',summary:'previewSiteIntelligence; consent-gated editorial draft, not institutional approval'})
 @ApiBody({schema:c.inputs.preview})
 @ApiOkResponse({schema:c.docs.preview})
 async previewSiteIntelligence(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.preview,value)};
  return c.results.preview.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).previewSiteIntelligence(input)));
 }
 @Post('intelligence-generations')
 @Operation('POST')
 @ApiOperation({operationId:'processSiteIntelligence',summary:'processSiteIntelligence; consent-gated editorial draft, not institutional approval'})
 @ApiBody({schema:c.inputs.process})
 @ApiOkResponse({schema:c.docs.process})
 async processSiteIntelligence(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.process,value)};
  return c.results.process.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).processSiteIntelligence(input)));
 }
}

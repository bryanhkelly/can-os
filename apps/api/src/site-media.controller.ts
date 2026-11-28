import {Controller,Get,Post,Param,Query,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiBody,ApiHeader,ApiParam,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './site-media.contracts';
function Operation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Site media rights and private uploads')
@Controller('sites/:siteId')
export class SiteMediaController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('media-upload-intents')
 @Operation('POST')
 @ApiOperation({operationId:'beginSchoolSiteMediaUpload',summary:'beginSchoolSiteMediaUpload; private Site media and independently reviewed rights'})
 @ApiBody({schema:c.inputs.upload})
 @ApiOkResponse({schema:c.docs.upload})
 async beginSchoolSiteMediaUpload(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.upload,value)};
  return c.results.upload.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).beginSchoolSiteMediaUpload(input)));
 }
 @Post('media-upload-completions')
 @Operation('POST')
 @ApiOperation({operationId:'finishSchoolSiteMediaUpload',summary:'finishSchoolSiteMediaUpload; private Site media and independently reviewed rights'})
 @ApiBody({schema:c.inputs.finish})
 @ApiOkResponse({schema:c.docs.finish})
 async finishSchoolSiteMediaUpload(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.finish,value)};
  return c.results.finish.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).finishSchoolSiteMediaUpload(input)));
 }
 @Get('media')
 @Operation('GET')
 @ApiOperation({operationId:'listSchoolSiteMedia',summary:'listSchoolSiteMedia; private Site media and independently reviewed rights'})
 
 @ApiOkResponse({schema:c.docs.list})
 async listSchoolSiteMedia(@Req() req:FastifyRequest,@Param() params:unknown,@Query() value:unknown){
  const input={...validated(c.params,params),...validated(c.empty,value)};
  return c.results.list.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).listSchoolSiteMedia(input)));
 }
 @Post('media-reviews')
 @Operation('POST')
 @ApiOperation({operationId:'approveSchoolSiteMediaFolder',summary:'approveSchoolSiteMediaFolder; private Site media and independently reviewed rights'})
 @ApiBody({schema:c.inputs.review})
 @ApiOkResponse({schema:c.docs.review})
 async approveSchoolSiteMediaFolder(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.review,value)};
  return c.results.review.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).approveSchoolSiteMediaFolder(input)));
 }
 @Post('media-revocations')
 @Operation('POST')
 @ApiOperation({operationId:'revokeSchoolSiteMediaFolder',summary:'revokeSchoolSiteMediaFolder; private Site media and independently reviewed rights'})
 @ApiBody({schema:c.inputs.revoke})
 @ApiOkResponse({schema:c.docs.revoke})
 async revokeSchoolSiteMediaFolder(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.revoke,value)};
  return c.results.revoke.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).revokeSchoolSiteMediaFolder(input)));
 }
}

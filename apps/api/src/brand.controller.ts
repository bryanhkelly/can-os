import {Controller,Get,Post,Body,Param,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './brand.contracts';
function BrandOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Site Brand and publication')
@Controller('sites/:siteId')
export class BrandController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('brand')
 @BrandOperation('GET')
 @ApiOperation({operationId:'readSiteBrandHttp',summary:'read Site Brand Http; exact authorized Site and revision'})
 
 @ApiQuery({name:'versionId',type:String,required:false})
 @ApiOkResponse({schema:c.docs.brand})
 async readSiteBrandHttp(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.siteParams,params),...validated(c.brandQuery,query)},workflow=verifiedWorkflow(req);
  return c.results.brand.parse(await this.identity.runWorkflow(()=>workflow.readSiteBrandHttp(input)));
 }
 @Post('brand-versions')
 @BrandOperation('POST')
 @ApiOperation({operationId:'saveSiteBrandHttp',summary:'save Site Brand Http; exact authorized Site and revision'})
 
 @ApiBody({schema:c.inputs.save})
 @ApiOkResponse({schema:c.docs.saved})
 async saveSiteBrandHttp(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.siteParams,params),...validated(c.bodies.save,body)},workflow=verifiedWorkflow(req);
  return c.results.saved.parse(await this.identity.runWorkflow(()=>workflow.saveSiteBrandHttp(input)));
 }
 @Post('brand-assets/:assetId/revocation')
 @BrandOperation('POST')
 @ApiOperation({operationId:'revokeSiteBrandAssetHttp',summary:'revoke Site Brand Asset Http; exact authorized Site and revision'})
 @ApiParam({name:'assetId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputs.revoke})
 @ApiOkResponse({schema:c.docs.revoked})
 async revokeSiteBrandAssetHttp(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.assetParams,params),...validated(c.bodies.revoke,body)},workflow=verifiedWorkflow(req);
  return c.results.revoked.parse(await this.identity.runWorkflow(()=>workflow.revokeSiteBrandAssetHttp(input)));
 }
 @Get('publication-readiness')
 @BrandOperation('GET')
 @ApiOperation({operationId:'readLaunchSitePublication',summary:'read Launch Site Publication; exact authorized Site and revision'})
 
 
 @ApiOkResponse({schema:c.docs.readiness})
 async readLaunchSitePublication(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.siteParams,params),...validated(c.emptyQuery,query)},workflow=verifiedWorkflow(req);
  return c.results.readiness.parse(await this.identity.runWorkflow(()=>workflow.readLaunchSitePublication(input)));
 }
 @Post('website-copy-reviews')
 @BrandOperation('POST')
 @ApiOperation({operationId:'reviewLaunchSiteWebsiteCopy',summary:'review Launch Site Website Copy; exact authorized Site and revision'})
 
 @ApiBody({schema:c.inputs.review})
 @ApiOkResponse({schema:c.docs.reviewed})
 async reviewLaunchSiteWebsiteCopy(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.siteParams,params),...validated(c.bodies.review,body)},workflow=verifiedWorkflow(req);
  return c.results.reviewed.parse(await this.identity.runWorkflow(()=>workflow.reviewLaunchSiteWebsiteCopy(input)));
 }
}

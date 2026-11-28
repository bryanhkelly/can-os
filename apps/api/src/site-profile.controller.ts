import {Controller,Get,Post,Body,Param,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './site-profile.contracts';
function ProfileOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Site Profile')
@Controller('sites/:siteId')
export class SiteProfileController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('profile')
 @ProfileOperation('GET')
 @ApiOperation({operationId:'getLaunchSiteConfiguration',summary:'get Launch Site Configuration; self-reported private configuration is not approval'})
 
 @ApiOkResponse({schema:c.docs.profile})
 async getLaunchSiteConfiguration(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.params,params),...validated(c.emptyQuery,query)},workflow=verifiedWorkflow(req);
  return c.results.profile.parse(await this.identity.runWorkflow(()=>workflow.getLaunchSiteConfiguration(input)));
 }
 @Post('physical-address')
 @ProfileOperation('POST')
 @ApiOperation({operationId:'updateLaunchSiteAddress',summary:'update Launch Site Address; self-reported private configuration is not approval'})
 @ApiBody({schema:c.inputs.address})
 @ApiOkResponse({schema:c.docs.addressReceipt})
 async updateLaunchSiteAddress(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.address,body)},workflow=verifiedWorkflow(req);
  return c.results.addressReceipt.parse(await this.identity.runWorkflow(()=>workflow.updateLaunchSiteAddress(input)));
 }
 @Post('contact')
 @ProfileOperation('POST')
 @ApiOperation({operationId:'updateLaunchSiteContact',summary:'update Launch Site Contact; self-reported private configuration is not approval'})
 @ApiBody({schema:c.inputs.contact})
 @ApiOkResponse({schema:c.docs.receipt})
 async updateLaunchSiteContact(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.contact,body)},workflow=verifiedWorkflow(req);
  return c.results.receipt.parse(await this.identity.runWorkflow(()=>workflow.updateLaunchSiteContact(input)));
 }
 @Post('identity')
 @ProfileOperation('POST')
 @ApiOperation({operationId:'updateLaunchSiteIdentity',summary:'update Launch Site Identity; self-reported private configuration is not approval'})
 @ApiBody({schema:c.inputs.identity})
 @ApiOkResponse({schema:c.docs.receipt})
 async updateLaunchSiteIdentity(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.identity,body)},workflow=verifiedWorkflow(req);
  return c.results.receipt.parse(await this.identity.runWorkflow(()=>workflow.updateLaunchSiteIdentity(input)));
 }
 @Post('legacy-information')
 @ProfileOperation('POST')
 @ApiOperation({operationId:'updateLaunchSiteInformation',summary:'update Launch Site Information; self-reported private configuration is not approval',deprecated:true})
 @ApiBody({schema:c.inputs.information})
 @ApiOkResponse({schema:c.docs.receipt})
 async updateLaunchSiteInformation(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.information,body)},workflow=verifiedWorkflow(req);
  return c.results.receipt.parse(await this.identity.runWorkflow(()=>workflow.updateLaunchSiteInformation(input)));
 }
}

import {Controller,Post,Body,Param,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './site-publishing.contracts';
function PublishingOperation(){
 return applyDecorators(GovernedWorkflowOperation('can'),HttpCode(200),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),ApiHeader({name:'Origin',required:true}),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Site publication decisions')
@Controller('sites/:siteId')
export class SitePublishingController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('public-identity-changes')
 @PublishingOperation()
 
 @ApiOperation({operationId:'renameSitePublicIdentity',summary:'rename Site Public Identity; does not open registration or enrollment'})
 @ApiBody({schema:c.inputs.rename})
 @ApiOkResponse({schema:c.docs.rename})
 async renameSitePublicIdentity(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.rename,body)},workflow=verifiedWorkflow(req);
  return c.results.rename.parse(await this.identity.runWorkflow(()=>workflow.renameSitePublicIdentity(input)));
 }
 @Post('public-address-reservations')
 @PublishingOperation()
 
 @ApiOperation({operationId:'reserveSitePublicationAddress',summary:'reserve Site Publication Address; does not open registration or enrollment'})
 @ApiBody({schema:c.inputs.reserve})
 @ApiOkResponse({schema:c.docs.reserve})
 async reserveSitePublicationAddress(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.reserve,body)},workflow=verifiedWorkflow(req);
  return c.results.reserve.parse(await this.identity.runWorkflow(()=>workflow.reserveSitePublicationAddress(input)));
 }
 @Post('publication-decisions')
 @PublishingOperation()
 
 @ApiOperation({operationId:'setSitePublicationStatus',summary:'set Site Publication Status; does not open registration or enrollment'})
 @ApiBody({schema:c.inputs.publish})
 @ApiOkResponse({schema:c.docs.publish})
 async setSitePublicationStatus(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.publish,body)},workflow=verifiedWorkflow(req);
  return c.results.publish.parse(await this.identity.runWorkflow(()=>workflow.setSitePublicationStatus(input)));
 }
 @Post('programs/:programId/marketing-decisions')
 @PublishingOperation()
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'setAcademicProgramMarketingStatus',summary:'set Academic Program Marketing Status; does not open registration or enrollment'})
 @ApiBody({schema:c.inputs.marketing})
 @ApiOkResponse({schema:c.docs.marketing})
 async setAcademicProgramMarketingStatus(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(c.programParams,params),...validated(c.bodies.marketing,body)},workflow=verifiedWorkflow(req);
  return c.results.marketing.parse(await this.identity.runWorkflow(()=>workflow.setAcademicProgramMarketingStatus(input)));
 }
}

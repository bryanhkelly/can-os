import {Controller,Get,Post,Body,Param,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import {siteParams,informationBody,audiencesBody,results,docs} from './site-planning.contracts';
function SiteOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Site planning V6.1')
@Controller('sites/:siteId')
export class SitePlanningController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('information')
 @SiteOperation('GET')
 @ApiOperation({operationId:'readSiteInformationV61',summary:'read Site Information V61; private Site-scoped planning only'})
 
 @ApiOkResponse({schema:docs.information})
 async readSiteInformationV61(@Req() req:FastifyRequest,@Param() params:unknown){
  const input={...validated(siteParams,params)},workflow=verifiedWorkflow(req);
  return results.information.parse(await this.identity.runWorkflow(()=>workflow.readSiteInformationV61(input)));
 }
 @Post('information')
 @SiteOperation('POST')
 @ApiOperation({operationId:'saveSiteInformationV61',summary:'save Site Information V61; private Site-scoped planning only'})
 @ApiBody({schema:docs.informationBody})
 @ApiOkResponse({schema:docs.saved})
 async saveSiteInformationV61(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(siteParams,params),...validated(informationBody,body)},workflow=verifiedWorkflow(req);
  return results.saved.parse(await this.identity.runWorkflow(()=>workflow.saveSiteInformationV61(input)));
 }
 @Get('programs')
 @SiteOperation('GET')
 @ApiOperation({operationId:'readExistingSiteProgramsV61',summary:'read Existing Site Programs V61; private Site-scoped planning only'})
 
 @ApiOkResponse({schema:docs.existing})
 async readExistingSiteProgramsV61(@Req() req:FastifyRequest,@Param() params:unknown){
  const input={...validated(siteParams,params)},workflow=verifiedWorkflow(req);
  return results.existing.parse(await this.identity.runWorkflow(()=>workflow.readExistingSiteProgramsV61(input)));
 }
 @Get('programs-audiences')
 @SiteOperation('GET')
 @ApiOperation({operationId:'readSiteProgramsAudiencesV61',summary:'read Site Programs Audiences V61; private Site-scoped planning only'})
 
 @ApiOkResponse({schema:docs.audiences})
 async readSiteProgramsAudiencesV61(@Req() req:FastifyRequest,@Param() params:unknown){
  const input={...validated(siteParams,params)},workflow=verifiedWorkflow(req);
  return results.audiences.parse(await this.identity.runWorkflow(()=>workflow.readSiteProgramsAudiencesV61(input)));
 }
 @Post('programs-audiences')
 @SiteOperation('POST')
 @ApiOperation({operationId:'saveSiteProgramsAudiencesV61',summary:'save Site Programs Audiences V61; private Site-scoped planning only'})
 @ApiBody({schema:docs.audiencesBody})
 @ApiOkResponse({schema:docs.saved})
 async saveSiteProgramsAudiencesV61(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const input={...validated(siteParams,params),...validated(audiencesBody,body)},workflow=verifiedWorkflow(req);
  return results.saved.parse(await this.identity.runWorkflow(()=>workflow.saveSiteProgramsAudiencesV61(input)));
 }
}

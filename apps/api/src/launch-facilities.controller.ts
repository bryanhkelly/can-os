import {Controller,Get,Post,Param,Query,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiBody,ApiHeader,ApiParam,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './launch-facilities.contracts';
function Operation(mode:'can'|'canonical',method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation(mode,method),ApiCookieAuth('session'),ApiParam({name:'siteId',type:String,format:'uuid',required:true}),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Launch Studio physical facilities')
@Controller('sites/:siteId')
export class LaunchFacilitiesController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('spaces')
 @Operation('can','GET')
 
 @ApiOperation({operationId:'readLaunchSiteFacilitiesV61',summary:'readLaunchSiteFacilitiesV61; exact Site authority, planning only'})
 
 @ApiOkResponse({schema:c.docs.site})
 async readLaunchSiteFacilitiesV61(@Req() req:FastifyRequest,@Param() params:unknown,@Query() value:unknown){
  const input={...validated(c.params,params),...validated(c.empty,value)};
  return c.results.site.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).readLaunchSiteFacilitiesV61(input)));
 }
 @Post('spaces')
 @Operation('can','POST')
 
 @ApiOperation({operationId:'createLaunchSiteSpaceV61',summary:'createLaunchSiteSpaceV61; exact Site authority, planning only'})
 @ApiBody({schema:c.inputs.create})
 @ApiOkResponse({schema:c.docs.created})
 async createLaunchSiteSpaceV61(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.params,params),...validated(c.bodies.create,value)};
  return c.results.created.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).createLaunchSiteSpaceV61(input)));
 }
 @Post('spaces/:spaceId/revisions')
 @Operation('can','POST')
 @ApiParam({name:'spaceId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'saveLaunchSiteSpaceV61',summary:'saveLaunchSiteSpaceV61; exact Site authority, planning only'})
 @ApiBody({schema:c.inputs.save})
 @ApiOkResponse({schema:c.docs.saved})
 async saveLaunchSiteSpaceV61(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.spaceParams,params),...validated(c.bodies.save,value)};
  return c.results.saved.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).saveLaunchSiteSpaceV61(input)));
 }
 @Get('class-facilities')
 @Operation('canonical','GET')
 
 @ApiOperation({operationId:'readLaunchClassFacilitiesV61',summary:'readLaunchClassFacilitiesV61; exact Site authority, planning only'})
 
 @ApiOkResponse({schema:c.docs.classes})
 async readLaunchClassFacilitiesV61(@Req() req:FastifyRequest,@Param() params:unknown,@Query() value:unknown){
  const input={...validated(c.params,params),...validated(c.empty,value)};
  return c.results.classes.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).readLaunchClassFacilitiesV61(input)));
 }
 @Post('classes/:classId/physical-plan-revisions')
 @Operation('canonical','POST')
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'saveLaunchClassPhysicalPlanV61',summary:'saveLaunchClassPhysicalPlanV61; exact Site authority, planning only'})
 @ApiBody({schema:c.inputs.classPlan})
 @ApiOkResponse({schema:c.docs.classPlan})
 async saveLaunchClassPhysicalPlanV61(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.classParams,params),...validated(c.bodies.classPlan,value)};
  return c.results.classPlan.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).saveLaunchClassPhysicalPlanV61(input)));
 }
}

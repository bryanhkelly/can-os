import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './launch-workspace.contracts';
function WorkspaceOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Launch workspace')
@Controller()
export class LaunchWorkspaceController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('me/staff-launch-workspace')
 @WorkspaceOperation('GET')
 @ApiOperation({operationId:'getStaffLaunchWorkspace',summary:'get Staff Launch Workspace; current membership only'})
 
 @ApiOkResponse({schema:c.docs.staff})
 async getStaffLaunchWorkspace(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(c.empty,query),workflow=verifiedWorkflow(req);
  return c.results.staff.parse(await this.identity.runWorkflow(()=>workflow.getStaffLaunchWorkspace(input)));
 }
 @Get('me/launch-drafts')
 @WorkspaceOperation('GET')
 @ApiOperation({operationId:'getLaunchStudioDraft',summary:'get Launch Studio Draft; current membership only'})
 @ApiQuery({name:'audience',enum:['school','family','student','staff'],required:true})
 @ApiQuery({name:'context',type:String,required:true})
 @ApiOkResponse({schema:c.docs.draft})
 async getLaunchStudioDraft(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(c.selection,query),workflow=verifiedWorkflow(req);
  return c.results.draft.parse(await this.identity.runWorkflow(()=>workflow.getLaunchStudioDraft(input)));
 }
 @Post('me/launch-drafts')
 @WorkspaceOperation('POST')
 @ApiOperation({operationId:'saveLaunchStudioDraft',summary:'save Launch Studio Draft; current membership only'})
 @ApiBody({schema:c.saveDoc})
 @ApiOkResponse({schema:c.docs.save})
 async saveLaunchStudioDraft(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(c.save,body),workflow=verifiedWorkflow(req);
  return c.results.save.parse(await this.identity.runWorkflow(()=>workflow.saveLaunchStudioDraft(input)));
 }
 @Get('me/launch-options')
 @WorkspaceOperation('GET')
 @ApiOperation({operationId:'listLaunchOptions',summary:'list Launch Options; current membership only'})
 
 @ApiOkResponse({schema:c.docs.options})
 async listLaunchOptions(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(c.empty,query),workflow=verifiedWorkflow(req);
  return c.results.options.parse(await this.identity.runWorkflow(()=>workflow.listLaunchOptions(input)));
 }
 @Get('me/launch-entry')
 @WorkspaceOperation('GET')
 @ApiOperation({operationId:'getLaunchEntry',summary:'get Launch Entry; current membership only'})
 @ApiQuery({name:'siteId',type:String,required:false})
 @ApiQuery({name:'programId',type:String,required:false})
 @ApiOkResponse({schema:c.docs.entry})
 async getLaunchEntry(@Req() req:FastifyRequest,@Query() query:unknown){
  const input=validated(c.entry,query),workflow=verifiedWorkflow(req);
  return c.results.entry.parse(await this.identity.runWorkflow(()=>workflow.getLaunchEntry(input)));
 }
}

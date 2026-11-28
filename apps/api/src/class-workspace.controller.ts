import {Controller,Get,Param,Query,Req,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiResponse,ApiParam,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './class-workspace.contracts';
function ClassRead(){
 return applyDecorators(GovernedWorkflowOperation('canonical','GET'),ApiCookieAuth('session'),ApiParam({name:'classId',type:String,format:'uuid',required:true}),
 ...[400,401,403,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Class workspace')
@Controller('classes/:classId')
export class ClassWorkspaceController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('workspace')
 @ClassRead()
 @ApiOperation({operationId:'getNativeClassWorkspace',summary:'Read exact authorized Class perspective; requested view does not grant authority'})
 @ApiQuery({name:'view',required:false,enum:['learn','teach','manage']})
 @ApiQuery({name:'tab',required:false,type:String})
 @ApiQuery({name:'lesson',required:false,type:String})
 @ApiQuery({name:'session',required:false,type:String})
 @ApiOkResponse({schema:c.docs.workspace})
 workspace(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.params,params),...validated(c.queries.workspace,query)},workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>c.results.workspace.parse(await workflow.getNativeClassWorkspace(input)));
 }
 @Get('roster')
 @ClassRead()
 @ApiOperation({operationId:'getNativeClassRosterPage',summary:'Read bounded Class roster under current manager authority on every page'})
 @ApiQuery({name:'offset',required:false,type:Number})
 @ApiOkResponse({schema:c.docs.roster})
 roster(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.params,params),...validated(c.queries.roster,query)},workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>c.results.roster.parse(await workflow.getNativeClassRosterPage(input)));
 }
}

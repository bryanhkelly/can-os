import {Controller,Get,Post,Param,Query,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService,type WorkflowMode} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './reporting.contracts';
function Governed(mode:WorkflowMode,method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation(mode,method),ApiCookieAuth('session'),
 ...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Reporting and relationships')
@Controller()
export class ReportingController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('classes/:classId/report')
 @Governed('canonical','GET')
 @ApiParam({name:'classId',type:String,format:'uuid',required:true})
 @ApiQuery({name:'from',required:true,type:String,description:'Inclusive UTC calendar date'})
 @ApiQuery({name:'to',required:true,type:String,description:'Exclusive UTC calendar date; maximum 366 days'})
 @ApiOperation({operationId:'getNativeClassReport',summary:'Provider-private bounded evidence report; never a disclosure approval'})
 @ApiOkResponse({schema:c.docs.report})
 report(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.reportParams,params),...validated(c.reportQuery,query)},workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>c.reportResult.parse(await workflow.getNativeClassReport(input)));
 }
 @Post('reporting-relationships')
 @Governed('can','POST')
 @ApiOperation({operationId:'requestReportingRelationship',summary:'Propose exact scoped relationship and metric terms; does not release data'})
 @ApiBody({schema:c.inputs.proposal})
 @ApiOkResponse({schema:c.docs.receipt})
 propose(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>c.receipt.parse(await workflow.requestReportingRelationship(body)));
 }
 @Post('reporting-relationship-decisions')
 @Governed('can','POST')
 @ApiOperation({operationId:'decideRelationshipRequest',summary:'Independent authorized acceptance, decline, withdrawal or revocation'})
 @ApiBody({schema:c.inputs.decision})
 @ApiOkResponse({schema:c.docs.receipt})
 decide(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>c.receipt.parse(await workflow.decideRelationshipRequest(body)));
 }
 @Get('me/reporting-relationship-portfolio')
 @Governed('can','GET')
 @ApiOperation({operationId:'getRelationshipPortfolio',summary:'Relationship inventory and reporting terms, not learner or outcome metrics'})
 @ApiOkResponse({schema:c.docs.portfolio})
 portfolio(@Req() req:FastifyRequest,@Query() query:unknown){
  validated(c.emptyQuery,query);const workflow=verifiedWorkflow(req);
  return this.identity.runWorkflow(async()=>c.portfolio.parse(await workflow.getRelationshipPortfolio(undefined)));
 }
}

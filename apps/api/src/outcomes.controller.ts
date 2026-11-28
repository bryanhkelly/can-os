import {Controller,Get,Query,Req,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService,type WorkflowMode} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './outcomes.contracts';
function ReportOperation(mode:WorkflowMode){return applyDecorators(GovernedWorkflowOperation(mode,'GET'),ApiCookieAuth('session'),...[400,401,403,409,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
@ApiTags('Verified operational outcomes')
@Controller('reports')
export class OutcomesController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('noncredit-pilot-outcomes')
 @ReportOperation('operator-reporting')
 @ApiOperation({operationId:'getNoncreditPilotOutcomes',summary:'get Noncredit Pilot Outcomes; private authorized report, not disclosure approval'})
 @ApiQuery({name:'geography',type:String,required:false})
 @ApiQuery({name:'siteId',schema:{type:'string',format:'uuid'},required:false})
 @ApiQuery({name:'from',schema:{type:'string',format:'date-time'},required:false})
 @ApiQuery({name:'to',schema:{type:'string',format:'date-time'},required:false})
 @ApiOkResponse({schema:c.docs.pilot})
 async getNoncreditPilotOutcomes(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.pilotQuery,query);return c.results.pilot.parse(await this.identity.runWorkflow(()=>workflow.getNoncreditPilotOutcomes(input)));}

 @Get('noncredit-operator-summary')
 @ReportOperation('operator-reporting')
 @ApiOperation({operationId:'getNoncreditOperatorNetworkSummary',summary:'get Noncredit Operator Network Summary; private authorized report, not disclosure approval'})
 @ApiQuery({name:'geography',type:String,required:false})
 @ApiOkResponse({schema:c.docs.network})
 async getNoncreditOperatorNetworkSummary(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.networkQuery,query);return c.results.network.parse(await this.identity.runWorkflow(()=>workflow.getNoncreditOperatorNetworkSummary(input)));}

 @Get('facilitated-impact')
 @ReportOperation('canonical')
 @ApiOperation({operationId:'getFacilitatedImpactReport',summary:'get Facilitated Impact Report; private authorized report, not disclosure approval'})
 
 @ApiOkResponse({schema:c.docs.impact})
 async getFacilitatedImpactReport(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.empty,query);return c.results.impact.parse(await this.identity.runWorkflow(()=>workflow.getFacilitatedImpactReport(input)));}

}

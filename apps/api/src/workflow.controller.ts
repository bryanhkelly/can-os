import {Controller,Post,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService,type WorkflowMode} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {inputs,results,outputDocs} from './workflow.contracts';
function Governed(mode:WorkflowMode){
 return applyDecorators(GovernedWorkflowOperation(mode),HttpCode(200),ApiHeader({name:'Origin',required:true}),ApiCookieAuth('session'),
 ...(mode==='can'?[]:[ApiCookieAuth('nativeSession')]),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Blueprint and deployment')
@Controller()
export class WorkflowController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('blueprint-configurations')
 @Governed('planning')
 @ApiOperation({operationId:'createCanonicalBlueprintConfiguration',summary:'blueprint configurations; existing governed authorization and evidence requirements'})
 @ApiBody({schema:inputs.create})
 @ApiOkResponse({schema:outputDocs.configuration})
 createCanonicalBlueprintConfiguration(@Req() req:FastifyRequest,@Body() body:unknown){
   const workflow=verifiedWorkflow(req);
   return this.identity.runWorkflow(async()=>results.configuration.parse(await workflow.createCanonicalBlueprintConfiguration(body)));
 }
 @Post('blueprint-configurations/revisions')
 @Governed('planning')
 @ApiOperation({operationId:'saveCanonicalBlueprintConfiguration',summary:'blueprint configurations/revisions; existing governed authorization and evidence requirements'})
 @ApiBody({schema:inputs.save})
 @ApiOkResponse({schema:outputDocs.configuration})
 saveCanonicalBlueprintConfiguration(@Req() req:FastifyRequest,@Body() body:unknown){
   const workflow=verifiedWorkflow(req);
   return this.identity.runWorkflow(async()=>results.configuration.parse(await workflow.saveCanonicalBlueprintConfiguration(body)));
 }
 @Post('blueprint-configurations/submissions')
 @Governed('planning')
 @ApiOperation({operationId:'submitCanonicalBlueprintConfiguration',summary:'blueprint configurations/submissions; existing governed authorization and evidence requirements'})
 @ApiBody({schema:inputs.submit})
 @ApiOkResponse({schema:outputDocs.configuration})
 submitCanonicalBlueprintConfiguration(@Req() req:FastifyRequest,@Body() body:unknown){
   const workflow=verifiedWorkflow(req);
   return this.identity.runWorkflow(async()=>results.configuration.parse(await workflow.submitCanonicalBlueprintConfiguration(body)));
 }
 @Post('blueprint-reviews')
 @Governed('canonical')
 @ApiOperation({operationId:'decideCanonicalBlueprintReview',summary:'blueprint reviews; existing governed authorization and evidence requirements'})
 @ApiBody({schema:inputs.review})
 @ApiOkResponse({schema:outputDocs.reviewResult})
 decideCanonicalBlueprintReview(@Req() req:FastifyRequest,@Body() body:unknown){
   const workflow=verifiedWorkflow(req);
   return this.identity.runWorkflow(async()=>results.reviewResult.parse(await workflow.decideCanonicalBlueprintReview(body)));
 }
 @Post('blueprint-executions')
 @Governed('canonical')
 @ApiOperation({operationId:'executeCanonicalBlueprintConfiguration',summary:'blueprint executions; existing governed authorization and evidence requirements'})
 @ApiBody({schema:inputs.execute})
 @ApiOkResponse({schema:outputDocs.execution})
 executeCanonicalBlueprintConfiguration(@Req() req:FastifyRequest,@Body() body:unknown){
   const workflow=verifiedWorkflow(req);
   return this.identity.runWorkflow(async()=>results.execution.parse(await workflow.executeCanonicalBlueprintConfiguration(body)));
 }
 @Post('deployment-readiness-reviews')
 @Governed('can')
 @ApiOperation({operationId:'recordNativeDeploymentReadiness',summary:'deployment readiness reviews; existing governed authorization and evidence requirements'})
 @ApiBody({schema:inputs.readiness})
 @ApiOkResponse({schema:outputDocs.readinessResult})
 recordNativeDeploymentReadiness(@Req() req:FastifyRequest,@Body() body:unknown){
   const workflow=verifiedWorkflow(req);
   return this.identity.runWorkflow(async()=>results.readinessResult.parse(await workflow.recordNativeDeploymentReadiness(body)));
 }
 @Post('deployment-site-placements')
 @Governed('canonical')
 @ApiOperation({operationId:'placeNativeDeploymentSite',summary:'deployment site placements; existing governed authorization and evidence requirements'})
 @ApiBody({schema:inputs.placement})
 @ApiOkResponse({schema:outputDocs.placementResult})
 placeNativeDeploymentSite(@Req() req:FastifyRequest,@Body() body:unknown){
   const workflow=verifiedWorkflow(req);
   return this.identity.runWorkflow(async()=>results.placementResult.parse(await workflow.placeNativeDeploymentSite(body)));
 }
 @Post('offering-adoption-approvals')
 @Governed('canonical')
 @ApiOperation({operationId:'approveNativeOfferingAdoption',summary:'offering adoption approvals; existing governed authorization and evidence requirements'})
 @ApiBody({schema:inputs.adoption})
 @ApiOkResponse({schema:outputDocs.adoptionResult})
 approveNativeOfferingAdoption(@Req() req:FastifyRequest,@Body() body:unknown){
   const workflow=verifiedWorkflow(req);
   return this.identity.runWorkflow(async()=>results.adoptionResult.parse(await workflow.approveNativeOfferingAdoption(body)));
 }
}

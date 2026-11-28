import {Controller,Get,Param,Query,Req,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiResponse,ApiParam,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService,type WorkflowMode} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './catalog.contracts';
function CatalogRead(mode:WorkflowMode){
 return applyDecorators(GovernedWorkflowOperation(mode,'GET'),ApiCookieAuth('session'),...[400,401,403,409,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Program Catalog and Solution planning')
@Controller()
export class CatalogController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('sites/:siteId/program-references')
 @CatalogRead('planning')
 @ApiParam({name:'siteId',type:String,format:'uuid',required:true})
 
 @ApiOperation({operationId:'exploreCanonicalBlueprintReferences',summary:'explore Canonical Blueprint References; scoped discovery, never operating or publication authority'})
 @ApiOkResponse({schema:c.docs.references})
 async exploreCanonicalBlueprintReferences(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  validated(c.queries.empty,query);const input=validated(c.params.site,params);
  return c.results.references.parse(await this.identity.runWorkflow(()=>workflow.exploreCanonicalBlueprintReferences(input)));
 }
 @Get('sites/:siteId/available-offerings')
 @CatalogRead('planning')
 @ApiParam({name:'siteId',type:String,format:'uuid',required:true})
 @ApiQuery({name:'deliveryContext',enum:['remote','onsite','hybrid'],required:true})
 @ApiOperation({operationId:'discoverCanonicalBlueprintOfferings',summary:'discover Canonical Blueprint Offerings; scoped discovery, never operating or publication authority'})
 @ApiOkResponse({schema:c.docs.offerings})
 async discoverCanonicalBlueprintOfferings(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const {siteId}=validated(c.params.site,params);const q=validated(c.queries.offerings,query);const input={subject:{kind:'site',siteId},...q};
  return c.results.offerings.parse(await this.identity.runWorkflow(()=>workflow.discoverCanonicalBlueprintOfferings(input)));
 }
 @Get('sites/:siteId/solution-workspace')
 @CatalogRead('planning')
 @ApiParam({name:'siteId',type:String,format:'uuid',required:true})
 
 @ApiOperation({operationId:'readCanonicalBlueprintWorkspace',summary:'read Canonical Blueprint Workspace; scoped discovery, never operating or publication authority'})
 @ApiOkResponse({schema:c.docs.workspace})
 async readCanonicalBlueprintWorkspace(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  validated(c.queries.empty,query);const input=validated(c.params.site,params);
  return c.results.workspace.parse(await this.identity.runWorkflow(()=>workflow.readCanonicalBlueprintWorkspace(input)));
 }
 @Get('blueprint-review-queue')
 @CatalogRead('canonical')
 
 
 @ApiOperation({operationId:'listCanonicalBlueprintReviews',summary:'list Canonical Blueprint Reviews; scoped discovery, never operating or publication authority'})
 @ApiOkResponse({schema:c.docs.queue})
 async listCanonicalBlueprintReviews(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  validated(c.queries.empty,query);const input=undefined;
  return c.results.queue.parse(await this.identity.runWorkflow(()=>workflow.listCanonicalBlueprintReviews(input)));
 }
 @Get('organizations/:organizationId/blueprint-review-evidence')
 @CatalogRead('canonical')
 @ApiParam({name:'organizationId',type:String,format:'uuid',required:true})
 
 @ApiOperation({operationId:'listCanonicalBlueprintReviewEvidence',summary:'list Canonical Blueprint Review Evidence; scoped discovery, never operating or publication authority'})
 @ApiOkResponse({schema:c.docs.evidence})
 async listCanonicalBlueprintReviewEvidence(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  validated(c.queries.empty,query);const {organizationId}=validated(c.params.organization,params);const input={owningOrganizationId:organizationId};
  return c.results.evidence.parse(await this.identity.runWorkflow(()=>workflow.listCanonicalBlueprintReviewEvidence(input)));
 }
}

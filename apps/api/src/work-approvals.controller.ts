import {Controller,Get,Post,Body,Param,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiParam,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './work-approvals.contracts';
function WorkOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Work and approvals')
@Controller()
export class WorkApprovalsController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('operations/actions')
 @WorkOperation('GET')
 @ApiOperation({operationId:'getOperationsActions',summary:'List authorized open operational Actions and bounded backlog'})
 
 @ApiQuery({name:'siteId',required:false,type:String,format:'uuid'})
 @ApiQuery({name:'programId',required:false,type:String,format:'uuid'})
 
 @ApiOkResponse({schema:c.docs.queue})
 async getOperationsActions(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.selection,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getOperationsActions(input));
  return c.results.queue.parse(JSON.parse(JSON.stringify(value)));
 }

 @Get('actions/:actionId')
 @WorkOperation('GET')
 @ApiOperation({operationId:'getActionDetail',summary:'Read exact authorized Action; owning domain controls private detail'})
 @ApiParam({name:'actionId',type:String,format:'uuid',required:true})
 
 
 @ApiOkResponse({schema:c.docs.detail})
 async getActionDetail(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.actionId,params),...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getActionDetail(input));
  return c.results.detail.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('operations/actions/:id/status')
 @WorkOperation('POST')
 @ApiOperation({operationId:'updateOperationsAction',summary:'Update or resolve a generic Action without bypassing its owning workflow'})
 @ApiParam({name:'id',type:String,format:'uuid',required:true})
 
 @ApiBody({schema:c.bodyDocs.status})
 @ApiOkResponse({schema:c.docs.saved})
 async updateOperationsAction(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.id,params),...validated(c.bodies.status,body)};
  const value=await this.identity.runWorkflow(()=>workflow.updateOperationsAction(input));
  return c.results.saved.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('operations/actions/:id/assignment')
 @WorkOperation('POST')
 @ApiOperation({operationId:'assignOperationsAction',summary:'Assign an eligible scoped owner and priority'})
 @ApiParam({name:'id',type:String,format:'uuid',required:true})
 
 @ApiBody({schema:c.bodyDocs.assignment})
 @ApiOkResponse({schema:c.docs.saved})
 async assignOperationsAction(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.id,params),...validated(c.bodies.assignment,body)};
  const value=await this.identity.runWorkflow(()=>workflow.assignOperationsAction(input));
  return c.results.saved.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('operations/actions/:id/deadline')
 @WorkOperation('POST')
 @ApiOperation({operationId:'setOperationsActionDeadline',summary:'Change deadline with audited rationale'})
 @ApiParam({name:'id',type:String,format:'uuid',required:true})
 
 @ApiBody({schema:c.bodyDocs.deadline})
 @ApiOkResponse({schema:c.docs.changed})
 async setOperationsActionDeadline(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.id,params),...validated(c.bodies.deadline,body)};
  const value=await this.identity.runWorkflow(()=>workflow.setOperationsActionDeadline(input));
  return c.results.changed.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('operations/actions/:id/owner-resolution')
 @WorkOperation('POST')
 @ApiOperation({operationId:'resolveOwnedSiteOperationalAction',summary:'Resolve eligible onsite follow-up as the assigned current Site leader'})
 @ApiParam({name:'id',type:String,format:'uuid',required:true})
 
 @ApiBody({schema:c.bodyDocs.resolution})
 @ApiOkResponse({schema:c.docs.saved})
 async resolveOwnedSiteOperationalAction(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.id,params),...validated(c.bodies.resolution,body)};
  const value=await this.identity.runWorkflow(()=>workflow.resolveOwnedSiteOperationalAction(input));
  return c.results.saved.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('credential-issuer-approvals')
 @WorkOperation('POST')
 @ApiOperation({operationId:'requestCanonicalCredentialIssuerApproval',summary:'Request credential issuer authority for current verified grant'})
 
 
 @ApiBody({schema:c.bodyDocs.request})
 @ApiOkResponse({schema:c.docs.requested})
 async requestCanonicalCredentialIssuerApproval(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.bodies.request,body)};
  const value=await this.identity.runWorkflow(()=>workflow.requestCanonicalCredentialIssuerApproval(input));
  return c.results.requested.parse(JSON.parse(JSON.stringify(value)));
 }

 @Get('me/credential-issuer-approval')
 @WorkOperation('GET')
 @ApiOperation({operationId:'getMyCredentialIssuerApproval',summary:'Read current grant's own approval status'})
 
 
 
 @ApiOkResponse({schema:c.docs.mine})
 async getMyCredentialIssuerApproval(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getMyCredentialIssuerApproval(input));
  return c.results.mine.parse(JSON.parse(JSON.stringify(value)));
 }

 @Get('credential-issuer-approvals/active')
 @WorkOperation('GET')
 @ApiOperation({operationId:'listActiveCredentialIssuerApprovals',summary:'List bounded independently reviewable approved grants'})
 
 
 
 @ApiOkResponse({schema:c.docs.active})
 async listActiveCredentialIssuerApprovals(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.listActiveCredentialIssuerApprovals(input));
  return c.results.active.parse(JSON.parse(JSON.stringify(value)));
 }

 @Get('credential-issuer-approvals/pending')
 @WorkOperation('GET')
 @ApiOperation({operationId:'listPendingCredentialIssuerApprovals',summary:'List bounded pending requests for independent reviewer'})
 
 
 
 @ApiOkResponse({schema:c.docs.pending})
 async listPendingCredentialIssuerApprovals(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.listPendingCredentialIssuerApprovals(input));
  return c.results.pending.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('credential-issuer-approvals/:approvalId/decisions')
 @WorkOperation('POST')
 @ApiOperation({operationId:'reviewCanonicalCredentialIssuerApproval',summary:'Record independent approval or rejection with evidence and expiry'})
 @ApiParam({name:'approvalId',type:String,format:'uuid',required:true})
 
 @ApiBody({schema:c.bodyDocs.review})
 @ApiOkResponse({schema:c.docs.decision})
 async reviewCanonicalCredentialIssuerApproval(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.approvalId,params),...validated(c.bodies.review,body)};
  const value=await this.identity.runWorkflow(()=>workflow.reviewCanonicalCredentialIssuerApproval(input));
  return c.results.decision.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('credential-issuer-approvals/:approvalId/revocations')
 @WorkOperation('POST')
 @ApiOperation({operationId:'revokeCanonicalCredentialIssuerApproval',summary:'Revoke active approval through dedicated governed writer'})
 @ApiParam({name:'approvalId',type:String,format:'uuid',required:true})
 
 @ApiBody({schema:c.bodyDocs.revoke})
 @ApiOkResponse({schema:c.docs.revoked})
 async revokeCanonicalCredentialIssuerApproval(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.approvalId,params),...validated(c.bodies.revoke,body)};
  const value=await this.identity.runWorkflow(()=>workflow.revokeCanonicalCredentialIssuerApproval(input));
  return c.results.revoked.parse(JSON.parse(JSON.stringify(value)));
 }
 @Get('jurisdiction-profiles/reviews')
 @WorkOperation('GET')
 @ApiOperation({operationId:'listJurisdictionProfileReviews',summary:'list jurisdiction profile reviews'})
 
 @ApiOkResponse({schema:c.jurisdictionDocs.reviews})
 async listJurisdictionProfileReviews(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.listJurisdictionProfileReviews(input));
  return c.jurisdictionResults.reviews.parse(JSON.parse(JSON.stringify(value)));
 }

 @Get('jurisdiction-profiles/guidance')
 @WorkOperation('GET')
 @ApiOperation({operationId:'listPublishedJurisdictionGuidance',summary:'list published jurisdiction guidance'})
 
 @ApiOkResponse({schema:c.jurisdictionDocs.guidance})
 async listPublishedJurisdictionGuidance(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.listPublishedJurisdictionGuidance(input));
  return c.jurisdictionResults.guidance.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('jurisdiction-profiles/:id/review')
 @WorkOperation('POST')
 @ApiOperation({operationId:'saveJurisdictionProfileReview',summary:'save jurisdiction profile review'})
 @ApiParam({name:'id',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.jurisdictionBodyDocs.review})
 @ApiOkResponse({schema:c.jurisdictionDocs.saved})
 async saveJurisdictionProfileReview(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.id,params)},...validated(c.jurisdictionBodies.review,body)};
  const value=await this.identity.runWorkflow(()=>workflow.saveJurisdictionProfileReview(input));
  return c.jurisdictionResults.saved.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('jurisdiction-profiles/:id/verification')
 @WorkOperation('POST')
 @ApiOperation({operationId:'verifyJurisdictionProfileReview',summary:'verify jurisdiction profile review'})
 @ApiParam({name:'id',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.jurisdictionBodyDocs.verify})
 @ApiOkResponse({schema:c.jurisdictionDocs.saved})
 async verifyJurisdictionProfileReview(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.id,params)},...validated(c.jurisdictionBodies.verify,body)};
  const value=await this.identity.runWorkflow(()=>workflow.verifyJurisdictionProfileReview(input));
  return c.jurisdictionResults.saved.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('jurisdiction-profiles/:id/publication')
 @WorkOperation('POST')
 @ApiOperation({operationId:'publishJurisdictionProfile',summary:'publish jurisdiction profile'})
 @ApiParam({name:'id',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.jurisdictionBodyDocs.publish})
 @ApiOkResponse({schema:c.jurisdictionDocs.saved})
 async publishJurisdictionProfile(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.id,params)},...validated(c.jurisdictionBodies.publish,body)};
  const value=await this.identity.runWorkflow(()=>workflow.publishJurisdictionProfile(input));
  return c.jurisdictionResults.saved.parse(JSON.parse(JSON.stringify(value)));
 }
}

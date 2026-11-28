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
 @Post('work/tasks')
 @WorkOperation('POST')
 @ApiOperation({operationId:'createOperationalTask',summary:'Create or replay a scoped operational task'})
 
 
 @ApiBody({schema:c.manualBodyDocs.create})
 @ApiOkResponse({schema:c.manualDocs.created})
 async createOperationalTask(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.manualBodies.create,body)};
  const value=await this.identity.runWorkflow(()=>workflow.createOperationalTask(input));
  return c.manualResults.created.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('work/tasks/:id/escalations')
 @WorkOperation('POST')
 @ApiOperation({operationId:'escalateOperationalTask',summary:'Escalate a current manual task with reason and revision'})
 @ApiParam({name:'id',type:String,format:'uuid',required:true})
 
 @ApiBody({schema:c.manualBodyDocs.escalate})
 @ApiOkResponse({schema:c.manualDocs.escalated})
 async escalateOperationalTask(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.id,params),...validated(c.manualBodies.escalate,body)};
  const value=await this.identity.runWorkflow(()=>workflow.escalateOperationalTask(input));
  return c.manualResults.escalated.parse(JSON.parse(JSON.stringify(value)));
 }

 @Get('work/tasks')
 @WorkOperation('GET')
 @ApiOperation({operationId:'listOperationalTasks',summary:'Page through open manual tasks in authorized scope'})
 
 @ApiQuery({name:'siteId',required:false,type:String,format:'uuid'})
 @ApiQuery({name:'programId',required:false,type:String,format:'uuid'})
 @ApiQuery({name:'afterId',required:false,type:String,format:'uuid'})
 
 @ApiOkResponse({schema:c.manualDocs.page})
 async listOperationalTasks(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.manualQueries.page,query)};
  const value=await this.identity.runWorkflow(()=>workflow.listOperationalTasks(input));
  return c.manualResults.page.parse(JSON.parse(JSON.stringify(value)));
 }

 @Get('work/inbox')
 @WorkOperation('GET')
 @ApiOperation({operationId:'getWorkInbox',summary:'Read authorized work sources without granting new authority'})
 
 
 
 @ApiOkResponse({schema:c.manualDocs.inbox})
 async getWorkInbox(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.manualQueries.inbox,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getWorkInbox(input));
  return c.manualResults.inbox.parse(JSON.parse(JSON.stringify(value)));
 }
 @Get('work/tasks/:id/dependencies')
 @WorkOperation('GET')
 @ApiOperation({operationId:'getOperationalTaskDependencies',summary:'Read authorized prerequisites and current revision'})
 @ApiParam({name:'id',type:String,format:'uuid',required:true})
 
 @ApiOkResponse({schema:c.dependencyDocs.read})
 async getOperationalTaskDependencies(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.id,params),...validated(c.queries.none,query)};
  const value=await this.identity.runWorkflow(()=>workflow.getOperationalTaskDependencies(input));
  return c.dependencyResults.read.parse(JSON.parse(JSON.stringify(value)));
 }

 @Post('work/tasks/:id/dependencies')
 @WorkOperation('POST')
 @ApiOperation({operationId:'changeOperationalTaskDependency',summary:'Add or remove an audited dependency without cycles'})
 @ApiParam({name:'id',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.dependencyBodyDoc})
 @ApiOkResponse({schema:c.dependencyDocs.changed})
 async changeOperationalTaskDependency(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  const input={...validated(c.params.id,params),...validated(c.dependencyBody,body)};
  const value=await this.identity.runWorkflow(()=>workflow.changeOperationalTaskDependency(input));
  return c.dependencyResults.changed.parse(JSON.parse(JSON.stringify(value)));
 }
}

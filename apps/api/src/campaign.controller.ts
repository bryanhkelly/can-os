import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './campaign.contracts';
function CampaignOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),
 ...[400,401,403,409,413,415,429,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Engagement campaigns')
@Controller()
export class CampaignController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('engagement-campaigns/workspace')
 @CampaignOperation('GET')
 @ApiOperation({operationId:'readEngagementCampaignWorkspace',summary:'Read owner-scoped campaign delivery counts and sender readiness'})
 @ApiQuery({name:'engagementId',type:String,required:true})
 @ApiQuery({name:'linkId',type:String,required:true})
 @ApiOkResponse({schema:c.docs.workspace})
 async readEngagementCampaignWorkspace(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input=validated(c.workspaceQuery,query);
  return c.results.workspace.parse(await this.identity.runWorkflow(()=>workflow.readEngagementCampaignWorkspace(input)));
 }
 @Post('campaign-recipient-lists')
 @CampaignOperation('POST')
 @ApiOperation({operationId:'saveCampaignRecipientList',summary:'Save consent-attested recipients to an owned list'})
 @ApiBody({schema:c.inputs.save})
 @ApiOkResponse({schema:c.docs.receipt})
 async saveCampaignRecipientList(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  // The shared campaign command schema validates the complete strict body before work.
  const input=body;
  return c.results.receipt.parse(await this.identity.runWorkflow(()=>workflow.saveCampaignRecipientList(input)));
 }
 @Post('engagement-campaigns')
 @CampaignOperation('POST')
 @ApiOperation({operationId:'queueEngagementCampaign',summary:'Schedule a consented invitation with a stable request ID'})
 @ApiBody({schema:c.inputs.queue})
 @ApiOkResponse({schema:c.docs.receipt})
 async queueEngagementCampaign(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  // The shared campaign command schema validates the complete strict body before work.
  const input=body;
  return c.results.receipt.parse(await this.identity.runWorkflow(()=>workflow.queueEngagementCampaign(input)));
 }
 @Post('engagement-campaign-cancellations')
 @CampaignOperation('POST')
 @ApiOperation({operationId:'cancelEngagementCampaign',summary:'Cancel pending delivery without deleting delivery history'})
 @ApiBody({schema:c.inputs.cancel})
 @ApiOkResponse({schema:c.docs.cancel})
 async cancelEngagementCampaign(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  // The shared campaign command schema validates the complete strict body before work.
  const input=body;
  return c.results.cancel.parse(await this.identity.runWorkflow(()=>workflow.cancelEngagementCampaign(input)));
 }
 @Get('campaign-recipient-lists/members')
 @CampaignOperation('GET')
 @ApiOperation({operationId:'readCampaignListMembers',summary:'Read at most 50 authorized recipient records and suppression states'})
 @ApiQuery({name:'engagementId',type:String,required:true})
 @ApiQuery({name:'linkId',type:String,required:true})
 @ApiQuery({name:'listId',type:String,required:true})
 @ApiQuery({name:'offset',schema:{type:'integer',minimum:0,maximum:1000},required:true})
 @ApiOkResponse({schema:c.docs.members})
 async readCampaignListMembers(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const input=validated(c.membersQuery,query);
  return c.results.members.parse(await this.identity.runWorkflow(()=>workflow.readCampaignListMembers(input)));
 }
 @Post('campaign-recipient-list-member-decisions')
 @CampaignOperation('POST')
 @ApiOperation({operationId:'updateCampaignListMember',summary:'Remove a list member or withdraw consent at sender scope'})
 @ApiBody({schema:c.inputs.memberDecision})
 @ApiOkResponse({schema:c.docs.decision})
 async updateCampaignListMember(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  // The shared campaign command schema validates the complete strict body before work.
  const input=body;
  return c.results.decision.parse(await this.identity.runWorkflow(()=>workflow.updateCampaignListMember(input)));
 }
}

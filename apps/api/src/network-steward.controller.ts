import {Controller,Get,Post,Param,Query,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiBody,ApiHeader,ApiParam,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './network-steward.contracts';
function Operation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Network stewardship')
@Controller()
export class NetworkStewardController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('network-steward/agreements')
 @Operation('GET')
 
 @ApiOperation({operationId:'listNetworkAgreementDesk',summary:'listNetworkAgreementDesk; independently governed network steward authority'})
 
 @ApiOkResponse({schema:c.docs.desk})
 async listNetworkAgreementDesk(@Req() req:FastifyRequest,@Param() params:unknown,@Query() value:unknown){
  const input={...validated(c.empty,params),...validated(c.bodies.empty,value)};
  return c.results.desk.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).listNetworkAgreementDesk(input)))));
 }
 @Post('network-steward/agreements')
 @Operation('POST')
 
 @ApiOperation({operationId:'verifyNetworkAgreement',summary:'verifyNetworkAgreement; independently governed network steward authority'})
 @ApiBody({schema:c.inputs.verify})
 @ApiOkResponse({schema:c.docs.agreement})
 async verifyNetworkAgreement(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.empty,params),...validated(c.bodies.verify,value)};
  return c.results.agreement.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).verifyNetworkAgreement(input)))));
 }
 @Post('network-steward/hq-officers')
 @Operation('POST')
 
 @ApiOperation({operationId:'provisionDenominationHQOfficer',summary:'provisionDenominationHQOfficer; independently governed network steward authority'})
 @ApiBody({schema:c.inputs.officer})
 @ApiOkResponse({schema:c.docs.grant})
 async provisionDenominationHQOfficer(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.empty,params),...validated(c.bodies.officer,value)};
  return c.results.grant.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).provisionDenominationHQOfficer(input)))));
 }
 @Post('network-steward/church-provisioning')
 @Operation('POST')
 
 @ApiOperation({operationId:'prepareChurchOnboarding',summary:'prepareChurchOnboarding; independently governed network steward authority'})
 @ApiBody({schema:c.inputs.bootstrap})
 @ApiOkResponse({schema:c.docs.bootstrap})
 async prepareChurchOnboarding(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.empty,params),...validated(c.bodies.bootstrap,value)};
  return c.results.bootstrap.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).prepareChurchOnboarding(input)))));
 }
 @Get('network-steward/church-applications')
 @Operation('GET')
 
 @ApiOperation({operationId:'listChurchOnboardingRequests',summary:'listChurchOnboardingRequests; independently governed network steward authority'})
 
 @ApiOkResponse({schema:c.docs.applications})
 async listChurchOnboardingRequests(@Req() req:FastifyRequest,@Param() params:unknown,@Query() value:unknown){
  const input={...validated(c.empty,params),...validated(c.bodies.empty,value)};
  return c.results.applications.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).listChurchOnboardingRequests(input)))));
 }
 @Post('network-steward/church-applications/:requestId/verifications')
 @Operation('POST')
 @ApiParam({name:'requestId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'verifyChurchOnboardingRequest',summary:'verifyChurchOnboardingRequest; independently governed network steward authority'})
 @ApiBody({schema:c.inputs.churchVerify})
 @ApiOkResponse({schema:c.docs.verified})
 async verifyChurchOnboardingRequest(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.request,params),...validated(c.bodies.churchVerify,value)};
  return c.results.verified.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).verifyChurchOnboardingRequest(input)))));
 }
 @Post('network-steward/church-applications/:requestId/approvals')
 @Operation('POST')
 @ApiParam({name:'requestId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'approveChurchOnboardingRequest',summary:'approveChurchOnboardingRequest; independently governed network steward authority'})
 @ApiBody({schema:c.inputs.empty})
 @ApiOkResponse({schema:c.docs.approved})
 async approveChurchOnboardingRequest(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.request,params),...validated(c.bodies.empty,value)};
  return c.results.approved.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).approveChurchOnboardingRequest(input)))));
 }
 @Post('network-steward/church-applications/:requestId/declines')
 @Operation('POST')
 @ApiParam({name:'requestId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'declineChurchOnboardingRequest',summary:'declineChurchOnboardingRequest; independently governed network steward authority'})
 @ApiBody({schema:c.inputs.decline})
 @ApiOkResponse({schema:c.docs.declined})
 async declineChurchOnboardingRequest(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.request,params),...validated(c.bodies.decline,value)};
  return c.results.declined.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).declineChurchOnboardingRequest(input)))));
 }
 @Post('network-steward/church-applications/:requestId/evidence-requests')
 @Operation('POST')
 @ApiParam({name:'requestId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'requestChurchOnboardingEvidence',summary:'requestChurchOnboardingEvidence; independently governed network steward authority'})
 @ApiBody({schema:c.inputs.followup})
 @ApiOkResponse({schema:c.docs.requested})
 async requestChurchOnboardingEvidence(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.request,params),...validated(c.bodies.followup,value)};
  return c.results.requested.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).requestChurchOnboardingEvidence(input)))));
 }
 @Post('network-steward/church-applications/:requestId/cancellations')
 @Operation('POST')
 @ApiParam({name:'requestId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'cancelChurchOnboardingRequest',summary:'cancelChurchOnboardingRequest; independently governed network steward authority'})
 @ApiBody({schema:c.inputs.empty})
 @ApiOkResponse({schema:c.docs.canceled})
 async cancelChurchOnboardingRequest(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.request,params),...validated(c.bodies.empty,value)};
  return c.results.canceled.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).cancelChurchOnboardingRequest(input)))));
 }
 @Post('network-steward/church-applications/:requestId/evidence-notices')
 @Operation('POST')
 @ApiParam({name:'requestId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'resendChurchEvidenceNotice',summary:'resendChurchEvidenceNotice; independently governed network steward authority'})
 @ApiBody({schema:c.inputs.empty})
 @ApiOkResponse({schema:c.docs.notice})
 async resendChurchEvidenceNotice(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.request,params),...validated(c.bodies.empty,value)};
  return c.results.notice.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).resendChurchEvidenceNotice(input)))));
 }
 @Post('network-steward/church-applications/:requestId/invitation-resends')
 @Operation('POST')
 @ApiParam({name:'requestId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'resendApprovedChurchInvitation',summary:'resendApprovedChurchInvitation; independently governed network steward authority'})
 @ApiBody({schema:c.inputs.empty})
 @ApiOkResponse({schema:c.docs.resend})
 async resendApprovedChurchInvitation(@Req() req:FastifyRequest,@Param() params:unknown,@Body() value:unknown){
  const input={...validated(c.request,params),...validated(c.bodies.empty,value)};
  return c.results.resend.parse(JSON.parse(JSON.stringify(await this.identity.runWorkflow(()=>verifiedWorkflow(req).resendApprovedChurchInvitation(input)))));
 }
}

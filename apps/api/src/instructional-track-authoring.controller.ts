import {Controller,Get,Post,Req,Param,Query,Body,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiParam,ApiBody,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './instructional-track-authoring.contracts';
function Operation(method:'GET'|'POST'){return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
@ApiTags('Instructional Track governance')
@Controller()
export class InstructionalTrackAuthoringController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('course-versions/:courseVersionId/instructional-track-drafts')
 @Operation('POST')
 @ApiOperation({operationId:'createRecordedInstructionDraft',summary:'Create exact published Course track draft'})
 @ApiParam({name:'courseVersionId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.create})
 @ApiOkResponse({schema:c.docs.created})
 async createRecordedInstructionDraft(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.course,params);
  const input={...ids,...validated(c.inputs.create,body)};
  return this.identity.runWorkflow(async()=>c.results.created.parse(await workflow.createRecordedInstructionDraft(input)));
 }

 @Post('instructional-track-versions/:trackVersionId/revisions')
 @Operation('POST')
 @ApiOperation({operationId:'saveRecordedInstructionDraft',summary:'Revise own unsubmitted draft'})
 @ApiParam({name:'trackVersionId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.save})
 @ApiOkResponse({schema:c.docs.saved})
 async saveRecordedInstructionDraft(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.track,params);
  const input={...ids,...validated(c.inputs.save,body)};
  return this.identity.runWorkflow(async()=>c.results.saved.parse(await workflow.saveRecordedInstructionDraft(input)));
 }

 @Post('instructional-track-versions/:trackVersionId/submissions')
 @Operation('POST')
 @ApiOperation({operationId:'submitRecordedInstructionDraft',summary:'Seal exact instructional manifest'})
 @ApiParam({name:'trackVersionId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.release})
 @ApiOkResponse({schema:c.docs.submitted})
 async submitRecordedInstructionDraft(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.track,params);
  const input={...ids,...validated(c.inputs.release,body)};
  return this.identity.runWorkflow(async()=>c.results.submitted.parse(await workflow.submitRecordedInstructionDraft(input)));
 }

 @Post('instructional-track-versions/:trackVersionId/reviews')
 @Operation('POST')
 @ApiOperation({operationId:'decideRecordedInstructionReview',summary:'Record independent manifest decision'})
 @ApiParam({name:'trackVersionId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.review})
 @ApiOkResponse({schema:c.docs.reviewed})
 async decideRecordedInstructionReview(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.track,params);
  const input={...ids,...validated(c.inputs.review,body)};
  return this.identity.runWorkflow(async()=>c.results.reviewed.parse(await workflow.decideRecordedInstructionReview(input)));
 }

 @Post('instructional-track-versions/:trackVersionId/publication')
 @Operation('POST')
 @ApiOperation({operationId:'publishRecordedInstruction',summary:'Publish only approved exact manifest'})
 @ApiParam({name:'trackVersionId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.release})
 @ApiOkResponse({schema:c.docs.published})
 async publishRecordedInstruction(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.track,params);
  const input={...ids,...validated(c.inputs.release,body)};
  return this.identity.runWorkflow(async()=>c.results.published.parse(await workflow.publishRecordedInstruction(input)));
 }

 @Post('instructional-track-versions/:trackVersionId/withdrawals')
 @Operation('POST')
 @ApiOperation({operationId:'withdrawRecordedInstruction',summary:'Withdraw published track under rights and safety policy'})
 @ApiParam({name:'trackVersionId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.withdraw})
 @ApiOkResponse({schema:c.docs.withdrawn})
 async withdrawRecordedInstruction(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.track,params);
  const input={...ids,...validated(c.inputs.withdraw,body)};
  return this.identity.runWorkflow(async()=>c.results.withdrawn.parse(await workflow.withdrawRecordedInstruction(input)));
 }

 @Get('instructional-track-versions/:trackVersionId/draft')
 @Operation('GET')
 @ApiOperation({operationId:'getCreatorRecordedInstructionDraft',summary:'Read own unsubmitted draft without private answer keys'})
 @ApiParam({name:'trackVersionId',type:String,format:'uuid',required:true})
 
 @ApiOkResponse({schema:c.docs.draft})
 async getCreatorRecordedInstructionDraft(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.track,params);
  const input={...ids,...validated(c.inputs.empty,query)};
  return this.identity.runWorkflow(async()=>c.results.draft.parse(await workflow.getCreatorRecordedInstructionDraft(input)));
 }


 @Get('instructional-track-versions/:trackVersionId/review')
 @Operation('GET')
 @ApiOperation({operationId:'getRecordedInstructionReview',summary:'Read exact sealed manifest and recorded review decisions; not publication authority'})
 @ApiParam({name:'trackVersionId',type:String,format:'uuid',required:true})
 @ApiOkResponse({schema:c.reviewSnapshotDoc})
 async getRecordedInstructionReview(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.track,params);
  validated(c.inputs.empty,query);
  return this.identity.runWorkflow(async()=>c.reviewSnapshot.parse(await workflow.getRecordedInstructionReview(ids)));
 }
}

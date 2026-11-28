import {Controller,Get,Post,Req,Param,Query,Body,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiParam,ApiBody,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './curriculum-marketplace.contracts';
function Operation(method:'GET'|'POST'){return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
@ApiTags('Curriculum Marketplace compatibility and annual licensing')
@Controller()
export class CurriculumMarketplaceController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('curriculum-adopter-programs')
 @Operation('GET')
 @ApiOperation({operationId:'getCurriculumAdopterPrograms',summary:'Authorized adopter Programs'})
 
 
 @ApiOkResponse({schema:c.docs.programs})
 async getCurriculumAdopterPrograms(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.none,params);
  const input={...ids,...validated(c.inputs.empty,query)};
  return this.identity.runWorkflow(async()=>c.results.programs.parse(await workflow.getCurriculumAdopterPrograms(input)));
 }

 @Get('programs/:programId/curriculum-journey-readiness')
 @Operation('GET')
 @ApiOperation({operationId:'getCurriculumJourneyReadiness',summary:'Read scoped recorded curriculum delivery evidence, not acceptance certification'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 
 @ApiOkResponse({schema:c.docs.readiness})
 async getCurriculumJourneyReadiness(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.program,params);
  const input={...ids,...validated(c.inputs.empty,query)};
  return this.identity.runWorkflow(async()=>c.results.readiness.parse(await workflow.getCurriculumJourneyReadiness(input)));
 }

 @Get('programs/:programId/curriculum-marketplace')
 @Operation('GET')
 @ApiOperation({operationId:'getCurriculumMarketplace',summary:'List published marketplace releases, entitlement and pinned adoption state'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 
 @ApiOkResponse({schema:c.docs.market})
 async getCurriculumMarketplace(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.program,params);
  const input={...ids,...validated(c.inputs.empty,query)};
  return this.identity.runWorkflow(async()=>c.results.market.parse(await workflow.getCurriculumMarketplace(input)));
 }

 @Post('programs/:programId/curriculum-entitlements')
 @Operation('POST')
 @ApiOperation({operationId:'installCurriculumPack',summary:'Install permitted pack with explicit terms acceptance'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.install})
 @ApiOkResponse({schema:c.docs.installed})
 async installCurriculumPack(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.program,params);
  const input={...ids,...validated(c.inputs.install,body)};
  return this.identity.runWorkflow(async()=>c.results.installed.parse(await workflow.installCurriculumPack(input)));
 }

 @Post('programs/:programId/curriculum-adoptions')
 @Operation('POST')
 @ApiOperation({operationId:'adoptCurriculumPack',summary:'Create a pinned legacy adoption; disabled when annual licensing begins'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.adopt})
 @ApiOkResponse({schema:c.docs.adopted})
 async adoptCurriculumPack(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.program,params);
  const input={...ids,...validated(c.inputs.adopt,body)};
  return this.identity.runWorkflow(async()=>c.results.adopted.parse(await workflow.adoptCurriculumPack(input)));
 }

 @Get('programs/:programId/curriculum-packs/:packId/academic-years/:academicYearId/adoption')
 @Operation('GET')
 @ApiOperation({operationId:'reviewAnnualCurriculumAdoption',summary:'Inspect existing annual adoption and verified license eligibility; staged gates apply'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiParam({name:'packId',type:String,format:'uuid',required:true})
 @ApiParam({name:'academicYearId',type:String,format:'uuid',required:true})
 
 @ApiOkResponse({schema:c.docs.eligibility})
 async reviewAnnualCurriculumAdoption(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.annual,params);
  const input={...ids,...validated(c.inputs.empty,query)};
  return this.identity.runWorkflow(async()=>c.results.eligibility.parse(await workflow.reviewAnnualCurriculumAdoption(input)));
 }

 @Post('programs/:programId/curriculum-packs/:packId/academic-years/:academicYearId/adoption')
 @Operation('POST')
 @ApiOperation({operationId:'rolloverAnnualCurriculumAdoption',summary:'Adopt exact licensed release for the academic year; staged gates apply'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiParam({name:'packId',type:String,format:'uuid',required:true})
 @ApiParam({name:'academicYearId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.rollover})
 @ApiOkResponse({schema:c.docs.rolled})
 async rolloverAnnualCurriculumAdoption(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.annual,params);
  const input={...ids,...validated(c.inputs.rollover,body)};
  return this.identity.runWorkflow(async()=>c.results.rolled.parse(await workflow.rolloverAnnualCurriculumAdoption(input)));
 }

 @Post('programs/:programId/curriculum-packs/:packId/academic-years/:academicYearId/adoption/rollbacks')
 @Operation('POST')
 @ApiOperation({operationId:'rollbackAnnualCurriculumPackAdoption',summary:'Record terminal annual adoption rollback without changing existing classes'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiParam({name:'packId',type:String,format:'uuid',required:true})
 @ApiParam({name:'academicYearId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.rollback})
 @ApiOkResponse({schema:c.docs.rollback})
 async rollbackAnnualCurriculumPackAdoption(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.annual,params);
  const input={...ids,...validated(c.inputs.rollback,body)};
  return this.identity.runWorkflow(async()=>c.results.rollback.parse(await workflow.rollbackAnnualCurriculumPackAdoption(input)));
 }

 @Post('programs/:programId/curriculum-supplements')
 @Operation('POST')
 @ApiOperation({operationId:'addMarketplaceSupplement',summary:'Create local HTTPS supplement without modifying publisher content'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.supplement})
 @ApiOkResponse({schema:c.docs.supplement})
 async addMarketplaceSupplement(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.program,params);
  const input={...ids,...validated(c.inputs.supplement,body)};
  return this.identity.runWorkflow(async()=>c.results.supplement.parse(await workflow.addMarketplaceSupplement(input)));
 }

}

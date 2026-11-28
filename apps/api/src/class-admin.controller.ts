import {Controller,Get,Post,Body,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import {inputs,results,docs,draftQuery,optionsQuery,emptyQuery} from './class-admin.contracts';
function ClassOperation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('canonical',method),ApiCookieAuth('session'),
 ...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Class administration')
@Controller()
export class ClassAdminController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('classes')
 @ClassOperation('POST')
 @ApiOperation({operationId:'createUnifiedClassDraft',summary:'create Unified Class Draft; current operator and publisher authority required'})
 @ApiBody({schema:inputs.create})
 @ApiOkResponse({schema:docs.create})
 createUnifiedClassDraft(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.create.parse(await workflow.createUnifiedClassDraft(body)));
 }
 @Post('class-activations')
 @ClassOperation('POST')
 @ApiOperation({operationId:'activateUnifiedClass',summary:'activate Unified Class; current operator and publisher authority required'})
 @ApiBody({schema:inputs.activate})
 @ApiOkResponse({schema:docs.activate})
 activateUnifiedClass(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.activate.parse(await workflow.activateUnifiedClass(body)));
 }
 @Post('class-offering-publications')
 @ClassOperation('POST')
 @ApiOperation({operationId:'publishUnifiedClassOffering',summary:'publish Unified Class Offering; current operator and publisher authority required'})
 @ApiBody({schema:inputs.manage})
 @ApiOkResponse({schema:docs.publish})
 publishUnifiedClassOffering(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.publish.parse(await workflow.publishUnifiedClassOffering(body)));
 }
 @Post('class-offering-closures')
 @ClassOperation('POST')
 @ApiOperation({operationId:'closeUnifiedClassOffering',summary:'close Unified Class Offering; current operator and publisher authority required'})
 @ApiBody({schema:inputs.manage})
 @ApiOkResponse({schema:docs.close})
 closeUnifiedClassOffering(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.close.parse(await workflow.closeUnifiedClassOffering(body)));
 }
 @Post('class-offering-versions')
 @ClassOperation('POST')
 @ApiOperation({operationId:'createNextUnifiedClassOfferingVersion',summary:'create Next Unified Class Offering Version; current operator and publisher authority required'})
 @ApiBody({schema:inputs.next})
 @ApiOkResponse({schema:docs.next})
 createNextUnifiedClassOfferingVersion(@Req() req:FastifyRequest,@Body() body:unknown){
  const workflow=verifiedWorkflow(req);
  
  return this.identity.runWorkflow(async()=>results.next.parse(await workflow.createNextUnifiedClassOfferingVersion(body)));
 }
 @Get('classes')
 @ClassOperation('GET')
 @ApiOperation({operationId:'getMyUnifiedClassDrafts',summary:'get My Unified Class Drafts; current operator and publisher authority required'})
 @ApiQuery({name:'siteId',type:String,required:false})
 @ApiOkResponse({schema:docs.drafts})
 getMyUnifiedClassDrafts(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const body=validated(draftQuery,query);
  return this.identity.runWorkflow(async()=>results.drafts.parse(await workflow.getMyUnifiedClassDrafts(body)));
 }
 @Get('me/class-operator-sites')
 @ClassOperation('GET')
 @ApiOperation({operationId:'getNativeClassOperatorSites',summary:'get Native Class Operator Sites; current operator and publisher authority required'})
 
 @ApiOkResponse({schema:docs.sites})
 getNativeClassOperatorSites(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const body=validated(emptyQuery,query);
  return this.identity.runWorkflow(async()=>results.sites.parse(await workflow.getNativeClassOperatorSites(undefined)));
 }
 @Get('class-course-options')
 @ClassOperation('GET')
 @ApiOperation({operationId:'getUnifiedClassCourseOptions',summary:'get Unified Class Course Options; current operator and publisher authority required'})
 @ApiQuery({name:'siteId',type:String,required:false})
 @ApiQuery({name:'search',type:String,required:false})
 @ApiQuery({name:'cursor',type:Number,required:false})
 @ApiQuery({name:'offeringVersionId',type:String,required:false})
 @ApiQuery({name:'courseVersionIds',type:String,isArray:true,required:false})
 @ApiOkResponse({schema:docs.options})
 getUnifiedClassCourseOptions(@Req() req:FastifyRequest,@Query() query:unknown){
  const workflow=verifiedWorkflow(req);
  const body=validated(optionsQuery,query);
  return this.identity.runWorkflow(async()=>results.options.parse(await workflow.getUnifiedClassCourseOptions(body)));
 }
}

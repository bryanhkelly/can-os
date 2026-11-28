import {Controller,Get,Post,Req,Param,Query,Body,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiParam,ApiBody,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './publisher-pack.contracts';
function Operation(method:'GET'|'POST'){return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'programId',type:String,format:'uuid',required:true}),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
@ApiTags('Existing Publisher Pack compatibility')
@Controller('programs/:programId/publisher-packs')
export class PublisherPackController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get()
 @Operation('GET')
 @ApiOperation({operationId:'getPublisherPackStudio',summary:'Existing Publisher Pack studio; not native Offering release authority'})
 
 
 @ApiOkResponse({schema:c.docs.studio})
 async getPublisherPackStudio(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.program,params);
  const input={...ids,...validated(c.empty,query)};
  return this.identity.runWorkflow(async()=>c.results.studio.parse(await workflow.getPublisherPackStudio(input)));
 }

 @Post()
 @Operation('POST')
 @ApiOperation({operationId:'createAuthoredPublisherPack',summary:'Existing Publisher Pack creation; not native Offering release authority'})
 
 @ApiBody({schema:c.inputDocs.create})
 @ApiOkResponse({schema:c.docs.created})
 async createAuthoredPublisherPack(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.program,params);
  const input={...ids,...validated(c.inputs.create,body)};
  return this.identity.runWorkflow(async()=>c.results.created.parse(await workflow.createAuthoredPublisherPack(input)));
 }

 @Post(':packId/drafts')
 @Operation('POST')
 @ApiOperation({operationId:'startPublisherPackDraft',summary:'Existing Publisher Pack draft creation; not native Offering release authority'})
 @ApiParam({name:'packId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.draft})
 @ApiOkResponse({schema:c.docs.draft})
 async startPublisherPackDraft(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.pack,params);
  const input={...ids,...validated(c.inputs.draft,body)};
  return this.identity.runWorkflow(async()=>c.results.draft.parse(await workflow.startPublisherPackDraft(input)));
 }

 @Post('versions/:versionId/revisions')
 @Operation('POST')
 @ApiOperation({operationId:'saveAuthoredPublisherPack',summary:'Existing Publisher Pack composition revision; not native Offering release authority'})
 @ApiParam({name:'versionId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.save})
 @ApiOkResponse({schema:c.docs.saved})
 async saveAuthoredPublisherPack(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.version,params);
  const input={...ids,...validated(c.inputs.save,body)};
  return this.identity.runWorkflow(async()=>c.results.saved.parse(await workflow.saveAuthoredPublisherPack(input)));
 }

 @Post('versions/:versionId/publication')
 @Operation('POST')
 @ApiOperation({operationId:'publishAuthoredPublisherPack',summary:'Existing Publisher Pack publication; not native Offering release authority'})
 @ApiParam({name:'versionId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.publish})
 @ApiOkResponse({schema:c.docs.draft})
 async publishAuthoredPublisherPack(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.version,params);
  const input={...ids,...validated(c.inputs.publish,body)};
  return this.identity.runWorkflow(async()=>c.results.draft.parse(await workflow.publishAuthoredPublisherPack(input)));
 }

}

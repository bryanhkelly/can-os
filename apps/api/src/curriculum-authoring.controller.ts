import {Controller,Get,Post,Req,Param,Query,Body,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiParam,ApiBody,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './curriculum-authoring.contracts';
function Operation(method:'GET'|'POST'){return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
@ApiTags('Legacy curriculum publisher compatibility')
@Controller()
export class CurriculumAuthoringController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('curriculum-publisher-programs')
 @Operation('GET')
 @ApiOperation({operationId:'getCurriculumPrograms',summary:'List authorized publisher Programs'})
 
 
 @ApiOkResponse({schema:c.docs.programs})
 async getCurriculumPrograms(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.none,params);
  const input={...ids,...validated(c.inputs.empty,query)};
  return this.identity.runWorkflow(async()=>c.results.programs.parse(await workflow.getCurriculumPrograms(input)));
 }

 @Get('programs/:programId/curriculum-studio')
 @Operation('GET')
 @ApiOperation({operationId:'getCurriculumStudio',summary:'Read private curriculum studio including teacher-only guides'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 
 @ApiOkResponse({schema:c.docs.studio})
 async getCurriculumStudio(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.program,params);
  const input={...ids,...validated(c.inputs.empty,query)};
  return this.identity.runWorkflow(async()=>c.results.studio.parse(await workflow.getCurriculumStudio(input)));
 }

 @Post('programs/:programId/curriculum-courses')
 @Operation('POST')
 @ApiOperation({operationId:'createAuthoredCourse',summary:'Create legacy Course template'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.create})
 @ApiOkResponse({schema:c.docs.created})
 async createAuthoredCourse(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.program,params);
  const input={...ids,...validated(c.inputs.create,body)};
  return this.identity.runWorkflow(async()=>c.results.created.parse(await workflow.createAuthoredCourse(input)));
 }

 @Post('programs/:programId/curriculum-courses/:courseId/drafts')
 @Operation('POST')
 @ApiOperation({operationId:'startCurriculumDraft',summary:'Start exact Course template draft'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiParam({name:'courseId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.draft})
 @ApiOkResponse({schema:c.docs.version})
 async startCurriculumDraft(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.course,params);
  const input={...ids,...validated(c.inputs.draft,body)};
  return this.identity.runWorkflow(async()=>c.results.version.parse(await workflow.startCurriculumDraft(input)));
 }

 @Post('programs/:programId/curriculum-versions/:versionId/revisions')
 @Operation('POST')
 @ApiOperation({operationId:'saveAuthoredCurriculum',summary:'Save complete legacy draft; subject to API request size limit'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiParam({name:'versionId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.save})
 @ApiOkResponse({schema:c.docs.saved})
 async saveAuthoredCurriculum(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.version,params);
  const input={...ids,...validated(c.inputs.save,body)};
  return this.identity.runWorkflow(async()=>c.results.saved.parse(await workflow.saveAuthoredCurriculum(input)));
 }

 @Post('programs/:programId/curriculum-versions/:versionId/modules/:moduleId/lessons/:lessonId/revisions')
 @Operation('POST')
 @ApiOperation({operationId:'saveAuthoredLesson',summary:'Revise existing lesson without transmitting full course'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiParam({name:'versionId',type:String,format:'uuid',required:true})
 @ApiParam({name:'moduleId',type:String,schema:{type:'string',pattern:'^[A-Za-z0-9_-]+$',maxLength:100},required:true})
 @ApiParam({name:'lessonId',type:String,schema:{type:'string',pattern:'^[A-Za-z0-9_-]+$',maxLength:100},required:true})
 @ApiBody({schema:c.inputDocs.lesson})
 @ApiOkResponse({schema:c.docs.lesson})
 async saveAuthoredLesson(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.lesson,params);
  const input={...ids,...validated(c.inputs.lesson,body)};
  return this.identity.runWorkflow(async()=>c.results.lesson.parse(await workflow.saveAuthoredLesson(input)));
 }

 @Post('programs/:programId/curriculum-versions/:versionId/publication')
 @Operation('POST')
 @ApiOperation({operationId:'publishAuthoredCurriculum',summary:'Publish legacy draft only; not native Course publication'})
 @ApiParam({name:'programId',type:String,format:'uuid',required:true})
 @ApiParam({name:'versionId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.publish})
 @ApiOkResponse({schema:c.docs.version})
 async publishAuthoredCurriculum(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.version,params);
  const input={...ids,...validated(c.inputs.publish,body)};
  return this.identity.runWorkflow(async()=>c.results.version.parse(await workflow.publishAuthoredCurriculum(input)));
 }

}

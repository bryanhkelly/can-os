import {Controller,Get,Post,Req,Param,Query,Body,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiParam,ApiQuery,ApiBody,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './native-course-draft.contracts';
function Operation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),ApiParam({name:'courseVersionId',type:String,format:'uuid',required:true}),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Native curriculum authoring')
@Controller('course-versions/:courseVersionId')
export class NativeCourseDraftController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('draft-lessons')
 @Operation('GET')
 @ApiOperation({operationId:'getNativeCourseDraftLessons',summary:'Read bounded appointed-author draft lessons; excludes hidden publisher metadata'})
 
 
 @ApiOkResponse({schema:c.docs.lessons})
 async getNativeCourseDraftLessons(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.course,params);
  const input={...ids,...validated(c.queries.empty,query)};
  return this.identity.runWorkflow(async()=>c.results.lessons.parse(await workflow.getNativeCourseDraftLessons(input)));
 }

 @Post('draft-lessons/:lessonId/revisions')
 @Operation('POST')
 @ApiOperation({operationId:'saveNativeCourseLessonDraft',summary:'Save exact draft lesson revision; independent publication still required'})
 @ApiParam({name:'lessonId',type:String,format:'uuid',required:true})
 @ApiBody({schema:c.inputDocs.lesson})
 @ApiOkResponse({schema:c.docs.saved})
 async saveNativeCourseLessonDraft(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.lesson,params);
  const input={...ids,...validated(c.inputs.lesson,body)};
  return this.identity.runWorkflow(async()=>c.results.saved.parse(await workflow.saveNativeCourseLessonDraft(input)));
 }

 @Get('release-readiness')
 @Operation('GET')
 @ApiOperation({operationId:'getNativeCourseReleaseReadiness',summary:'Read publisher-only diagnostic readiness, never approval'})
 
 
 @ApiOkResponse({schema:c.docs.readiness})
 async getNativeCourseReleaseReadiness(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.course,params);
  const input={...ids,...validated(c.queries.empty,query)};
  return this.identity.runWorkflow(async()=>c.results.readiness.parse(await workflow.getNativeCourseReleaseReadiness(input)));
 }

 @Post('draft-assignments')
 @Operation('POST')
 @ApiOperation({operationId:'createNativeCourseAssignmentDraft',summary:'Create immutable official assignment definition and delivery draft atomically'})
 
 @ApiBody({schema:c.inputDocs.assignment})
 @ApiOkResponse({schema:c.docs.assignment})
 async createNativeCourseAssignmentDraft(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.course,params);
  const input={...ids,...validated(c.inputs.assignment,body)};
  return this.identity.runWorkflow(async()=>c.results.assignment.parse(await workflow.createNativeCourseAssignmentDraft(input)));
 }

 @Get('draft-assignments')
 @Operation('GET')
 @ApiOperation({operationId:'getNativeCourseAssignmentDrafts',summary:'List bounded official draft assignments'})
 
 @ApiQuery({name:'offset',required:false,schema:{type:'integer',minimum:0,maximum:1000000}})
 @ApiOkResponse({schema:c.docs.assignments})
 async getNativeCourseAssignmentDrafts(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const workflow=verifiedWorkflow(req),ids=validated(c.params.course,params);
  const input={...ids,...validated(c.queries.assignments,query)};
  return this.identity.runWorkflow(async()=>c.results.assignments.parse(await workflow.getNativeCourseAssignmentDrafts(input)));
 }

}

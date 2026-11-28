import {Controller,Post,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import {bodies,results,inputs,docs} from './launch.contracts';
function LaunchCommand(){
 return applyDecorators(GovernedWorkflowOperation('can'),HttpCode(200),ApiCookieAuth('session'),ApiHeader({name:'Origin',required:true}),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Program launch')
@Controller()
export class LaunchController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('program-launches')
 @LaunchCommand()
 @ApiOperation({operationId:'startLaunch',summary:'Start a governed Program launch'})
 @ApiBody({schema:inputs.start})
 @ApiOkResponse({schema:docs.start})
 async startLaunch(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(bodies.start,body),workflow=verifiedWorkflow(req);
  return results.start.parse(await this.identity.runWorkflow(()=>workflow.startLaunch(input)));
 }
 @Post('launch-requirement-completions')
 @LaunchCommand()
 @ApiOperation({operationId:'completeLaunchRequirement',summary:'Complete a currently school-owned requirement'})
 @ApiBody({schema:inputs.complete})
 @ApiOkResponse({schema:docs.complete})
 async completeLaunchRequirement(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(bodies.complete,body),workflow=verifiedWorkflow(req);
  return results.complete.parse(await this.identity.runWorkflow(()=>workflow.completeLaunchRequirement(input)));
 }
 @Post('launch-evidence-submissions')
 @LaunchCommand()
 @ApiOperation({operationId:'submitLaunchEvidence',summary:'Submit evidence without approving it'})
 @ApiBody({schema:inputs.submit})
 @ApiOkResponse({schema:docs.submit})
 async submitLaunchEvidence(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(bodies.submit,body),workflow=verifiedWorkflow(req);
  return results.submit.parse(await this.identity.runWorkflow(()=>workflow.submitLaunchEvidence(input)));
 }
 @Post('launch-evidence-decisions')
 @LaunchCommand()
 @ApiOperation({operationId:'reviewLaunchEvidence',summary:'Record independent institutional evidence decision'})
 @ApiBody({schema:inputs.review})
 @ApiOkResponse({schema:docs.review})
 async reviewLaunchEvidence(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(bodies.review,body),workflow=verifiedWorkflow(req);
  return results.review.parse(await this.identity.runWorkflow(()=>workflow.reviewLaunchEvidence(input)));
 }
 @Post('program-launch-activations')
 @LaunchCommand()
 @ApiOperation({operationId:'activateLaunch',summary:'Activate only a ready Program with opening authorization'})
 @ApiBody({schema:inputs.activate})
 @ApiOkResponse({schema:docs.activate})
 async activateLaunch(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(bodies.activate,body),workflow=verifiedWorkflow(req);
  return results.activate.parse(await this.identity.runWorkflow(()=>workflow.activateLaunch(input)));
 }
 @Post('launch-orientations')
 @LaunchCommand()
 @ApiOperation({operationId:'scheduleLaunchOrientation',summary:'Schedule governed Program orientation'})
 @ApiBody({schema:inputs.orientation})
 @ApiOkResponse({schema:docs.orientation})
 async scheduleLaunchOrientation(@Req() req:FastifyRequest,@Body() body:unknown){
  const input=validated(bodies.orientation,body),workflow=verifiedWorkflow(req);
  return results.orientation.parse(await this.identity.runWorkflow(()=>workflow.scheduleLaunchOrientation(input)));
 }
}

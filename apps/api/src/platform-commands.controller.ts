import {Controller,Get,Post,Body,Param,Query,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiParam,ApiQuery,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {CanonicalReadOperation,CanonicalWriteOperation,verifiedIdentity} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './platform-commands.contracts';
function GovernedRead(){
 return applyDecorators(CanonicalReadOperation(),
 ...[400,401,403,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
function GovernedCommand(){
 return applyDecorators(CanonicalWriteOperation(),HttpCode(200),ApiHeader({name:'Origin',required:true}),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Offering releases')
@ApiCookieAuth('session')
@Controller('offering-versions')
export class OfferingReleaseController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get(':offeringVersionId/review-content')
 @GovernedRead()
 @ApiParam({name:'offeringVersionId',required:true,type:String,format:'uuid'})
 @ApiQuery({name:'manifestId',required:true,type:String})
 @ApiQuery({name:'expectedHash',required:true,type:String})
 @ApiOperation({operationId:'getExactOfferingReviewContent',summary:'Independent appointed reviewer reads exact current submitted manuscript and evidence; stale hash fails closed'})
 @ApiOkResponse({schema:c.exactReviewDoc})
 @ApiResponse({status:409,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 exactReview(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
   const input={...validated(c.versionParams,params),...validated(c.exactReviewQuery,query)};
   return this.identity.run(verifiedIdentity(req),async actor=>c.exactReviewResult.parse(JSON.parse(JSON.stringify(await actor.readReleaseContent(input)))));
 }
 @Get('release-review-queue')
 @GovernedRead()
 @ApiOperation({operationId:'listReleaseReviewQueue',summary:'Page through current independently appointed Offering reviews'})
 @ApiQuery({name:'createdAt',required:false,type:String,description:'Supply together with id; previous nextCursor timestamp'})
 @ApiQuery({name:'id',required:false,type:String,description:'Supply together with createdAt; previous nextCursor identifier'})
 @ApiOkResponse({schema:c.releaseReadDocs.queue})
 queue(@Req() req:FastifyRequest,@Query() query:unknown){
   const q=validated(c.queueQuery,query);
   const cursor=q.createdAt&&q.id?{createdAt:q.createdAt,id:q.id}:null;
   return this.identity.run(verifiedIdentity(req),async actor=>c.releaseQueueResult.parse(await actor.readReleaseQueue({cursor})));
 }
 @Get(':offeringVersionId/release')
 @GovernedRead()
 @ApiParam({name:'offeringVersionId',required:true,type:String,format:'uuid'})
 @ApiOperation({operationId:'getReleaseOverview',summary:'Read authorized Offering draft, immutable hash, asset and manifest state'})
 @ApiOkResponse({schema:c.releaseReadDocs.overview})
 overview(@Req() req:FastifyRequest,@Param() params:unknown){
   const input=validated(c.versionParams,params);
   return this.identity.run(verifiedIdentity(req),async actor=>c.releaseOverviewResult.parse(await actor.readReleaseOverview(input)));
 }
 @Get(':offeringVersionId/release-policy')
 @GovernedRead()
 @ApiParam({name:'offeringVersionId',required:true,type:String,format:'uuid'})
 @ApiOperation({operationId:'getReleasePolicy',summary:'Read current release policy and revision as independent appointed reviewer'})
 @ApiOkResponse({schema:c.releaseReadDocs.policy})
 policy(@Req() req:FastifyRequest,@Param() params:unknown){
   const input=validated(c.versionParams,params);
   return this.identity.run(verifiedIdentity(req),async actor=>c.releasePolicyResult.parse(await actor.readReleasePolicy(input)));
 }
 @Post(':offeringVersionId/release-submissions')
 @GovernedCommand()
 @ApiParam({name:'offeringVersionId',required:true,type:String,format:'uuid'})
 @ApiOperation({operationId:'submitRelease',summary:'Submit exact Offering snapshot for review'})
 @ApiBody({schema:c.docs.submit})
 @ApiOkResponse({schema:c.docs.submitResult})
 submitRelease(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
   const ids=validated(c.versionParams,params);
   const input=validated(c.submitBody,body);
   return this.identity.run(verifiedIdentity(req),async actor=>c.submitResult.parse(await actor.submitRelease({...ids,...input})));
 }
 @Post(':offeringVersionId/release-policy')
 @GovernedCommand()
 @ApiParam({name:'offeringVersionId',required:true,type:String,format:'uuid'})
 @ApiOperation({operationId:'saveReleasePolicy',summary:'Record independently reviewed release requirements'})
 @ApiBody({schema:c.docs.policy})
 @ApiOkResponse({schema:c.docs.policyResult})
 saveReleasePolicy(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
   const ids=validated(c.versionParams,params);
   const input=validated(c.policyBody,body);
   return this.identity.run(verifiedIdentity(req),async actor=>c.policyResult.parse(await actor.saveReleasePolicy({...ids,...input})));
 }
 @Post(':offeringVersionId/release-decisions')
 @GovernedCommand()
 @ApiParam({name:'offeringVersionId',required:true,type:String,format:'uuid'})
 @ApiOperation({operationId:'decideRelease',summary:'Record independent exact-manifest review decision'})
 @ApiBody({schema:c.docs.decision})
 @ApiOkResponse({schema:c.docs.decisionResult})
 decideRelease(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
   const ids=validated(c.versionParams,params);
   const input=validated(c.decisionBody,body);
   return this.identity.run(verifiedIdentity(req),async actor=>c.decisionResult.parse(await actor.decideRelease({...ids,...input})));
 }
 @Post(':offeringVersionId/course-publication')
 @GovernedCommand()
 @ApiParam({name:'offeringVersionId',required:true,type:String,format:'uuid'})
 @ApiOperation({operationId:'publishCourses',summary:'Publish reviewed constituent Course versions'})
 @ApiBody({schema:c.docs.publish})
 @ApiOkResponse({schema:c.docs.coursesResult})
 publishCourses(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
   const ids=validated(c.versionParams,params);
   const input=validated(c.publishBody,body);
   return this.identity.run(verifiedIdentity(req),async actor=>c.coursesResult.parse(await actor.publishCourses({...ids,...input})));
 }
 @Post(':offeringVersionId/asset-manifest-approval')
 @GovernedCommand()
 @ApiParam({name:'offeringVersionId',required:true,type:String,format:'uuid'})
 @ApiOperation({operationId:'approveAssetManifest',summary:'Approve asset-bearing publication manifest'})
 @ApiBody({schema:c.docs.publish})
 @ApiOkResponse({schema:c.docs.approveResult})
 approveAssetManifest(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
   const ids=validated(c.versionParams,params);
   const input=validated(c.publishBody,body);
   return this.identity.run(verifiedIdentity(req),async actor=>c.approveResult.parse(await actor.approveAssetManifest({...ids,...input})));
 }
 @Post(':offeringVersionId/publication')
 @GovernedCommand()
 @ApiParam({name:'offeringVersionId',required:true,type:String,format:'uuid'})
 @ApiOperation({operationId:'publishOffering',summary:'Publish Offering after independent asset and Course approval'})
 @ApiBody({schema:c.docs.publish})
 @ApiOkResponse({schema:c.docs.publishResult})
 publishOffering(@Req() req:FastifyRequest,@Param() params:unknown,@Body() body:unknown){
   const ids=validated(c.versionParams,params);
   const input=validated(c.publishBody,body);
   return this.identity.run(verifiedIdentity(req),async actor=>c.publishResult.parse(await actor.publishOffering({...ids,...input})));
 }
}

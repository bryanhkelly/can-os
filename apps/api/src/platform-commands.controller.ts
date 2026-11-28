import {Controller,Post,Body,Param,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiParam,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {CanonicalWriteOperation,verifiedIdentity} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './platform-commands.contracts';
function GovernedCommand(){
 return applyDecorators(CanonicalWriteOperation(),HttpCode(200),ApiHeader({name:'Origin',required:true}),
 ...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Sites')
@ApiCookieAuth('session')
@Controller('sites')
export class SitesController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post()
 @GovernedCommand()
 @ApiOperation({operationId:'createSite',summary:'Create or replay a planning Site under an existing authorized Organization'})
 @ApiBody({schema:c.docs.site})
 @ApiOkResponse({schema:c.docs.siteResult})
 create(@Req() req:FastifyRequest,@Body() body:unknown){
   const input=validated(c.siteBody,body);
   return this.identity.run(verifiedIdentity(req),async actor=>c.siteResult.parse(await actor.createSite(input)));
 }
}
@ApiTags('Offering releases')
@ApiCookieAuth('session')
@Controller('offering-versions')
export class OfferingReleaseController{
 constructor(private readonly identity:CanonicalIdentityService){}
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

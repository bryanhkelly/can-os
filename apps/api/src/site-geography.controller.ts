import {Controller,Get,Param,Query,Req} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiParam,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './site-geography.contracts';
@ApiTags('Site geographic intelligence')
@ApiCookieAuth('session')
@Controller('sites/:siteId/geography')
export class SiteGeographyController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get()
 @GovernedWorkflowOperation('can','GET')
 @ApiParam({name:'siteId',type:String,format:'uuid',required:true})
 @ApiOperation({operationId:'readSiteGeography',summary:'Read authorized Site geographic facts and source version; no regulatory authority asserted'})
 @ApiOkResponse({schema:c.geographyDoc})
 @ApiResponse({status:400,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:500,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
 async read(@Req() req:FastifyRequest,@Param() params:unknown,@Query() query:unknown){
  const input={...validated(c.params,params),...validated(c.empty,query)};
  return c.geography.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).readSiteGeography(input)));
 }
}

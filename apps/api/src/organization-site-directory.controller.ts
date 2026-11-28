import {Controller,Get,Post,Query,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiOkResponse,ApiBody,ApiHeader,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {GovernedWorkflowOperation,verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './organization-site-directory.contracts';
function Operation(method:'GET'|'POST'){
 return applyDecorators(GovernedWorkflowOperation('can',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
@ApiTags('Organization Site directory')
@Controller('me')
export class OrganizationSiteDirectoryController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('sites')
 @Operation('GET')
 @ApiOperation({operationId:'listMySites',summary:'List Sites in both current registrar Site and Organization scope'})
 @ApiOkResponse({schema:c.docs.directory})
 async list(@Req() req:FastifyRequest,@Query() query:unknown){const input=validated(c.empty,query);return c.directory.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).listMySites(input)));}
 @Get('network-sites')
 @Operation('GET')
 @ApiOperation({operationId:'getNetworkSites',summary:'Current authorized denomination HQ direct Sites; excludes affiliate private Sites'})
 @ApiOkResponse({schema:c.docs.network})
 async network(@Req() req:FastifyRequest,@Query() query:unknown){const input=validated(c.empty,query);return c.network.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).getNetworkSites(input)));}
 @Post('network-sites')
 @Operation('POST')
 @ApiOperation({operationId:'createNetworkSite',summary:'Create or replay a directly owned Site under the verified HQ and current agreement'})
 @ApiBody({schema:c.docs.create})
 @ApiOkResponse({schema:c.docs.receipt})
 async create(@Req() req:FastifyRequest,@Body() body:unknown){const input=validated(c.create,body);return c.receipt.parse(await this.identity.runWorkflow(()=>verifiedWorkflow(req).createNetworkSite(input)));}
}

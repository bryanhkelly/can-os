import {Controller,Post,Body,Req,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiBody,ApiOkResponse,ApiHeader,ApiResponse} from '@nestjs/swagger';
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

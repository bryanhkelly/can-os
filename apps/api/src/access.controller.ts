import {Controller,Get,Post,Req,Res,Body,applyDecorators,HttpException,InternalServerErrorException,HttpCode} from '@nestjs/common';
import {ApiTags,ApiOperation,ApiBody,ApiResponse,ApiHeader,ApiCookieAuth} from '@nestjs/swagger';
import type {FastifyReply,FastifyRequest} from 'fastify';
import {AnonymousAccessOperation,CanonicalReadOperation,CanonicalWriteOperation,verifiedIdentity} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './access.contracts';
import type {ZodTypeAny} from 'zod';

function AccessErrors(){
 return applyDecorators(...[400,401,403,409,413,415,429,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));
}
function AnonymousPost(){
 return applyDecorators(AnonymousAccessOperation(),ApiHeader({name:'Origin',required:true}),AccessErrors());
}
async function translateResponse(response:Response,reply:FastifyReply,status:number,schema?:ZodTypeAny){
 const retry=response.headers.get('retry-after');
 if(retry&&/^\d{1,5}$/.test(retry))reply.header('Retry-After',retry);
 if(!response.ok){
   if(![400,401,403,409,413,415,429,503].includes(response.status))throw new InternalServerErrorException();
   throw new HttpException('Access operation rejected',response.status);
 }
 if(response.status!==status)throw new InternalServerErrorException();
 const payload=schema?schema.parse(await response.json()):undefined;
 const cookie=response.headers.get('set-cookie');
 if(cookie){
   // JSON verification and logout issue exactly one existing secure cookie.
   // Never manufacture a session cookie or copy arbitrary response headers.
   if(!/^__Host-can_os_session=/.test(cookie)||!cookie.includes('HttpOnly')||!cookie.includes('Secure')||!cookie.includes('Path=/'))throw new InternalServerErrorException();
   reply.header('Set-Cookie',cookie);
 }
 reply.header('Referrer-Policy','no-referrer');
 reply.code(status);
 return payload;
}
@ApiTags('Access')
@Controller('access')
export class AccessController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('request')
 @AnonymousPost()
 @HttpCode(200)
 @ApiOperation({operationId:'requestAccessLink',summary:'Request ordinary one-time access link; generic acceptance'})
 @ApiBody({schema:c.doc.request})
 @ApiResponse({status:200,schema:c.doc.accepted})
 async request(@Req() req:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply,@Body() body:unknown){
   return translateResponse(await this.identity.executeAccess('handleAccessRequest',req,validated(c.requestBody,body)),reply,200,c.accepted);
 }
 @Post('verify')
 @AnonymousPost()
 @HttpCode(200)
 @ApiOperation({operationId:'verifyAccess',summary:'Redeem existing one-time credential and issue the standard secure session cookie'})
 @ApiBody({schema:c.doc.verify})
 @ApiResponse({status:200,schema:c.doc.verified,headers:{'Set-Cookie':{schema:{type:'string'},description:'Existing secure HttpOnly session cookie'}}})
 async verify(@Req() req:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply,@Body() body:unknown){
   return translateResponse(await this.identity.executeAccess('handleAccessVerification',req,validated(c.verificationBody,body)),reply,200,c.verified);
 }
 @Post('register')
 @AnonymousPost()
 @HttpCode(200)
 @ApiOperation({operationId:'registerAccount',summary:'Request verified personal account registration'})
 @ApiBody({schema:c.doc.register})
 @ApiResponse({status:200,schema:c.doc.accepted})
 async register(@Req() req:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply,@Body() body:unknown){
   return translateResponse(await this.identity.executeAccess('handlePersonalRegistration',req,validated(c.registerBody,body)),reply,200,c.accepted);
 }
 @Post('site-signups')
 @AnonymousPost()
 @HttpCode(202)
 @ApiOperation({operationId:'requestSiteSignup',summary:'Request Organization and initial Site creation through existing mailbox verification'})
 @ApiBody({schema:c.doc.site})
 @ApiResponse({status:202,schema:c.doc.accepted})
 async site(@Req() req:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply,@Body() body:unknown){
   return translateResponse(await this.identity.executeAccess('handleSiteSignupRequest',req,validated(c.siteSignupBody,body)),reply,202,c.accepted);
 }
 @Get('session')
 @CanonicalReadOperation()
 @ApiCookieAuth('session')
 @AccessErrors()
 @ApiOperation({operationId:'getAccessSession',summary:'Read current verified membership choices; no credentials or raw account record'})
 @ApiResponse({status:200,schema:c.doc.session})
 session(@Req() req:FastifyRequest){
   return this.identity.run(verifiedIdentity(req),async actor=>c.session.parse(await actor.readSession()));
 }
 @Post('logout')
 @CanonicalWriteOperation()
 @ApiCookieAuth('session')
 @HttpCode(204)
 @AccessErrors()
 @ApiHeader({name:'Origin',required:true})
 @ApiOperation({operationId:'logout',summary:'Revoke current session and clear its cookie'})
 @ApiBody({schema:c.doc.empty})
 @ApiResponse({status:204})
 async logout(@Req() req:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply,@Body() body:unknown){
   return translateResponse(await this.identity.executeAccess('handleAccessLogout',req,validated(c.empty,body)),reply,204);
 }
}

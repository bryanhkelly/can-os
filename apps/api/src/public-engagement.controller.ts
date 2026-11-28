import {Controller,Get,Post,Req,Res,Param,applyDecorators,BadRequestException,UnsupportedMediaTypeException,PayloadTooLargeException} from '@nestjs/common';
import {ApiTags,ApiOperation,ApiResponse,ApiParam,ApiQuery,ApiHeader,ApiConsumes,ApiBody} from '@nestjs/swagger';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {PublicOperation} from './security';
import {CanonicalIdentityService} from './identity.service';

const allowedResponseHeaders=['cache-control','referrer-policy','content-security-policy','x-content-type-options','x-frame-options','x-robots-tag','content-type','location','allow'] as const;
async function sendProtocolResponse(response:Response,reply:FastifyReply){
 for(const name of allowedResponseHeaders){const value=response.headers.get(name);if(value!==null)reply.header(name,value);}
 reply.code(response.status);
 if(response.body===null)return reply.send();
 return reply.send(Buffer.from(await response.arrayBuffer()));
}
function publicRequest(req:FastifyRequest,path:string,limit:number,mediaTypes:readonly string[]=[]):Request{
 const raw=req.raw.url??'';
 const queryAt=raw.indexOf('?');
 const url='http://127.0.0.1'+path+(queryAt<0?'':raw.slice(queryAt));
 const headers=new Headers();
 // Only the public protocol headers are forwarded; no session or forwarded authority.
 for(const name of ['content-type','content-length','svix-id','svix-timestamp','svix-signature']){
  const value=req.headers[name];if(typeof value==='string')headers.set(name,value);
 }
 if(req.method==='GET')return new Request(url,{headers});
 const contentType=(headers.get('content-type')??'').split(';')[0]?.trim().toLowerCase()??'';
 if(!mediaTypes.includes(contentType))throw new UnsupportedMediaTypeException();
 if(!Buffer.isBuffer(req.body))throw new BadRequestException();
 if(req.body.length>limit)throw new PayloadTooLargeException();
 return new Request(url,{method:'POST',headers,body:new Uint8Array(req.body)});
}
const html={ 'text/html':{schema:{type:'string' as const}} };
function PublicProtocol(){return applyDecorators(PublicOperation(),ApiResponse({status:503,description:'Unavailable; isolated runtime disabled or dependency unavailable'}));}
@ApiTags('Public engagement protocols')
@Controller()
export class PublicEngagementController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('go/:code')
 @PublicProtocol()
 @ApiOperation({operationId:'resolvePublicGoLink',summary:'Resolve public Go code to an immutable landing page or governed redirect'})
 @ApiParam({name:'code',required:true,schema:{type:'string',pattern:'^[A-Za-z0-9_-]{12}$'}})
 @ApiQuery({name:'page',required:false,type:String})
 @ApiResponse({status:200,content:html})
 @ApiResponse({status:302,description:'Governed destination',headers:{Location:{schema:{type:'string'}}}})
 @ApiResponse({status:404,content:html})
 async go(@Req() req:FastifyRequest,@Res() reply:FastifyReply,@Param('code') code:string){
  return sendProtocolResponse(await this.identity.executePublicProtocol('handlePublicGo',publicRequest(req,'/go/'+encodeURIComponent(code),0),code),reply);
 }
 @Get('campaigns/unsubscribe')
 @PublicProtocol()
 @ApiOperation({operationId:'previewCampaignUnsubscribe',summary:'Read-only unsubscribe confirmation; GET never changes consent'})
 @ApiQuery({name:'token',required:true,schema:{type:'string',format:'uuid'}})
 @ApiResponse({status:200,content:html})
 @ApiResponse({status:400,content:html})
 async preview(@Req() req:FastifyRequest,@Res() reply:FastifyReply){
  return sendProtocolResponse(await this.identity.executePublicProtocol('handlePublicCampaignUnsubscribe',publicRequest(req,'/api/campaigns/unsubscribe',0)),reply);
 }
 @Post('campaigns/unsubscribe')
 @PublicProtocol()
 @ApiOperation({operationId:'confirmCampaignUnsubscribe',summary:'RFC 8058 token-authorized one-click consent withdrawal; no session or Origin required'})
 @ApiQuery({name:'token',required:true,schema:{type:'string',format:'uuid'}})
 @ApiConsumes('application/x-www-form-urlencoded','multipart/form-data')
 @ApiBody({schema:{type:'object',required:['List-Unsubscribe'],additionalProperties:false,properties:{'List-Unsubscribe':{type:'string',enum:['One-Click']}}}})
 @ApiResponse({status:200,content:html})
 @ApiResponse({status:400,content:html})
 @ApiResponse({status:413,description:'Payload too large'})
 @ApiResponse({status:415,description:'Unsupported media type'})
 async unsubscribe(@Req() req:FastifyRequest,@Res() reply:FastifyReply){
  return sendProtocolResponse(await this.identity.executePublicProtocol('handlePublicCampaignUnsubscribe',publicRequest(req,'/api/campaigns/unsubscribe',4096,['application/x-www-form-urlencoded','multipart/form-data'])),reply);
 }
 @Post('webhooks/resend')
 @PublicProtocol()
 @ApiOperation({operationId:'receiveResendDeliveryReceipt',summary:'Verify the signed original payload before interpreting provider delivery evidence'})
 @ApiConsumes('application/json')
 @ApiHeader({name:'svix-id',required:true})
 @ApiHeader({name:'svix-timestamp',required:true})
 @ApiHeader({name:'svix-signature',required:true})
 @ApiBody({schema:{type:'object',additionalProperties:true}})
 @ApiResponse({status:200,description:'Acknowledged signed event'})
 @ApiResponse({status:400,description:'Invalid signed JSON'})
 @ApiResponse({status:401,description:'Invalid signature'})
 @ApiResponse({status:413,description:'Payload too large'})
 @ApiResponse({status:415,description:'Unsupported media type'})
 async webhook(@Req() req:FastifyRequest,@Res() reply:FastifyReply){
  return sendProtocolResponse(await this.identity.executePublicProtocol('handleResendDeliveryWebhook',publicRequest(req,'/api/webhooks/resend',64*1024,['application/json'])),reply);
 }
}

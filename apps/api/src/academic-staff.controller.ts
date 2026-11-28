import {Controller,Get,Post,Body,Req,Query,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiHeader,ApiQuery,ApiBody,ApiOkResponse,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {CanonicalReadOperation,CanonicalWriteOperation,verifiedIdentity} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './academic-staff.contracts';
const errors=()=>[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}}));
const Read=()=>applyDecorators(CanonicalReadOperation(),...errors());
const Write=()=>applyDecorators(CanonicalWriteOperation(),HttpCode(200),ApiHeader({name:'Origin',required:true}),...errors());
@ApiTags('Identity — Institutional Academic Staff')
@ApiCookieAuth('session')
@Controller('identity/academic-staff')
export class AcademicStaffController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('delegations')
 @Read()
 @ApiOperation({operationId:'listCANAcademicProgramStaff',summary:'List eligible original CAN employees and exact Program assignments'})
 @ApiQuery({name:'programId',required:true,schema:{type:'string',format:'uuid'}})
 @ApiOkResponse({schema:c.doc.desk})
 list(@Req() request:FastifyRequest,@Query() query:unknown){
  const input=validated(c.query,query);
  return this.identity.run(verifiedIdentity(request),async actor=>c.desk.parse(await actor.listCANAcademicProgramStaff(input.programId)));
 }
 @Post('delegations')
 @Write()
 @ApiOperation({operationId:'delegateCANAcademicProgramStaff',summary:'Delegate Program duties to an existing verified CAN employee under a current service agreement'})
 @ApiBody({schema:c.doc.grant})
 @ApiOkResponse({schema:c.doc.granted})
 grant(@Req() request:FastifyRequest,@Body() body:unknown){
  const input=validated(c.grant,body);
  return this.identity.run(verifiedIdentity(request),async actor=>c.granted.parse(await actor.delegateCANAcademicProgramStaff(input)));
 }
 @Post('revocations')
 @Write()
 @ApiOperation({operationId:'revokeCANAcademicProgramStaff',summary:'Revoke only an institution-owned exact Program delegation'})
 @ApiBody({schema:c.doc.revoke})
 @ApiOkResponse({schema:c.doc.revoked})
 revoke(@Req() request:FastifyRequest,@Body() body:unknown){
  const input=validated(c.revoke,body);
  return this.identity.run(verifiedIdentity(request),async actor=>c.revoked.parse(await actor.revokeCANAcademicProgramStaff(input)));
 }
}

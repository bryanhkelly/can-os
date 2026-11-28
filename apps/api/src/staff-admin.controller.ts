import {Controller,Get,Post,Body,Req,Query,HttpCode,applyDecorators} from '@nestjs/common';
import {ApiTags,ApiCookieAuth,ApiOperation,ApiHeader,ApiQuery,ApiBody,ApiOkResponse,ApiResponse} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {CanonicalReadOperation,CanonicalWriteOperation,verifiedIdentity} from './security';
import {CanonicalIdentityService} from './identity.service';
import {problemOpenApiSchema} from './contracts';
import {validated} from './learning.contracts';
import * as c from './staff-admin.contracts';
const errors=()=>[400,401,403,409,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}}));
const Read=()=>applyDecorators(CanonicalReadOperation(),...errors());
const Write=()=>applyDecorators(CanonicalWriteOperation(),HttpCode(200),ApiHeader({name:'Origin',required:true}),...errors());

@ApiTags('Identity — Staff Administration')
@ApiCookieAuth('session')
@Controller('staff')
export class StaffAdminController{
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('sites')
 @Read()
 @ApiOperation({operationId:'listStaffAdministrationSites',summary:'List Sites in the current registrar or Site Admin grant'})
 @ApiOkResponse({schema:c.doc.sites})
 sites(@Req() request:FastifyRequest){
  return this.identity.run(verifiedIdentity(request),async actor=>c.sites.parse(await actor.listStaffSites()));
 }
 @Get('people')
 @Read()
 @ApiOperation({operationId:'listStaffAdministrationPeople',summary:'Search the scoped canonical Person directory'})
 @ApiQuery({name:'query',required:false,schema:{type:'string',maxLength:120}})
 @ApiOkResponse({schema:c.doc.people})
 people(@Req() request:FastifyRequest,@Query() query:unknown){
  const input=validated(c.query,query);
  return this.identity.run(verifiedIdentity(request),async actor=>c.people.parse(await actor.listStaffPeople(input)));
 }
 @Get('accounts')
 @Read()
 @ApiOperation({operationId:'listStaffAdministrationAccounts',summary:'Read scoped grants and independently verified staff readiness'})
 @ApiOkResponse({schema:c.doc.accounts})
 accounts(@Req() request:FastifyRequest){
  return this.identity.run(verifiedIdentity(request),async actor=>c.accounts.parse(await actor.listStaffAccounts()));
 }
 @Post('invitations')
 @Write()
 @ApiOperation({operationId:'inviteStaffMembership',summary:'Issue or retry an exact-Site staff invitation'})
 @ApiBody({schema:c.doc.invite})
 @ApiOkResponse({schema:c.doc.invitation})
 invite(@Req() request:FastifyRequest,@Body() body:unknown){
  const input=validated(c.invite,body);
  return this.identity.run(verifiedIdentity(request),async actor=>c.invitation.parse(await actor.inviteStaff(input)));
 }
 @Post('grant-state')
 @Write()
 @ApiOperation({operationId:'setStaffMembershipState',summary:'Revoke or restore an eligible local membership; revoked sessions stay revoked'})
 @ApiBody({schema:c.doc.grantState})
 @ApiOkResponse({schema:c.doc.grantState})
 state(@Req() request:FastifyRequest,@Body() body:unknown){
  const input=validated(c.grantState,body);
  return this.identity.run(verifiedIdentity(request),async actor=>c.grantState.parse(await actor.setStaffGrantState(input)));
 }
}

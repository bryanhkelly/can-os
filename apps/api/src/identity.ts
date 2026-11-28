import { createRequire } from 'node:module';
import { Controller, Get, Injectable, Req, ServiceUnavailableException, UnauthorizedException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags, ApiOkResponse, ApiResponse } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PublicOperation } from './security';
import { problemOpenApiSchema } from './contracts';

const uuid = z.string().uuid();
const meSchema = z.object({
  personId: uuid, grantId: uuid, role: z.string().min(1),
  organizationIds: z.array(uuid), siteIds: z.array(uuid), programIds: z.array(uuid),
}).strict();
const classSchema = z.object({
  classId: uuid, title: z.string(), deliveryMode: z.enum(['self_paced','scheduled','facilitated','hybrid']),
  enrollmentId: uuid.nullable(), status: z.enum(['active','pending','not_enrolled']),
  courseAttemptId: uuid.nullable(), creditMode: z.enum(['for_credit','audit','not_applicable']).nullable(),
  canJoin: z.boolean(),
}).strict();
const studentClassesSchema = z.object({kind: z.literal('student'), classes: z.array(classSchema)}).strict();
const id = {type:'string' as const, format:'uuid'};
const ids = {type:'array' as const, items:id};
const nullableId = {...id, nullable:true};
const meProperties = {personId:id,grantId:id,role:{type:'string' as const,minLength:1},organizationIds:ids,siteIds:ids,programIds:ids};
const classProperties = {classId:id,title:{type:'string' as const},deliveryMode:{type:'string' as const,enum:['self_paced','scheduled','facilitated','hybrid']},
  enrollmentId:nullableId,status:{type:'string' as const,enum:['active','pending','not_enrolled']},courseAttemptId:nullableId,
  creditMode:{type:'string' as const,enum:['for_credit','audit','not_applicable'],nullable:true},canJoin:{type:'boolean' as const}};
const meDoc = {type:'object' as const,additionalProperties:false,required:Object.keys(meProperties),properties:meProperties};
const classDoc = {type:'object' as const,additionalProperties:false,required:Object.keys(classProperties),properties:classProperties};
type Identity = {me:unknown;readStudentClasses:()=>Promise<unknown>};
type Bridge = {resolveHttpIdentity:(request:Request)=>Promise<Identity>;classifyHttpDomainError:(error:unknown)=>string};

/** Only explicit verified local runtime configuration can enable this adapter. */
@Injectable()
export class CanonicalIdentityService {
  private bridge?: Bridge;
  private load(): Bridge {
    if (process.env.API_CANONICAL_READS !== '1' || process.env.NODE_ENV === 'production' ||
      (process.env.API_HOST ?? '127.0.0.1') !== '127.0.0.1') throw new ServiceUnavailableException();
    if (!this.bridge) {
      try { this.bridge = createRequire(__filename)('./canonical.cjs') as Bridge; }
      catch { throw new ServiceUnavailableException(); }
    }
    return this.bridge;
  }

  async run<T>(request: FastifyRequest, work: (identity: Identity)=>Promise<T>): Promise<T> {
    // No caller-supplied role, account, grant or forwarding headers.
    // This initial adapter supports GET only, with no state changes.
    if (request.method !== 'GET') throw new ForbiddenException();
    const cookie = request.headers.cookie;
    if (typeof cookie !== 'string' || !cookie) throw new UnauthorizedException();
    const bridge = this.load();
    let identity: Identity;
    try { identity = await bridge.resolveHttpIdentity(new Request('http://127.0.0.1/api/v1/identity', {method:'GET',headers:{cookie}})); }
    catch(error) { throw this.translate(bridge,error); }
    // Output validation failures are internal defects, not caller validation errors.
    try { return await work(identity); }
    catch(error) {
      if (error instanceof ForbiddenException || error instanceof z.ZodError) throw error;
      throw this.translate(bridge,error);
    }
  }
  private translate(bridge:Bridge,error:unknown):Error {
    switch(bridge.classifyHttpDomainError(error)){
      case 'authentication': return new UnauthorizedException();
      case 'authorization': return new ForbiddenException();
      case 'validation': return new BadRequestException();
      case 'conflict': return new ConflictException();
      case 'unavailable': return new ServiceUnavailableException();
      default: return new Error('Unexpected domain failure');
    }
  }
}

// The explicit operation decorator bypasses only the placeholder deny guard;
// this controller always authenticates through CanonicalIdentityService.
@ApiTags('Identity')
@ApiCookieAuth('session')
@Controller('me')
export class IdentityController {
  constructor(private readonly identity:CanonicalIdentityService){}
  @Get()
  @PublicOperation()
  @ApiOperation({operationId:'getCurrentIdentity',summary:'Read current verified Person and membership scope'})
  @ApiOkResponse({schema:meDoc})
  @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  me(@Req() request:FastifyRequest){
    return this.identity.run(request,async identity=>meSchema.parse(identity.me));
  }
  @Get('student/classes')
  @PublicOperation()
  @ApiOperation({operationId:'listMyStudentClasses',summary:'Discover classes through the exact current student Site membership'})
  @ApiOkResponse({schema:{type:'object',additionalProperties:false,required:['kind','classes'],properties:{kind:{type:'string',enum:['student']},classes:{type:'array',items:classDoc}}}})
  @ApiResponse({status:401,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  @ApiResponse({status:403,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  @ApiResponse({status:503,content:{'application/problem+json':{schema:problemOpenApiSchema}}})
  classes(@Req() request:FastifyRequest){
    return this.identity.run(request,async identity=>{
      if (meSchema.parse(identity.me).role !== 'student') throw new ForbiddenException();
      return studentClassesSchema.parse(await identity.readStudentClasses());
    });
  }
}

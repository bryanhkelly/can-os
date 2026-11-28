import { createRequire } from 'node:module';
import { Injectable, ServiceUnavailableException, UnauthorizedException, ForbiddenException, BadRequestException, ConflictException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
export type Identity = {createSite:(input:unknown)=>Promise<unknown>;submitRelease:(input:unknown)=>Promise<unknown>;saveReleasePolicy:(input:unknown)=>Promise<unknown>;decideRelease:(input:unknown)=>Promise<unknown>;publishCourses:(input:unknown)=>Promise<unknown>;approveAssetManifest:(input:unknown)=>Promise<unknown>;publishOffering:(input:unknown)=>Promise<unknown>;me:unknown;readStudentClasses:()=>Promise<unknown>;readLearningResume:(id:string)=>Promise<unknown>;readHomeworkSummary:(id:string)=>Promise<unknown>;selectMembership:(id:string)=>Promise<void>;recordActivity:()=>Promise<void>;completeLesson:(id:string,lessonId:string)=>Promise<unknown>;submitHomework:(id:string,assignmentId:string,responseText:string)=>Promise<unknown>};
type Bridge = {resolveHttpIdentity:(request:Request)=>Promise<Identity>;classifyHttpDomainError:(error:unknown)=>string};

/** Only explicit verified local runtime configuration can enable this adapter. */
@Injectable()
export class CanonicalIdentityService {
  private bridge?: Bridge;
  private enabled = false;
  private writeOrigin:string|null=null;
  configure(enabled:boolean,writeOrigin:string|null=null) { this.enabled=enabled;this.writeOrigin=enabled?writeOrigin:null; }
  private load(): Bridge {
    if (!this.enabled) throw new ServiceUnavailableException();
    if (!this.bridge) {
      try { this.bridge = createRequire(__filename)('./canonical.cjs') as Bridge; }
      catch { throw new ServiceUnavailableException(); }
    }
    return this.bridge;
  }

  async authenticate(request: FastifyRequest, mode:'read'|'write'='read'): Promise<Identity> {
    // No caller-supplied role, account, grant or forwarding headers.
    if(mode==='read' && request.method!=='GET')throw new ForbiddenException();
    if(mode==='write'){
      if(request.method!=='POST')throw new ForbiddenException();
      if(!this.writeOrigin)throw new ServiceUnavailableException();
      if(request.headers.origin!==this.writeOrigin)throw new ForbiddenException();
      if(request.headers['sec-fetch-site']==='cross-site')throw new ForbiddenException();
      const contentType=request.headers['content-type'];
      if(typeof contentType!=='string'||contentType.split(';')[0]?.trim().toLowerCase()!=='application/json')
        throw new UnsupportedMediaTypeException();
    }
    const cookie = request.headers.cookie;
    if (typeof cookie !== 'string' || !cookie) throw new UnauthorizedException();
    const bridge = this.load();
    let identity: Identity;
    try { identity = await bridge.resolveHttpIdentity(new Request((mode==='write'?this.writeOrigin!:'http://127.0.0.1')+'/api/v1/identity', {method:request.method,headers:{cookie,...(mode==='write'?{origin:this.writeOrigin!}:{})}})); }
    catch(error) { throw this.translate(bridge,error); }
    return identity;
  }
  async run<T>(identity: Identity, work: (identity: Identity)=>Promise<T>): Promise<T> {
    const bridge = this.load();
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


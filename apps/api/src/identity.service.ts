import { createRequire } from 'node:module';
import { Injectable, ServiceUnavailableException, UnauthorizedException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
export type Identity = {me:unknown;readStudentClasses:()=>Promise<unknown>};
type Bridge = {resolveHttpIdentity:(request:Request)=>Promise<Identity>;classifyHttpDomainError:(error:unknown)=>string};

/** Only explicit verified local runtime configuration can enable this adapter. */
@Injectable()
export class CanonicalIdentityService {
  private bridge?: Bridge;
  private enabled = false;
  configure(enabled: boolean) { this.enabled = enabled; }
  private load(): Bridge {
    if (!this.enabled) throw new ServiceUnavailableException();
    if (!this.bridge) {
      try { this.bridge = createRequire(__filename)('./canonical.cjs') as Bridge; }
      catch { throw new ServiceUnavailableException(); }
    }
    return this.bridge;
  }

  async authenticate(request: FastifyRequest): Promise<Identity> {
    // No caller-supplied role, account, grant or forwarding headers.
    // This initial adapter supports GET only, with no state changes.
    if (request.method !== 'GET') throw new ForbiddenException();
    const cookie = request.headers.cookie;
    if (typeof cookie !== 'string' || !cookie) throw new UnauthorizedException();
    const bridge = this.load();
    let identity: Identity;
    try { identity = await bridge.resolveHttpIdentity(new Request('http://127.0.0.1/api/v1/identity', {method:'GET',headers:{cookie}})); }
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


import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { CanonicalIdentityService, type Identity } from './identity.service';

const PUBLIC = Symbol('public-operation');
const CANONICAL = Symbol('canonical-read-operation');
export const PublicOperation = () => SetMetadata(PUBLIC, true);
export const CanonicalReadOperation = () => SetMetadata(CANONICAL, true);
const identities = new WeakMap<FastifyRequest, Identity>();
export function verifiedIdentity(request: FastifyRequest): Identity {
  const identity = identities.get(request);
  if (!identity) throw new UnauthorizedException();
  return identity;
}

@Injectable()
export class DefaultDenyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly canonical: CanonicalIdentityService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const publicOperation = this.reflector.getAllAndOverride<boolean>(PUBLIC, targets) === true;
    const canonicalRead = this.reflector.getAllAndOverride<boolean>(CANONICAL, targets) === true;
    if (publicOperation && !canonicalRead) return true;
    if (canonicalRead && !publicOperation) {
      const request = context.switchToHttp().getRequest<FastifyRequest>();
      identities.set(request, await this.canonical.authenticate(request));
      return true;
    }
    throw new UnauthorizedException();
  }
}

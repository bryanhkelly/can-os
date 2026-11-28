import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const PUBLIC = Symbol('public-operation');
export const PublicOperation = () => SetMetadata(PUBLIC, true);

/** No business operations may be exposed until the canonical session adapter is implemented.
 * Never infer an actor, grant or organization from request headers. */
@Injectable()
export class DefaultDenyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()]) === true) return true;
    throw new UnauthorizedException();
  }
}

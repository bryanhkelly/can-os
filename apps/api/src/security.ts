import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { CanonicalIdentityService, type Identity,type Workflow,type WorkflowMode } from './identity.service';

const PUBLIC = Symbol('public-operation');
const CANONICAL = Symbol('canonical-operation');
export const PublicOperation = () => SetMetadata(PUBLIC, true);
export const CanonicalReadOperation = () => SetMetadata(CANONICAL, 'read');
export const CanonicalWriteOperation = () => SetMetadata(CANONICAL, 'write');
export const AnonymousAccessOperation = () => SetMetadata(CANONICAL, 'anonymous-access');
const WORKFLOW=Symbol('governed-workflow');
export const GovernedWorkflowOperation=(mode:WorkflowMode)=>SetMetadata(WORKFLOW,mode);
const workflows=new WeakMap<FastifyRequest,Workflow>();
export function verifiedWorkflow(request:FastifyRequest):Workflow{
 const workflow=workflows.get(request);if(!workflow)throw new UnauthorizedException();return workflow;
}
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
    const mode = this.reflector.getAllAndOverride<'read'|'write'|'anonymous-access'>(CANONICAL, targets);
    const workflow=this.reflector.getAllAndOverride<WorkflowMode>(WORKFLOW,targets);
    if(workflow&&!publicOperation&&!mode){
      const request=context.switchToHttp().getRequest<FastifyRequest>();
      workflows.set(request,await this.canonical.authenticateWorkflow(request,workflow));return true;
    }
    if(workflow)throw new UnauthorizedException();
    if (publicOperation && !mode) return true;
    if(mode==='anonymous-access'&&!publicOperation){
      this.canonical.assertWriteRequest(context.switchToHttp().getRequest<FastifyRequest>());
      return true;
    }
    if ((mode==='read'||mode==='write') && !publicOperation) {
      const request = context.switchToHttp().getRequest<FastifyRequest>();
      identities.set(request, await this.canonical.authenticate(request,mode));
      return true;
    }
    throw new UnauthorizedException();
  }
}

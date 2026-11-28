import { Module } from '@nestjs/common';
import { CanonicalIdentityService } from './identity.service';

/** Shared instance for global guard, bootstrap configuration and domain controllers. */
@Module({ providers: [CanonicalIdentityService], exports: [CanonicalIdentityService] })
export class CanonicalIdentityModule {}

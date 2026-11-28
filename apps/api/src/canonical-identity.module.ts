import { Module } from '@nestjs/common';
import { CanonicalIdentityService } from './identity.service';

/** Shared instance: bootstrap, guards and domain controllers use identical configuration. */
@Module({
  providers: [CanonicalIdentityService],
  exports: [CanonicalIdentityService],
})
export class CanonicalIdentityModule {}

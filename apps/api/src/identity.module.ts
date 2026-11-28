import { Module } from '@nestjs/common';
import { CanonicalIdentityService } from './identity.service';

/** Single shared identity adapter instance, configured during bootstrap.
 * Domain modules import this module; never provide a second adapter.
 */
@Module({providers:[CanonicalIdentityService],exports:[CanonicalIdentityService]})
export class IdentityModule {}

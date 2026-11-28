import { Module } from '@nestjs/common';
import { CanonicalIdentityModule } from './canonical-identity.module';
import { CatalogController } from './catalog.controller';
import { WorkflowController } from './workflow.controller';
import { OfferingReleaseController } from './platform-commands.controller';
import { NoncreditPublicationController } from './noncredit-publication.controller';

/** WS04 owns catalog, Blueprint configuration and review, adoption and release publication.
 * Existing canonical services retain all authorization and mutation authority.
 */
@Module({
  imports: [CanonicalIdentityModule],
  controllers: [
    CatalogController,
    WorkflowController,
    OfferingReleaseController,
    NoncreditPublicationController,
  ],
})
export class ProgramsOfferingsModule {}

import { NativeCourseDraftController } from './native-course-draft.controller';
import { PublisherPackController } from './publisher-pack.controller';
import { CurriculumMarketplaceController } from './curriculum-marketplace.controller';
import { InstructionalTrackAuthoringController } from './instructional-track-authoring.controller';
import { CurriculumAuthoringController } from './curriculum-authoring.controller';
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
    NativeCourseDraftController,
    InstructionalTrackAuthoringController,
    PublisherPackController,
    CurriculumMarketplaceController,
    CurriculumAuthoringController,
    CatalogController,
    WorkflowController,
    OfferingReleaseController,
    NoncreditPublicationController,
  ],
})
export class ProgramsOfferingsModule {}

import { Module } from '@nestjs/common';
import { CanonicalIdentityModule } from './canonical-identity.module';
import {MarketingArtifactsController} from './marketing-artifacts.controller';
import {MarketingPackagesController} from './marketing-packages.controller';
import {EngagementController} from './engagement.controller';
import {SenderAdminController} from './sender-admin.controller';
import {CampaignController} from './campaign.controller';
import {GoLinksController} from './go-links.controller';

/** Owns the engagement HTTP surface; shares the single configured canonical identity provider. */
@Module({
  imports: [CanonicalIdentityModule],
  controllers: [MarketingArtifactsController, MarketingPackagesController, EngagementController, SenderAdminController, CampaignController, GoLinksController],
})
export class EngagementModule {}

import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { healthOpenApiSchema, healthSchema, type Health } from './contracts';
import { DefaultDenyGuard, PublicOperation } from './security';
import {SitesController,OfferingReleaseController} from './platform-commands.controller';
import {CompletionAdminController} from './completion-admin.controller';
import {NoncreditPublicationController} from './noncredit-publication.controller';
import {KnowledgeCheckController} from './knowledge-check.controller';
import {OutcomesController} from './outcomes.controller';
import {SurveysController} from './surveys.controller';
import {MarketingArtifactsController} from './marketing-artifacts.controller';
import {MarketingPackagesController} from './marketing-packages.controller';
import {EngagementController} from './engagement.controller';
import {SenderAdminController} from './sender-admin.controller';
import {CampaignController} from './campaign.controller';
import {AccessController} from './access.controller';
import {LaunchWorkspaceController} from './launch-workspace.controller';
import {CatalogController} from './catalog.controller';
import {PreviewSharesController} from './preview-shares.controller';
import {WebsiteController} from './website.controller';
import {GoLinksController} from './go-links.controller';
import {SitePublishingController} from './site-publishing.controller';
import {SiteProfileController} from './site-profile.controller';
import {BrandController} from './brand.controller';
import {SitePlanningController} from './site-planning.controller';
import {LaunchController} from './launch.controller';
import {RoleWorkspacesController} from './role-workspaces.controller';
import {ReportingController} from './reporting.controller';
import {ClassAdminController} from './class-admin.controller';
import {ParticipationController} from './participation.controller';
import {WorkflowController} from './workflow.controller';
import { IdentityController } from './identity';
import { IdentityModule } from './identity.module';
import { LearningModule } from './learning.module';
import { ProblemFilter } from './problem.filter';

@ApiTags('Platform')
@Controller('health')
export class HealthController {
  @Get('live')
  @PublicOperation()
  @ApiOperation({ operationId: 'getLiveness', summary: 'Process liveness only; not database or pilot readiness' })
  @ApiOkResponse({ schema: healthOpenApiSchema })
  live(): Health { return healthSchema.parse({ status: 'ok' }); }
}

@Module({
  imports: [IdentityModule, LearningModule],
  controllers: [CompletionAdminController, NoncreditPublicationController, KnowledgeCheckController, OutcomesController, SurveysController, MarketingArtifactsController, MarketingPackagesController, EngagementController, SenderAdminController, CampaignController, LaunchWorkspaceController, CatalogController, PreviewSharesController, WebsiteController, GoLinksController, SitePublishingController, SiteProfileController, BrandController, SitePlanningController, LaunchController, RoleWorkspacesController, ReportingController, ClassAdminController, ParticipationController, WorkflowController, AccessController, HealthController, IdentityController, SitesController, OfferingReleaseController],
  providers: [
    { provide: APP_GUARD, useClass: DefaultDenyGuard },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}

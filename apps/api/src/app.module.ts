import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { healthOpenApiSchema, healthSchema, type Health } from './contracts';
import { DefaultDenyGuard, PublicOperation } from './security';
import {SitesController,OfferingReleaseController} from './platform-commands.controller';
import {AccessController} from './access.controller';
import {GoLinksController} from './go-links.controller';
import {SitePublishingController} from './site-publishing.controller';
import {SiteProfileController} from './site-profile.controller';
import {BrandController} from './brand.controller';
import {SitePlanningController} from './site-planning.controller';
import {LaunchController} from './launch.controller';
import {RoleWorkspacesController} from './role-workspaces.controller';
import {ReportingController} from './reporting.controller';
import {ClassAdminController} from './class-admin.controller';
import {RoomController} from './room.controller';
import {ClassroomController} from './classroom.controller';
import {ParticipationController} from './participation.controller';
import {WorkflowController} from './workflow.controller';
import { LearningController } from './learning.controller';
import { IdentityController } from './identity';
import { CanonicalIdentityService } from './identity.service';
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
  controllers: [GoLinksController, SitePublishingController, SiteProfileController, BrandController, SitePlanningController, LaunchController, RoleWorkspacesController, ReportingController, ClassAdminController, RoomController, ClassroomController, ParticipationController, WorkflowController, AccessController, HealthController, IdentityController, LearningController, SitesController, OfferingReleaseController],
  providers: [
    CanonicalIdentityService,
    { provide: APP_GUARD, useClass: DefaultDenyGuard },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}

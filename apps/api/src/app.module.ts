import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { healthOpenApiSchema, healthSchema, type Health } from './contracts';
import { DefaultDenyGuard, PublicOperation } from './security';
import { IdentityController, CanonicalIdentityService } from './identity';
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
  controllers: [HealthController, IdentityController],
  providers: [
    CanonicalIdentityService,
    { provide: APP_GUARD, useClass: DefaultDenyGuard },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}

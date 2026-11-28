import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { z } from 'zod';
import { AppModule } from './app.module';
import { CanonicalIdentityService } from './identity.service';

const configSchema = z.object({
  host: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  canonicalReads: z.enum(['0', '1']).default('0'),
  docs: z.enum(['0', '1']).default('0'),
  environment: z.string().default('development'),
}).superRefine((config, context) => {
  if ((config.docs === '1' || config.canonicalReads === '1') && (config.host !== '127.0.0.1' || config.environment === 'production')) {
    context.addIssue({ code: 'custom', message: 'Swagger and canonical reads are local development only until verified' });
  }
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse({ host: env.API_HOST, port: env.API_PORT, docs: env.API_DOCS, canonicalReads: env.API_CANONICAL_READS, environment: env.NODE_ENV });
}
export async function createApi(config: ReturnType<typeof readConfig>) {
  configSchema.parse(config);
  const adapter = new FastifyAdapter({
    bodyLimit: 1024 * 1024, requestTimeout: 30000, trustProxy: false,
    requestIdHeader: false, genReqId: () => randomUUID(),
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { logger: ['error', 'warn'] });
  app.get(CanonicalIdentityService).configure(config.canonicalReads === '1');
  adapter.getInstance().addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
  });
  app.setGlobalPrefix('api/v1');
  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('Becomuna API').setDescription('Migration proof of concept; canonical reads disabled by default.')
    .setVersion('1.0.0').addCookieAuth('__Host-can_os_session', {type:'apiKey',in:'cookie'}, 'session').build());
  if (config.docs === '1') {
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: '/api/openapi.json', ui: true,
      swaggerOptions: { persistAuthorization: false, supportedSubmitMethods: [] },
    });
  }
  await app.init();
  return { app, document };
}

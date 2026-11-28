import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { z } from 'zod';
import { completePlatformContract } from './platform-contract';
import { AppModule } from './app.module';
import { CanonicalIdentityService } from './identity.service';

const configSchema = z.object({
  host: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  canonicalWrites: z.enum(['0','1']).default('0'),
  canonicalReads: z.enum(['0', '1']).default('0'),
  docs: z.enum(['0', '1']).default('0'),
  environment: z.string().default('development'),
}).superRefine((config, context) => {
  if(config.canonicalWrites==='1' && (config.canonicalReads!=='1'||config.environment!=='test'||config.host!=='127.0.0.1')){
    context.addIssue({code:'custom',message:'Canonical writes require explicit isolated local test mode'});
  }
  if ((config.docs === '1' || config.canonicalReads === '1') && (config.host !== '127.0.0.1' || config.environment === 'production')) {
    context.addIssue({ code: 'custom', message: 'Swagger and canonical reads are local development only until verified' });
  }
});

/** A development flag alone must not turn on business writes against arbitrary data. */
export function assertIsolatedWriteEnvironment(env:NodeJS.ProcessEnv){
  if(env.APP_ENV!=='test'||env.NODE_ENV!=='test'||env.CAN_TEST_DB_WRITES_ENABLED!=='true'||
    env.CAN_PILOT_QA_BRANCH_ID!=='br-solitary-art-arun91gj'||!env.TEST_DATABASE_URL||
    env.DATABASE_URL!==env.TEST_DATABASE_URL||!env.CAN_CANONICAL_AUTH_DATABASE_URL||
    env.CAN_CANONICAL_AUTH_DATABASE_URL===env.DATABASE_URL||!env.CAN_ACCESS_MAIL_OUTBOX_DIR||
    env.CAN_ACCESS_PUBLIC_ORIGIN!=='https://app.can-os.test'||env.CAN_DEMO_FIXED_ACCESS_ENABLED!=='false'||
    env.RESEND_API_KEY||env.GLOO_API_KEY)
      throw new Error('Canonical writes require the reviewed isolated QA environment');
}
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  if(env.API_CANONICAL_WRITES==='1')assertIsolatedWriteEnvironment(env);
  return configSchema.parse({ host: env.API_HOST, port: env.API_PORT, docs: env.API_DOCS, canonicalReads: env.API_CANONICAL_READS, canonicalWrites:env.API_CANONICAL_WRITES, environment: env.NODE_ENV });
}
export async function createApi(config: ReturnType<typeof readConfig>) {
  configSchema.parse(config);
  if(config.canonicalWrites==='1')assertIsolatedWriteEnvironment(process.env);
  const adapter = new FastifyAdapter({
    bodyLimit: 1024 * 1024, requestTimeout: 30000, connectionTimeout: 65000,
    keepAliveTimeout: 5000, trustProxy: false,
    requestIdHeader: false, genReqId: () => randomUUID(),
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { logger: ['error', 'warn'] });
  app.get(CanonicalIdentityService).configure(config.canonicalReads === '1', config.canonicalWrites==='1'?'http://localhost:'+config.port:null);
  adapter.getInstance().addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Frame-Options', 'DENY');
  });
  app.setGlobalPrefix('api/v1');
  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('Becomuna API').setDescription('Migration proof of concept; canonical reads disabled by default.')
    .setVersion('1.0.0').addCookieAuth('__Host-can_os_session', {type:'apiKey',in:'cookie'}, 'session').addCookieAuth('__Host-can_os_v3_session',{type:'apiKey',in:'cookie'},'nativeSession').build());
  completePlatformContract(document);
  if (config.docs === '1') {
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: '/api/openapi.json', ui: true,
      swaggerOptions: { persistAuthorization: false, supportedSubmitMethods: [] },
    });
  }
  await app.init();
  return { app, document };
}

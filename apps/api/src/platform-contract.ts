import type { OpenAPIObject } from '@nestjs/swagger';
import { problemOpenApiSchema } from './contracts';

const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
const transportProblems = {
  400: 'Malformed or invalid request',
  413: 'Request body exceeds the configured size limit',
  415: 'Unsupported request content type',
  500: 'Unexpected internal fault',
} as const;

export function completePlatformContract(document: OpenAPIObject): void {
  for (const path of Object.values(document.paths)) {
    for (const method of methods) {
      const operation = path[method];
      if (!operation) continue;
      const statuses = method === 'post' || method === 'put' || method === 'patch'
        ? [400, 413, 415, 500] as const : [500] as const;
      for (const status of statuses) {
        operation.responses[status] ??= {
          description: transportProblems[status],
          content: { 'application/problem+json': { schema: problemOpenApiSchema } },
        };
      }
      for (const response of Object.values(operation.responses)) {
        if ('$ref' in response) continue;
        response.headers ??= {};
        response.headers['X-Request-Id'] ??= {
          description: 'Server-generated correlation identifier (not supplied by the caller)',
          schema: { type: 'string', format: 'uuid' },
        };
        response.headers['Cache-Control'] ??= {
          description: 'API responses are not cacheable',
          schema: { type: 'string', enum: ['no-store'] },
        };
      }
    }
  }
}

import type { FastifyReply, FastifyRequest } from 'fastify';

/** Fixed fields only: never log raw URL, query, headers, cookies or payload. */
export function requestSummary(request: FastifyRequest, reply: FastifyReply) {
  return {
    event: 'api.http.completed',
    requestId: request.id,
    method: request.method,
    route: request.routeOptions.url ?? 'unmatched',
    status: reply.statusCode,
    durationMs: Math.round(reply.elapsedTime),
  };
}

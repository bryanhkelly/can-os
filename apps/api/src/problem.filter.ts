import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

const publicErrors: Record<number, [string, string]> = {
  400: ['Bad Request', 'VALIDATION_FAILED'], 401: ['Unauthorized', 'AUTHENTICATION_REQUIRED'],
  403: ['Forbidden', 'FORBIDDEN'], 404: ['Not Found', 'NOT_FOUND'],
  405: ['Method Not Allowed', 'METHOD_NOT_ALLOWED'], 409: ['Conflict', 'CONFLICT'],
  413: ['Payload Too Large', 'PAYLOAD_TOO_LARGE'], 415: ['Unsupported Media Type', 'UNSUPPORTED_MEDIA_TYPE'],
  422: ['Unprocessable Content', 'VALIDATION_FAILED'], 429: ['Too Many Requests', 'RATE_LIMITED'],
  503: ['Service Unavailable', 'UNAVAILABLE'],
};
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const [title, code] = publicErrors[status] ?? ['Internal Server Error', 'UNEXPECTED'];
    const safeStatus = publicErrors[status] ? status : 500;
    // Do not log headers, payloads, credentials or raw exception messages.
    if (safeStatus >= 500) this.logger.error({ requestId: request.id, status: safeStatus, code });
    reply.header('Cache-Control', 'no-store').type('application/problem+json').status(safeStatus).send({
      type: 'about:blank', title, status: safeStatus, code, requestId: request.id,
    });
  }
}

import { z } from 'zod';

export const healthSchema = z.object({ status: z.literal('ok') }).strict();
export type Health = z.infer<typeof healthSchema>;
export const healthOpenApiSchema = {
  type: 'object' as const, additionalProperties: false,
  required: ['status'], properties: { status: { type: 'string' as const, enum: ['ok'] } },
};

export const problemOpenApiSchema = {
  type: 'object' as const, additionalProperties: false,
  required: ['type', 'title', 'status', 'code', 'requestId'],
  properties: {
    type: { type: 'string' as const }, title: { type: 'string' as const },
    status: { type: 'integer' as const }, code: { type: 'string' as const },
    requestId: { type: 'string' as const },
  },
};

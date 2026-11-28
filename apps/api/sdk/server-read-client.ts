import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';
import { createServerReadFetch } from './server-read-transport.mjs';

/** Server-only, per incoming request. origin must be trusted deployment config,
 * never a client-provided host. Do not place the client in a shared singleton. */
export function createServerReadApiClient(origin: string, incomingRequest: Request) {
  if (typeof window !== 'undefined') throw new Error('Server read SDK is server-only');
  const client = createClient<paths>({ baseUrl: origin, fetch: createServerReadFetch(origin, incomingRequest) });
  return { GET: client.GET.bind(client) } as Pick<typeof client, 'GET'>;
}

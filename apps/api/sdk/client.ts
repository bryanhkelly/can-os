import createClient from 'openapi-fetch';
import type {paths} from './generated/schema';
import {createSameOriginFetch} from './transport.mjs';

/** The app must serve /api/v1 on the same browser origin via reviewed ingress.
 * There is no RPC fallback, bearer-token storage, or automatic mutation replay.
 * Node/SSR callers need their own explicit server transport and authentication.
 */
export function createBrowserApiClient(){
 if(typeof window==='undefined')throw new Error('Browser API client requires browser origin');
 const origin=window.location.origin;
 return createClient<paths>({baseUrl:origin,fetch:createSameOriginFetch(origin)});
}
export type BecomunaBrowserApi=ReturnType<typeof createBrowserApiClient>;
export type {paths} from './generated/schema';

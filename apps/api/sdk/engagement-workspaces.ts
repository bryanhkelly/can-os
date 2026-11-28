import type {BecomunaBrowserApi} from './client';
import {createEngagementApi} from './engagement-api';
/** Compose once per mounted application/session transport boundary.
 * Nested components use the same selected transport; no fallback or replay. */
export function createNestEngagementWorkspaces(client:BecomunaBrowserApi){
 const api=createEngagementApi(client);
 const go={kind:'nest' as const,api};
 const campaign={kind:'nest' as const,api};
 const engagement={kind:'nest' as const,api,go,campaign};
 const marketing={kind:'nest' as const,api,engagement};
 const sender={kind:'nest' as const,api};
 return {go,campaign,engagement,marketing,sender};
}

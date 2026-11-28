import type {BecomunaBrowserApi,paths} from './client';
import {requireApiReceipt as receipt,type QueryOf,type JsonBodyOf} from './operation';
type Owner={kind:'platform';organizationId?:never}|{kind:'organization';organizationId:string};
function ownerQuery(owner:Owner){return owner.kind==='platform'?{ownerKind:'platform' as const}:{ownerKind:'organization' as const,organizationId:owner.organizationId};}
/** Explicit typed operations; no generic RPC dispatch, retry or fallback. */
export function createEngagementRegistryApi(client:BecomunaBrowserApi){
 return {
  createEngagementDefinition:async({data}:{data:JsonBodyOf<paths['/api/v1/engagement-definitions']['post']>})=>receipt(await client.POST('/api/v1/engagement-definitions',{body:data})),
  createEngagementGoLink:async({data}:{data:JsonBodyOf<paths['/api/v1/engagement-go-links']['post']>})=>receipt(await client.POST('/api/v1/engagement-go-links',{body:data})),
  listEngagementGoLinks:async({data}:{data:QueryOf<paths['/api/v1/engagement-go-links']['get']>})=>receipt(await client.GET('/api/v1/engagement-go-links',{params:{query:data}})),
  retireEngagementDefinition:async({data}:{data:JsonBodyOf<paths['/api/v1/engagement-retirements']['post']>})=>receipt(await client.POST('/api/v1/engagement-retirements',{body:data})),
  revokeEngagementGoLink:async({data}:{data:JsonBodyOf<paths['/api/v1/engagement-go-link-revocations']['post']>})=>receipt(await client.POST('/api/v1/engagement-go-link-revocations',{body:data})),
  listSiteEngagementDefinitions:async({data}:{data:QueryOf<paths['/api/v1/site-engagement-definitions']['get']>})=>receipt(await client.GET('/api/v1/site-engagement-definitions',{params:{query:data}})),
  listOwnerEngagementDestinations:async({data:{owner,...data}}:{data:Omit<QueryOf<paths['/api/v1/engagement-owner-destinations']['get']>,'ownerKind'|'organizationId'>&{owner:Owner}})=>receipt(await client.GET('/api/v1/engagement-owner-destinations',{params:{query:{...data,...ownerQuery(owner)}}})),
  listOwnerEngagementDefinitions:async({data:{owner,...data}}:{data:Omit<QueryOf<paths['/api/v1/owner-engagement-definitions']['get']>,'ownerKind'|'organizationId'>&{owner:Owner}})=>receipt(await client.GET('/api/v1/owner-engagement-definitions',{params:{query:{...data,...ownerQuery(owner)}}})),
 };
}

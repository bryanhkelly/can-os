import type {BecomunaBrowserApi,paths} from './client';
import {requireApiReceipt as receipt,type QueryOf,type JsonBodyOf} from './operation';
/** Explicit typed operations; no generic RPC dispatch, retry or fallback. */
export function createGoLinkApi(client:BecomunaBrowserApi){
 return {
  createSiteGoLink:async({data:{siteId,...data}}:{data:JsonBodyOf<paths['/api/v1/sites/{siteId}/go-links']['post']>&{siteId:string}})=>receipt(await client.POST('/api/v1/sites/{siteId}/go-links',{params:{path:{siteId}},body:data})),
  listSiteGoLinksPage:async({data:{siteId,...data}}:{data:QueryOf<paths['/api/v1/sites/{siteId}/go-links']['get']>&{siteId:string}})=>receipt(await client.GET('/api/v1/sites/{siteId}/go-links',{params:{path:{siteId},query:data}})),
  listAvailableGoDestinations:async({data:{siteId,...data}}:{data:QueryOf<paths['/api/v1/sites/{siteId}/go-link-destinations']['get']>&{siteId:string}})=>receipt(await client.GET('/api/v1/sites/{siteId}/go-link-destinations',{params:{path:{siteId},query:data}})),
  inspectSavedGoLink:async({data:{siteId,linkId,...data}}:{data:QueryOf<paths['/api/v1/sites/{siteId}/go-links/{linkId}/inspection']['get']>&{siteId:string;linkId:string}})=>receipt(await client.GET('/api/v1/sites/{siteId}/go-links/{linkId}/inspection',{params:{path:{siteId,linkId},query:data}})),
  setSiteGoLinkPaused:async({data:{siteId,linkId,...data}}:{data:JsonBodyOf<paths['/api/v1/sites/{siteId}/go-links/{linkId}/status']['post']>&{siteId:string;linkId:string}})=>receipt(await client.POST('/api/v1/sites/{siteId}/go-links/{linkId}/status',{params:{path:{siteId,linkId}},body:data})),
  revokeSiteGoLink:async({data:{siteId,linkId,...data}}:{data:JsonBodyOf<paths['/api/v1/sites/{siteId}/go-links/{linkId}/revocation']['post']>&{siteId:string;linkId:string}})=>receipt(await client.POST('/api/v1/sites/{siteId}/go-links/{linkId}/revocation',{params:{path:{siteId,linkId}},body:data})),
 };
}

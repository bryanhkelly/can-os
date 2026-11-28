import type {BecomunaBrowserApi,paths} from './client';
import {requireApiReceipt as receipt,type QueryOf,type JsonBodyOf} from './operation';
/** Explicit typed operations; no generic RPC dispatch, retry or fallback. */
export function createMarketingPackageApi(client:BecomunaBrowserApi){
 return {
  readSiteMarketingSuggestionsV61:async({data}:{data:QueryOf<paths['/api/v1/site-marketing-suggestions']['get']>})=>receipt(await client.GET('/api/v1/site-marketing-suggestions',{params:{query:data}})),
  listSiteMarketingPackagesPageV61:async({data}:{data:QueryOf<paths['/api/v1/site-marketing-packages']['get']>})=>receipt(await client.GET('/api/v1/site-marketing-packages',{params:{query:data}})),
  createSiteMarketingPackageV61:async({data}:{data:JsonBodyOf<paths['/api/v1/site-marketing-packages']['post']>})=>receipt(await client.POST('/api/v1/site-marketing-packages',{body:data})),
  saveSiteMarketingPackageV61:async({data}:{data:JsonBodyOf<paths['/api/v1/site-marketing-package-revisions']['post']>})=>receipt(await client.POST('/api/v1/site-marketing-package-revisions',{body:data})),
  duplicateSiteMarketingPackageV61:async({data}:{data:JsonBodyOf<paths['/api/v1/site-marketing-package-copies']['post']>})=>receipt(await client.POST('/api/v1/site-marketing-package-copies',{body:data})),
  archiveSiteMarketingPackageV61:async({data}:{data:JsonBodyOf<paths['/api/v1/site-marketing-package-status']['post']>})=>receipt(await client.POST('/api/v1/site-marketing-package-status',{body:data})),
  selectSiteMarketingPackageBrandV61:async({data}:{data:JsonBodyOf<paths['/api/v1/site-marketing-package-brand']['post']>})=>receipt(await client.POST('/api/v1/site-marketing-package-brand',{body:data})),
  deleteSiteMarketingPackageV61:async({data}:{data:JsonBodyOf<paths['/api/v1/site-marketing-package-deletions']['post']>})=>receipt(await client.POST('/api/v1/site-marketing-package-deletions',{body:data})),
 };
}

import type {BecomunaBrowserApi,paths} from './client';
import {requireApiReceipt as receipt,type QueryOf,type JsonBodyOf} from './operation';
/** Explicit typed operations; no generic RPC dispatch, retry or fallback. */
export function createMarketingArtifactApi(client:BecomunaBrowserApi){
 return {
  previewSiteMarketingArtifact:async({data}:{data:JsonBodyOf<paths['/api/v1/site-marketing-artifact-previews']['post']>})=>receipt(await client.POST('/api/v1/site-marketing-artifact-previews',{body:data})),
  createSiteMarketingPackageRelease:async({data}:{data:JsonBodyOf<paths['/api/v1/site-marketing-package-releases']['post']>})=>receipt(await client.POST('/api/v1/site-marketing-package-releases',{body:data})),
  listSiteMarketingPackageReleases:async({data}:{data:QueryOf<paths['/api/v1/site-marketing-package-releases']['get']>})=>receipt(await client.GET('/api/v1/site-marketing-package-releases',{params:{query:data}})),
  listSiteMarketingReleases:async({data}:{data:QueryOf<paths['/api/v1/site-marketing-artifact-releases']['get']>})=>receipt(await client.GET('/api/v1/site-marketing-artifact-releases',{params:{query:data}})),
  getSiteMarketingReleaseOutput:async({data}:{data:QueryOf<paths['/api/v1/site-marketing-artifact-output']['get']>})=>receipt(await client.GET('/api/v1/site-marketing-artifact-output',{params:{query:data}})),
  withdrawSiteMarketingRelease:async({data}:{data:JsonBodyOf<paths['/api/v1/site-marketing-artifact-withdrawals']['post']>})=>receipt(await client.POST('/api/v1/site-marketing-artifact-withdrawals',{body:data})),
 };
}

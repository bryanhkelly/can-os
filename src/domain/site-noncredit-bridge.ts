/** Transitional cross-schema reader permission check.
 * Both read paths use the SAME platform Site UUID; no identity bridge.
 * Configured credentials never substitute for effective SQL permissions. */
export type SiteNoncreditPreflight={
  sitesReady:boolean;
  releasesReady:boolean;
  publicSchema:boolean;
  nativeSchema:boolean;
  siteRead:boolean;
  nativeSiteRead:boolean;
  releaseRead:boolean;
};
export function siteCatalogReaderAccessible(value:SiteNoncreditPreflight):boolean{
  return value.sitesReady&&value.releasesReady&&value.publicSchema&&
    value.nativeSchema&&value.siteRead&&value.nativeSiteRead&&value.releaseRead;
}

/** Transitional permission check for noncredit public catalog reads.
 * The platform and native enrollment reader both consume the SAME Site UUID.
 * There is no identity crosswalk or second Site identity authorization.
 */
export type SiteNoncreditPreflight={
  sitesReady:boolean;
  releasesReady:boolean;
  publicSchema:boolean;
  nativeSchema:boolean;
  siteRead:boolean;
  releaseRead:boolean;
};
export function siteCatalogReaderAccessible(value:SiteNoncreditPreflight):boolean{
  return value.sitesReady&&value.releasesReady&&value.publicSchema&&
    value.nativeSchema&&value.siteRead&&value.releaseRead;
}

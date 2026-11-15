/** Pure, testable contract for the Site-to-canonical enrollment DB reader.
 * A configured URL or a table existing is not proof of query authority.
 */
export type SiteNoncreditPreflight={
  mappingReady:boolean;
  releasesReady:boolean;
  publicSchema:boolean;
  nativeSchema:boolean;
  mappingRead:boolean;
  releaseRead:boolean;
};
export function siteCatalogReaderAccessible(value:SiteNoncreditPreflight):boolean{
  return value.mappingReady&&value.releasesReady&&value.publicSchema&&
    value.nativeSchema&&value.mappingRead&&value.releaseRead;
}

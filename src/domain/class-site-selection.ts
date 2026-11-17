/** Select only a Site explicitly present in the currently authorized Course
 * adoption's local Site options and compatible with its delivery policy.
 * URL siteId is a preference, never a permission or a fallback to a random Site.
 */
export function selectAuthorizedClassSite(
  sites:readonly {id:string;allowedDeliveryModes:readonly string[]}[],
  siteId:string|null|undefined,
  mode:string,
):string {
  if (!siteId) return "";
  return sites.some(site=>site.id===siteId && site.allowedDeliveryModes.includes(mode))
    ?siteId:"";
}

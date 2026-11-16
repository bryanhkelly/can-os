/** Exact, approved Site identity correspondence is required before displaying
 * native Class data from Launch Studio. This does not grant Class authority. */
export type SiteClassLink={status:string;canonicalSiteId:string}|null;
export type SiteClassLinkState={kind:"unlinked"|"pending"|"blocked"}|{kind:"approved";canonicalSiteId:string};
export function resolveSiteClassLink(link:SiteClassLink):SiteClassLinkState {
 if(!link)return {kind:"unlinked"};
 if(link.status==="pending")return {kind:"pending"};
 if(link.status!=="approved"||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(link.canonicalSiteId))
   return {kind:"blocked"};
 return {kind:"approved",canonicalSiteId:link.canonicalSiteId};
}

/** Only inputs already returned by the authorized HQ workspace are accepted.
 * Affiliation is an institutional relationship, not a participation or reporting grant.
 * Distinct Sites/organizations are counted independently from request records.
 */
export function summarizeNetworkOperations(
  sites:readonly {id:string}[],
  affiliations:readonly {id:string;siteId:string;siteOrganizationId:string;status:string}[],
){
  const approved=affiliations.filter(entry=>entry.status==="approved");
  return {
    ownedSites:new Set(sites.map(site=>site.id)).size,
    approvedSites:new Set(approved.map(entry=>entry.siteId)).size,
    pendingRequests:new Set(affiliations.filter(entry=>entry.status==="pending").map(entry=>entry.id)).size,
    affiliatedOrganizations:new Set(approved.map(entry=>entry.siteOrganizationId)).size,
  };
}

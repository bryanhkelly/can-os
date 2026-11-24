/**
 * WS6 network reporting authorization policy. This is a PURE eligibility
 * evaluator only. Callers must load grants from the canonical database using
 * a verified network-admin identity, not browser input, and recheck the grants
 * for each request. A membership is never a reporting grant.
 *
 * Until the network principal bridge and disclosure approvals exist, DO NOT
 * expose network-wide queries from the application.
 */
export type NetworkReportGrant={
  id:string;
  networkOrganizationId:string;
  hostOrganizationId:string;
  allowedMetrics:readonly string[];
  validFrom:string;
  validThrough:string|null;
  revokedAt:string|null;
  evidenceVersionId:string;
};
export type VerifiedNetworkReader={
  networkOrganizationId:string;
  actorPersonId:string;
  currentNetworkReportCapability:boolean;
};
export type NetworkReportRequest={
  hostOrganizationIds:readonly string[];
  metricKeys:readonly string[];
  asOf:string;
};
function validDate(value:string):number{
  const stamp=Date.parse(value);
  if(!Number.isFinite(stamp))throw new Error("Invalid effective-dated reporting timestamp");
  return stamp;
}
export function authorizeNetworkMetricScope(
  reader:VerifiedNetworkReader,
  grants:readonly NetworkReportGrant[],
  request:NetworkReportRequest,
  now=new Date(),
):{hostOrganizationIds:string[];metricKeys:string[];grantIds:string[]}{
  if(!reader.actorPersonId||!reader.networkOrganizationId||
     !reader.currentNetworkReportCapability)
    throw new Error("Independent verified network reporting principal required");
  if(!request.hostOrganizationIds.length||!request.metricKeys.length)
    throw new Error("Explicit report host and metric scope required");
  if(new Set(request.hostOrganizationIds).size!==request.hostOrganizationIds.length||
     new Set(request.metricKeys).size!==request.metricKeys.length)
    throw new Error("Duplicate host or metric scope");
  const at=validDate(request.asOf);
  // A historical reporting period must never revive a permission that has
  // since expired or been revoked. Authorization is checked at request time
  // as well as against the requested evidence period.
  const current=now.getTime();
  if(!Number.isFinite(current)||at>current)throw new Error("Valid current reporting time required");
  const granted:string[]=[];
  for(const host of request.hostOrganizationIds){
    if(!host)throw new Error("Verified host Organization required");
    const authorized=grants.filter(g=>g.networkOrganizationId===reader.networkOrganizationId&&
      g.hostOrganizationId===host&&g.id&&g.evidenceVersionId&&
      validDate(g.validFrom)<=at&&validDate(g.validFrom)<=current&&
      (g.validThrough===null||(validDate(g.validThrough)>at&&validDate(g.validThrough)>current))&&
      g.revokedAt===null);
    for(const metric of request.metricKeys){
      if(!metric||!authorized.some(g=>g.allowedMetrics.includes(metric)))
        throw new Error("Current host-by-metric reporting grant missing");
    }
    granted.push(...authorized.filter(g=>request.metricKeys.some(m=>g.allowedMetrics.includes(m))).map(g=>g.id));
  }
  return {
    hostOrganizationIds:[...request.hostOrganizationIds],
    metricKeys:[...request.metricKeys],
    grantIds:[...new Set(granted)].sort(),
  };
}
export type PublicationDisclosureApproval={
  approvalId:string;
  approvedAt:string;
  expiresAt:string;
  queryScopeDigest:string;
  approvedAudience:string;
  suppressSmallCells:boolean;
  reviewedOverlappingCuts:boolean;
  reviewedHistoricalDifferencing:boolean;
};
/** Private provider metrics are not automatically publishable. A trusted
 * governance service must supply a pre-approved disclosure artifact pinned
 * to an exact query digest and audience; never accept browser-supplied approval.
 * Report asOf is an evidence-period selector, NOT the publication clock.
 * Only a trusted server may supply the optional clock for deterministic tests.
 */
export function assertPublishedReportDisclosure(
  approval:PublicationDisclosureApproval|null,
  request:{scopeDigest:string;audience:string;asOf:string},
  now=new Date(),
):void{
  validDate(request.asOf);
  const current=now.getTime();
  if(!Number.isFinite(current))throw new Error("Valid current publication time required");
  if(!approval||!approval.approvalId||!approval.queryScopeDigest||!request.audience||
    approval.queryScopeDigest!==request.scopeDigest||
    approval.approvedAudience!==request.audience||
    validDate(approval.approvedAt)>current||
    validDate(approval.expiresAt)<=current||
    !approval.suppressSmallCells||
    !approval.reviewedOverlappingCuts||
    !approval.reviewedHistoricalDifferencing)
    throw new Error("Approved scoped disclosure review required before publication");
}

/** Future report readers must authorize the entire requested window, not
 * merely its end. Unit/metric allowlists and evidence verification are
 * supplied only by trusted server policy. No endpoint accepts them from clients.
 * This is deliberately not an execution grant.
 */
export function authorizeNetworkReportPeriod(
  reader:VerifiedNetworkReader,
  verifiedGrants:readonly NetworkReportGrant[],
  request:{hostOrganizationIds:readonly string[];metricKeys:readonly string[];from:string;to:string;unitId:string|null},
  policy:{networkOrganizationId:string;actorPersonId:string;allowedMetricKeys:readonly string[];
    scopes:readonly {unitId:string|null;hostOrganizationIds:readonly string[]}[]},
  now=new Date(),
){
  const from=validDate(request.from),to=validDate(request.to),current=now.getTime();
  if(!Number.isFinite(current)||from>=to||to>current||to-from>366*86400000)
    throw new Error("Closed network report window of up to 366 days required");
  if(request.hostOrganizationIds.length>1000||request.metricKeys.length>50)
    throw new Error("Network report exceeds bounded host or metric scope");
  if(request.metricKeys.some(key=>!policy.allowedMetricKeys.includes(key)))
    throw new Error("Metric is not approved for network reporting");
  if(policy.networkOrganizationId!==reader.networkOrganizationId||policy.actorPersonId!==reader.actorPersonId)
    throw new Error("Trusted network reporting scope does not match reader");
  const scopes=policy.scopes.filter(scope=>scope.unitId===request.unitId);
  if(scopes.length!==1||request.hostOrganizationIds.some(host=>!scopes[0]!.hostOrganizationIds.includes(host)))
    throw new Error("Explicit authorized network reporting unit and host scope required");
  const covering=verifiedGrants.filter(grant=>validDate(grant.validFrom)<=from&&
    (grant.validThrough===null||validDate(grant.validThrough)>=to));
  return {...authorizeNetworkMetricScope(reader,covering,{
    hostOrganizationIds:request.hostOrganizationIds,metricKeys:request.metricKeys,asOf:request.from,
  },now),from:request.from,to:request.to,unitId:request.unitId};
}

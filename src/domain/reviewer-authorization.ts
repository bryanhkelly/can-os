import type { CommandContext } from "./command-context";
type Role={personId:string;organizationId:string|null;siteId:string|null;programId:string|null;capabilities:string[]};
type Member={personId:string;organizationId:string};
/** Membership and target-resource intersections must agree on the same organization;
 * a shared site or program identifier never independently grants cross-tenant access.
 */
export function reviewerCanVerify(args:{context:CommandContext;subjectPersonId:string;actorRoles:Role[];subjectRoles:Role[];actorMemberships:Member[];subjectMemberships:Member[]}):boolean {
 const {context,subjectPersonId,actorRoles,subjectRoles,actorMemberships,subjectMemberships}=args;
 if(!context.actorPersonId||context.actorPersonId===subjectPersonId||!context.capabilities.has("profiles.credentials.verify"))return false;
 return actorRoles.some(a=>{
  if(a.personId!==context.actorPersonId||!a.organizationId||!a.capabilities.includes("profiles.credentials.verify"))return false;
  if(!context.scope.organizationIds?.includes(a.organizationId))return false;
  if(a.siteId&&!context.scope.siteIds?.includes(a.siteId))return false;
  if(a.programId&&!context.scope.programIds?.includes(a.programId))return false;
  if(!actorMemberships.some(m=>m.personId===context.actorPersonId&&m.organizationId===a.organizationId))return false;
  const subjectMember=subjectMemberships.some(m=>m.personId===subjectPersonId&&m.organizationId===a.organizationId);
  const subjectRole=subjectRoles.some(s=>s.personId===subjectPersonId&&s.organizationId===a.organizationId&&(!a.siteId||s.siteId===a.siteId)&&(!a.programId||s.programId===a.programId));
  return a.siteId||a.programId?subjectRole:subjectMember||subjectRole;
 });
}

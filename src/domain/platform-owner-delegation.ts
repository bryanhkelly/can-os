/** One source of truth for delegated production sessions.
 * Impersonation cannot produce independent attestations or privileged review.
 */
import { roleCapabilities } from "./access-context";

export const protectedOwnerActRoles = [
  "account_holder", "student", "guardian",
  "academic_content_reviewer",
  "deployment_readiness_reviewer",
  "can_credential_reviewer",
  "can_jurisdiction_reviewer",
  "can_network_steward",
  "app_admin",
  "platform_owner",
  "network_admin",
  "reporting_relationship_manager",
  "safeguarding_responder",
  "safeguarding_lead",
] as const;
export const ownerDelegationLifetimeMs = 15 * 60 * 1000;
export function platformOwnerMayActAs(role:string):boolean {
  return Object.hasOwn(roleCapabilities,role) && !protectedOwnerActRoles.some(protectedRole=>protectedRole===role);
}
export function platformOwnerDelegationIsCurrent(until:Date|null,now:Date=new Date()):boolean {
  return until!==null && until.getTime()>now.getTime();
}

/** Synthetic rehearsal is a bounded extension of the same owner delegation,
 * not authority to impersonate real families or attest independent consent.
 * The caller must establish the synthetic Person and exact Site from live
 * database evidence; an email suffix alone is never sufficient. */
export function platformOwnerMayActAsTarget(role:string, syntheticSitePerson:boolean):boolean {
  return platformOwnerMayActAs(role) ||
    (syntheticSitePerson && (role==="student" || role==="guardian"));
}

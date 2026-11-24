/** One source of truth for delegated production sessions.
 * Impersonation cannot produce independent attestations or privileged review.
 */
import { roleCapabilities } from "./access-context";

export const protectedOwnerActRoles = [
  "account_holder", "student", "guardian",
  "academic_content_reviewer",
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

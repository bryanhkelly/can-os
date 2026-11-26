import { roleCapabilities } from "./access-context";
import { hasValidAccessGrantScope } from "./access-grant-scope";
import { platformOwnerMayActAs } from "./platform-owner-delegation";

/** Account possession is not mailbox ownership or an independent attestation.
 * Personal and ordinary operational roles may use an individual credential.
 * Protected institutional roles still require their separate identity evidence. */
export function privateAccountRoleEligible(role: string): boolean {
  return Object.hasOwn(roleCapabilities, role) &&
    (["account_holder", "student", "guardian"].includes(role) || platformOwnerMayActAs(role));
}

export function privateAccountGrantEligible(grant: {
  accountId:string; personId:string; accountPersonId:string|null;
  email:string; active:boolean; role:string;
  organizationId:string|null; siteId:string|null;
}, accountId:string, email:string): boolean {
  return grant.active && grant.accountId===accountId &&
    !!grant.accountPersonId && grant.personId===grant.accountPersonId &&
    grant.email===email.trim().toLowerCase() &&
    hasValidAccessGrantScope(grant) && privateAccountRoleEligible(grant.role);
}

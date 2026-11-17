import { AuthorizationError } from "./command-context";
import type { VerifiedAccessGrant } from "./access-context";

/**
 * A real CAN login owns exactly one immutable Person, regardless of the
 * selected personal, guardian, staff, Site or network grant.
 * Demo identity switching remains a separate, explicit test-only exception.
 *
 * Re-run inside the membership-selection transaction. Client-side Site and
 * favorite selections are never authorization evidence.
 */
export function assertMembershipSwitchIdentity(input: {
  accountId: string;
  accountPersonId: string | null;
  targetGrantId: string;
  grants: readonly VerifiedAccessGrant[];
  activePersonIds: readonly string[];
  demoAccountSwitching: boolean;
}): VerifiedAccessGrant {
  const {accountId,accountPersonId,targetGrantId,grants,activePersonIds,demoAccountSwitching}=input;
  const grant=grants.find(row=>row.id===targetGrantId&&row.active);
  if(!grant)throw new AuthorizationError("active membership");
  if(demoAccountSwitching)return grant;
  if(grant.accountId!==accountId || !accountPersonId ||
     grant.personId!==accountPersonId ||
     activePersonIds.length===0 ||
     activePersonIds.some(personId=>personId!==accountPersonId)) {
    throw new AuthorizationError("one account Person across workspaces");
  }
  return grant;
}

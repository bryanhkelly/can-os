import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { selectAccessGrant, recordMeaningfulSessionActivity } from "./passwordless-access.server";

/** Use the verified session owner, never a request-supplied Account or Person. */
export function recordCurrentSessionActivity(actor:AccessContext){
  return recordMeaningfulSessionActivity(actor.sessionId,actor.impersonatedByAccountId??actor.sessionAccountId??actor.accountId);
}

/** Membership changes cannot be used as an impersonation mechanism. */
export function selectCurrentSessionMembership(actor:AccessContext,grantId:string){
  if(actor.delegatedByPlatformOwner)throw new AuthorizationError("Return to Platform Owner before changing memberships");
  return selectAccessGrant(actor.sessionId,actor.impersonatedByAccountId??actor.sessionAccountId??actor.accountId,grantId);
}

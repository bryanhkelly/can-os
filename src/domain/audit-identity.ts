/** Only server-resolved session identity may provide these audit fields. */
export const reservedAuditIdentityKeys = [
  "accountId","effectiveAccountId","sessionAccountId","impersonatedByAccountId",
  "sessionId","grantId","selectedGrantId","role","requestId",
  "delegatedByDemoAdmin","delegatedByPlatformOwner","delegationMode","delegationExpiresAt",
] as const;

type AuditIdentity = {
  accountId?:string; sessionAccountId?:string; impersonatedByAccountId?:string;
  sessionId?:string; grantId?:string; role?:string;
  delegatedByPlatformOwner?:true; delegationMode?:"view"|"act"; delegationExpiresAt?:string;
};

/** Distinguish production owner delegation from synthetic demo switching.
 * Caller-supplied payloads never participate in determining attribution. */
export function auditDelegation(actor:AuditIdentity):Record<string,unknown>{
  if(!actor.impersonatedByAccountId)return {};
  return {
    effectiveAccountId:actor.accountId,
    sessionAccountId:actor.impersonatedByAccountId,
    sessionId:actor.sessionId,
    selectedGrantId:actor.grantId,
    ...(actor.delegatedByPlatformOwner?{
      delegatedByPlatformOwner:true,
      delegationMode:actor.delegationMode,
      delegationExpiresAt:actor.delegationExpiresAt,
    }:{delegatedByDemoAdmin:true}),
  };
}

export function sanitizeAuditContextExtras(extras:Record<string,unknown>={}):Record<string,unknown>{
  const reserved:ReadonlySet<string>=new Set(reservedAuditIdentityKeys);
  return Object.fromEntries(Object.entries(extras).filter(([key])=>!reserved.has(key)));
}

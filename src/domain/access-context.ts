import { AuthorizationError, type CommandContext } from "./command-context";

/** Claims are resolved from verified DB rows, never from caller-provided roles. */
export type VerifiedAccessGrant = {
 id: string;
 accountId: string;
 personId: string;
 role: string;
 organizationId: string | null;
 siteId: string | null;
 active: boolean;
};
export type SessionPrincipal = {
 accountId: string;
 sessionId: string;
 activeGrantId: string | null;
};
export type AccessContext = CommandContext & {
 accountId: string;
 sessionId: string;
 grantId: string;
 role: string;
};

/** Capability mapping is centralized; domain-specific relationship checks are still required. */
export const roleCapabilities: Readonly<Record<string, readonly string[]>> = Object.freeze({
 student: ["student:read","assignments:submit","study-groups:participate","notifications:manage"],
 teacher: ["teacher:read","assignments:grade","assignments:create","referrals:create","discussions:moderate"],
 guardian: ["guardian:read","enrollment:manage","student:related-read"],
 registrar: ["admissions:read","admissions:decide","enrollment:manage","registrations:approve"],
 specialist: ["referrals:read","referrals:manage","support-plans:manage"],
});

/** This may be called only after authenticating a server session and fetching grants from Neon. */
export function resolveAccessContext(principal: SessionPrincipal, grants: readonly VerifiedAccessGrant[]): AccessContext {
 const grant = grants.find(g => g.id === principal.activeGrantId && g.accountId === principal.accountId && g.active);
 if (!grant || !roleCapabilities[grant.role]) throw new AuthorizationError("active membership");
 return {
  accountId: principal.accountId,
  sessionId: principal.sessionId,
  grantId: grant.id,
  actorPersonId: grant.personId,
  role: grant.role,
  capabilities: new Set(roleCapabilities[grant.role]),
  scope: {
   organizationIds: grant.organizationId ? [grant.organizationId] : [],
   siteIds: grant.siteId ? [grant.siteId] : [],
  },
 };
}
export function assertGrantSelection(accountId: string, proposedGrantId: string, grants: readonly VerifiedAccessGrant[]): void {
 if (!grants.some(g => g.accountId === accountId && g.id === proposedGrantId && g.active && Boolean(roleCapabilities[g.role]))) {
  throw new AuthorizationError("active membership");
 }
}

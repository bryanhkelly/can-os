/**
 * A real mailbox can be invited to a synthetic school without acquiring the
 * shared 000000 credential. Immutable invitation evidence binds its original
 * account, email, Person, role, grant and exact Site.
 */
import { isDemoAccountEmail } from "./local-demo-access";
import { localStaffInviteRoles } from "./staff-onboarding-policy";

type Grant = {
  id: string; accountId: string; personId: string; role: string;
  organizationId: string | null; siteId: string | null;
  email: string; emailVerifiedAt: Date | null;
};
type Evidence = { payload: Record<string, unknown> };
export function matchesVerifiedExternalSandboxInvitation(
  grant: Grant,
  issued: Evidence | undefined,
  accepted: Evidence | undefined,
  email: string,
): boolean {
  if (!grant.emailVerifiedAt || !issued || !accepted ||
    isDemoAccountEmail(email) || grant.email !== email ||
    !grant.organizationId || !grant.siteId ||
    !localStaffInviteRoles.some(role => role === grant.role)) return false;
  const invitation = issued.payload;
  const acceptance = accepted.payload;
  return invitation.invitationMode === "verified_email" &&
    invitation.emailNormalized === email &&
    invitation.accountId === grant.accountId &&
    invitation.personId === grant.personId &&
    invitation.role === grant.role &&
    invitation.organizationId === grant.organizationId &&
    invitation.siteId === grant.siteId &&
    acceptance.accountId === grant.accountId &&
    acceptance.personId === grant.personId &&
    acceptance.role === grant.role;
}

import { readCookie } from "@/domain/session-cookies";
import { readRestrictedCanonicalSession } from "./restricted-canonical-session-reader.server";
import type { AccessContext } from "@/domain/access-context";
import {
  canonicalSessionRowSchema,
  projectCanonicalCommandContext,
} from "@/domain/canonical-access";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import { canResolveCanSiteStaff } from "@/domain/canonical-can-sso";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

/**
 * The existing CAN cookie is the only staff credential. Authentication is
 * established by getCommandContext before entering this service.
 *
 * The restricted SQL function independently revalidates the SAME hashed
 * CAN session, active CAN grant, immutable public Person and exact owning
 * Site/Organization. No separate canonical staff Person, grant or link exists.
 * Sensitive publication and independent reviewer approvals are governed
 * separately; a Site grant never implies those additional authorities.
 *
 * This service MUST NOT read identity records with the owner DATABASE_URL,
 * infer authorization from email or issue a second login.
 */
export async function resolveCanonicalSiteStaffFromCan(
  actor: AccessContext,
  request: Request,
): Promise<CommandContext> {
  if (!canResolveCanSiteStaff(actor) || !actor.sessionId) {
    throw new AuthorizationError("verified CAN Site administrator or registrar");
  }
  const rawCookie = readCookie(request, accessSessionCookie);
  if (!rawCookie || !/^[A-Za-z0-9_-]{40,}$/.test(rawCookie)) {
    throw new AuthorizationError("authenticated CAN session");
  }
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new AuthorizationError("CAN session configuration");
  }
  const digest = hashAccessSecret(rawCookie, pepper);
  const rows = await readRestrictedCanonicalSession("can_staff", digest);

  if (rows.length !== 1) {
    throw new AuthorizationError("current verified Site staff authority");
  }
  const native = canonicalSessionRowSchema.parse(rows[0]);
  // The restricted projection must describe this exact verified CAN session.
  // A new selected role or logged-out session may not reuse another context.
  if (native.session_id !== actor.sessionId ||
      native.account_id !== actor.accountId ||
      native.grant_id !== actor.activeGrantId ||
      native.person_id !== actor.actorPersonId ||
      native.role_code !== actor.role ||
      native.organization_id !== actor.scope.organizationIds?.[0] ||
      native.site_id !== actor.grantSiteId ||
      !actor.grantSiteId) {
    throw new AuthorizationError("current exact CAN Site staff membership");
  }
  return projectCanonicalCommandContext(native);
}

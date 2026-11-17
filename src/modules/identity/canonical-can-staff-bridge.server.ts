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
 * session, the original active CAN grant and Person, the reviewed Person and
 * Site mappings, canonical staff grant and effective Site relationship.
 *
 * This service MUST NOT read canonical identities with the general/owner
 * DATABASE_URL, infer authorization from email or issue a second login.
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
    throw new AuthorizationError("current verified Site staff mapping");
  }
  const native = canonicalSessionRowSchema.parse(rows[0]);
  // The restricted projection must describe this exact verified CAN session.
  // A new selected role or logged-out session may not reuse another context.
  if (native.session_id !== actor.sessionId ||
      native.role_code !== actor.role ||
      !native.site_id || !actor.actorPersonId || !actor.grantSiteId) {
    throw new AuthorizationError("current active CAN membership");
  }
  return projectCanonicalCommandContext(native);
}

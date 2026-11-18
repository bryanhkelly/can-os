import type { CommandContext } from "@/domain/command-context";
import { AuthorizationError } from "@/domain/command-context";
import { canLearningCookieMode } from "@/domain/can-learning-cookie-boundary";
import { getCanonicalCommandContext, getCanonicalSessionRow } from "./canonical-command-context.server";
import { getCommandContext } from "./command-context.server";

/**
 * Instructional access always starts with the ONE current CAN login.
 * A native bearer alone cannot establish learner authority or silently
 * select a different Person. The temporary dual-cookie route still checks
 * its independently reviewed CAN-to-native participation binding.
 */
export async function getInstructionalLearnerContext(
  request: Request,
): Promise<CommandContext> {
  return canLearningCookieMode(request) === "can_with_native"
    ? getCanonicalCommandContext(request)
    : getCommandContext(request);
}

/**
 * The server chooses a verified access session; callers must not supply it.
 * A legacy learning session can temporarily be resumed with a second
 * cookie ONLY when the same authenticated CAN Person and current
 * independently reviewed participation ownership are revalidated.
 *
 * No native-only login fallback is allowed, even when a native session
 * exists or the CAN session is expired/revoked.
 */
export async function getInstructionalLearnerSession(request: Request): Promise<{
  context: CommandContext;
  sessionId: string;
}> {
  if (canLearningCookieMode(request) === "can_with_native") {
    const context = await getCanonicalCommandContext(request);
    const row = await getCanonicalSessionRow(request);
    if (!context.actorPersonId || context.actorPersonId !== row.person_id)
      throw new AuthorizationError("one verified learning Person");
    return { context, sessionId: row.session_id };
  }
  const context = await getCommandContext(request);
  if (!context.sessionId) throw new AuthorizationError("authenticated session");
  return { context, sessionId: context.sessionId };
}

import type { CommandContext } from "@/domain/command-context";
import { canonicalSessionCookie, projectCanonicalCommandContext } from "@/domain/canonical-access";
import { AuthorizationError } from "@/domain/command-context";
import { getCanonicalCommandContext, getCanonicalSessionRow } from "./canonical-command-context.server";
import { getCommandContext } from "./command-context.server";

/** No downgrade from an invalid native canonical session to a school session. */
export async function getInstructionalLearnerContext(request: Request): Promise<CommandContext> {
  const cookies = request.headers.get("cookie") ?? "";
  const canonical = cookies.split(";").some(value =>
    value.trim().startsWith(canonicalSessionCookie + "="));
  return canonical
    ? getCanonicalCommandContext(request)
    : getCommandContext(request);
}


/**
 * Server-only identity for learning-session persistence. The public domain
 * CommandContext deliberately has no sessionId and must remain that way.
 * Do not accept a session ID submitted by a browser.
 */
export async function getInstructionalLearnerSession(request: Request): Promise<{
  context: CommandContext;
  sessionId: string;
}> {
  const cookies = request.headers.get("cookie") ?? "";
  const canonical = cookies.split(";").some(value =>
    value.trim().startsWith(canonicalSessionCookie + "="));
  if (canonical) {
    const row = await getCanonicalSessionRow(request);
    return { context: projectCanonicalCommandContext(row), sessionId: row.session_id };
  }
  const context = await getCommandContext(request);
  if (!context.sessionId) throw new AuthorizationError("authenticated session");
  return { context, sessionId: context.sessionId };
}

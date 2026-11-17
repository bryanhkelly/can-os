import type { CommandContext } from "@/domain/command-context";
import { canonicalSessionCookie, projectCanonicalCommandContext } from "@/domain/canonical-access";
import { accessSessionCookie } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { AuthorizationError } from "@/domain/command-context";
import { getCanonicalCommandContext, getCanonicalSessionRow } from "./canonical-command-context.server";
import { getCommandContext } from "./command-context.server";

/** No downgrade from an invalid native canonical session to a school session. */
export async function getInstructionalLearnerContext(request: Request): Promise<CommandContext> {
  const canonical = readCookie(request, canonicalSessionCookie) !== undefined;
  // The canonical context resolver validates the CAN account whenever it is
  // present. A second cookie must never supersede the selected CAN Person.
  return canonical ? getCanonicalCommandContext(request) : getCommandContext(request);
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
    // When both cookies are present, never let a native bearer override an
    // independently authenticated CAN account. Revalidate the binding first,
    // including the selected CAN Person and current grant, before returning a
    // learning persistence session.
    const hasCan = readCookie(request, accessSessionCookie) !== undefined;
    if (hasCan) {
      const context = await getCanonicalCommandContext(request);
      const row = await getCanonicalSessionRow(request);
      if (context.actorPersonId !== row.person_id)
        throw new AuthorizationError("one verified learning Person");
      return {context,sessionId:row.session_id};
    }
    const row = await getCanonicalSessionRow(request);
    return { context: projectCanonicalCommandContext(row), sessionId: row.session_id };
  }
  const context = await getCommandContext(request);
  if (!context.sessionId) throw new AuthorizationError("authenticated session");
  return { context, sessionId: context.sessionId };
}

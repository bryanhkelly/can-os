import type { CommandContext } from "@/domain/command-context";
import { canonicalSessionCookie } from "@/domain/canonical-access";
import { getCanonicalCommandContext } from "./canonical-command-context.server";
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

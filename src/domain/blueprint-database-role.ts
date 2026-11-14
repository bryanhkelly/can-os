import { z } from "zod";
import { AuthorizationError, type CommandContext } from "./command-context";

export type BlueprintRolePurpose = "blueprint_author" | "blueprint_reviewer";
const organizationId = z.string().uuid();

/**
 * Only a single Organization obtained from a verified canonical session may
 * select a purpose-specific PostgreSQL role. Never interpolate browser input.
 */
export function blueprintDatabaseRole(
  context: Pick<CommandContext, "scope" | "capabilities">,
  purpose: BlueprintRolePurpose,
): string {
  const requiredCapability = purpose === "blueprint_author"
    ? "blueprint.configure" : "blueprint.review";
  if (!context.capabilities.has(requiredCapability)) {
    throw new AuthorizationError(requiredCapability);
  }
  const ids = context.scope.organizationIds;
  if (ids?.length !== 1) {
    throw new AuthorizationError("one canonical Blueprint Organization");
  }
  const id = organizationId.safeParse(ids[0]);
  if (!id.success) throw new AuthorizationError("canonical Blueprint Organization UUID");
  const suffix = id.data.replaceAll("-", "").toLowerCase();
  return `can_v30_${purpose}_${suffix}`;
}

export function blueprintReadDatabaseRole(
  context: Pick<CommandContext, "scope" | "capabilities">,
): string {
  return context.capabilities.has("blueprint.review")
    ? blueprintDatabaseRole(context, "blueprint_reviewer")
    : blueprintDatabaseRole(context, "blueprint_author");
}

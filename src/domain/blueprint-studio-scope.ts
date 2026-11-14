import { AuthorizationError, type CommandContext } from "./command-context";

/**
 * A configuration's Site association is planning metadata, not authority.
 * Every Studio read or command must independently match verified Site scope.
 */
export function requireBlueprintSiteScope(
  context: CommandContext,
  rawConfig: unknown,
): string {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new AuthorizationError("canonical Blueprint Site selection");
  }
  const siteId = (rawConfig as Record<string, unknown>).siteId;
  if (typeof siteId !== "string" || !context.scope.siteIds?.includes(siteId)) {
    throw new AuthorizationError("canonical Blueprint Site scope");
  }
  return siteId;
}

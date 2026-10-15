export type AuthorizationScope = {
  organizationIds?: string[];
  siteIds?: string[];
  programIds?: string[];
  sectionIds?: string[];
};

export type CommandContext = {
  actorPersonId: string | null;
  capabilities: ReadonlySet<string>;
  scope: AuthorizationScope;
  requestId?: string;
};

export class AuthorizationError extends Error {
  constructor(capability: string) {
    super(`Missing required capability: ${capability}`);
    this.name = "AuthorizationError";
  }
}

export function assertCapability(context: CommandContext, capability: string): void {
  if (!context.capabilities.has(capability)) {
    throw new AuthorizationError(capability);
  }
}

export function assertSectionScope(context: CommandContext, sectionId: string): void {
  const allowed = context.scope.sectionIds;
  if (allowed && allowed.length > 0 && !allowed.includes(sectionId)) {
    throw new AuthorizationError(`section scope: ${sectionId}`);
  }
}

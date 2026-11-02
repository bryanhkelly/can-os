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
  /** Set only by verified demo-admin delegation; never grants domain authority. */
  sessionAccountId?: string;
};

export class AuthorizationError extends Error {
  constructor(capability: string) {
    super(`Missing required capability or scope: ${capability}`);
    this.name = "AuthorizationError";
  }
}

export function assertCapability(
  context: CommandContext,
  capability: string,
): void {
  if (!context.capabilities.has(capability)) {
    throw new AuthorizationError(capability);
  }
}

function assertScopedId(
  allowed: string[] | undefined,
  id: string | null | undefined,
  label: string,
): void {
  if (!id) return;
  if (allowed && !allowed.includes(id)) {
    throw new AuthorizationError(`${label}: ${id}`);
  }
}

export function assertOrganizationScope(
  context: CommandContext,
  organizationId: string | null | undefined,
): void {
  assertScopedId(context.scope.organizationIds, organizationId, "organization scope");
}

export function assertSiteScope(
  context: CommandContext,
  siteId: string | null | undefined,
): void {
  assertScopedId(context.scope.siteIds, siteId, "site scope");
}

export function assertProgramScope(
  context: CommandContext,
  programId: string | null | undefined,
): void {
  assertScopedId(context.scope.programIds, programId, "program scope");
}

export function assertSectionScope(
  context: CommandContext,
  sectionId: string | null | undefined,
): void {
  assertScopedId(context.scope.sectionIds, sectionId, "section scope");
}

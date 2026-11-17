import { DomainError } from "./errors";

export type AuthorizationScope = {
  organizationIds?: string[];
  siteIds?: string[];
  programIds?: string[];
  sectionIds?: string[];
};

export type CommandContext = {
  actorPersonId: string | null;
  role?: string;
  capabilities: ReadonlySet<string>;
  scope: AuthorizationScope;
  requestId?: string;
  /** Set only by verified demo-admin delegation; never grants domain authority. */
  sessionAccountId?: string;
};

export class AuthorizationError extends DomainError {
  constructor(capability: string) {
    super(capability === "authenticated session" ? "AUTHENTICATION_REQUIRED" : "FORBIDDEN",
      `Missing required capability or scope: ${capability}`);
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

/**
 * Require an explicit current Program grant for a privileged write.
 * The legacy assertProgramScope helper treats undefined scope as unrestricted
 * for backwards compatibility; enrollment mutations must fail closed instead.
 */
export function assertExplicitProgramScope(
  context: CommandContext,
  programId: string,
): void {
  if (!programId || !context.scope.programIds?.includes(programId)) {
    throw new AuthorizationError(`program scope: ${programId}`);
  }
}

export function assertSectionScope(
  context: CommandContext,
  sectionId: string | null | undefined,
): void {
  assertScopedId(context.scope.sectionIds, sectionId, "section scope");
}

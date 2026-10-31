/**
 * Journey personas — verified people, accounts, grants and matching
 * AccessContext objects, built once per actor instead of re-assembled inline
 * by every journey. A persona is identity scaffolding only; it never carries
 * pre-built enrollment, placement, work or grade state.
 */
import { roleCapabilities, type AccessContext } from "@/domain/access-context";
import type { CommandContext } from "@/domain/command-context";
import * as s from "@/db/schema";
import { first, type JourneyTx } from "./harness";

export type JourneyPersona = {
  person: typeof s.people.$inferSelect;
  account: typeof s.accessAccounts.$inferSelect;
  grant: typeof s.accountPersonGrants.$inferSelect;
  actor: AccessContext;
};

export async function createPersona(
  tx: JourneyTx,
  input: {
    /** Unique persona key within one journey run, e.g. "operator", "guardian-a". */
    key: string;
    role: string;
    organizationId: string;
    /** Null/omitted means an organization-wide grant. */
    siteId?: string | null;
    firstName: string;
    lastName: string;
    suffix: string;
    emailVerified?: boolean;
    programIds?: string[];
  },
): Promise<JourneyPersona> {
  const person = first(await tx.insert(s.people).values({
    legalFirstName: input.firstName,
    legalLastName: `${input.lastName} ${input.suffix}`,
  }).returning());
  const account = first(await tx.insert(s.accessAccounts).values({
    emailNormalized: `${input.key}-${input.suffix}@example.test`,
    ...(input.emailVerified ? { emailVerifiedAt: new Date() } : {}),
  }).returning());
  const grant = first(await tx.insert(s.accountPersonGrants).values({
    accountId: account.id,
    personId: person.id,
    role: input.role,
    organizationId: input.organizationId,
    siteId: input.siteId ?? null,
    active: true,
    isSynthetic: false,
  }).returning());
  return {
    person, account, grant,
    actor: actorFor(person.id, account.id, grant.id, {
      role: input.role,
      organizationId: input.organizationId,
      siteId: input.siteId ?? null,
      programIds: input.programIds ?? [],
      sessionId: `journey-${input.suffix}-${input.key}`,
    }),
  };
}

function actorFor(
  personId: string,
  accountId: string,
  grantId: string,
  input: {
    role: string;
    organizationId: string;
    siteId: string | null;
    programIds: string[];
    sessionId: string;
  },
): AccessContext {
  return {
    actorPersonId: personId,
    role: input.role,
    accountId,
    sessionId: input.sessionId,
    grantId,
    grantSiteId: input.siteId,
    capabilities: new Set(roleCapabilities[input.role] ?? []),
    scope: {
      organizationIds: [input.organizationId],
      siteIds: input.siteId ? [input.siteId] : [],
      programIds: input.programIds,
    },
  };
}

/**
 * Returns the same persona with a wider verified scope projection (for
 * example, after its Program is created mid-journey).
 */
export function withScope(
  persona: JourneyPersona,
  scope: { siteIds?: string[]; programIds?: string[] },
): AccessContext {
  return {
    ...persona.actor,
    scope: {
      organizationIds: persona.actor.scope.organizationIds ?? [],
      siteIds: scope.siteIds ?? persona.actor.scope.siteIds ?? [],
      programIds: scope.programIds ?? persona.actor.scope.programIds ?? [],
    },
  };
}

/**
 * Hand-checked CommandContext for bounded services that take an explicit
 * context instead of the session boundary (health office, incidents). The
 * caller names the exact capabilities a staff member was independently
 * granted; role alone never implies them.
 */
export function serviceContext(
  persona: JourneyPersona,
  capabilities: readonly string[],
  requestId: string,
): CommandContext {
  return {
    actorPersonId: persona.person.id,
    capabilities: new Set(capabilities),
    scope: { ...persona.actor.scope },
    requestId,
  };
}

/** Same verified identity, different person — for cross-person denials. */
export function impersonating(actor: AccessContext, personId: string): AccessContext {
  return { ...actor, actorPersonId: personId };
}

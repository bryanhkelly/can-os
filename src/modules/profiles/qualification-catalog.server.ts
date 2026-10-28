import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { programs, qualificationDefinitions } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import type { Actor } from "@/modules/identity/actors.server";
import { recordAudit } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";

import { EventTypes } from "@/domain/event-types";
type Reader = Pick<typeof db, "select">;
type ProgramScope = { id: string; organizationId: string; siteId: string | null };
export const catalogStewardCapability = "profiles.catalog.create";

export async function canAuthorQualificationCatalog(actor: Actor, program: ProgramScope, executor: Reader = db) {
  return hasInstitutionalProgramCapability(actor, program, catalogStewardCapability, executor);
}

export async function createQualificationDefinition(actor: Actor, input: {
  programId: string; key: string; title: string; kind: string; reason: string;
}) {
  return db.transaction(async tx => {
    const [program] = await tx.select({
      id: programs.id, organizationId: programs.organizationId, siteId: programs.siteId,
    }).from(programs).where(eq(programs.id, input.programId)).limit(1);
    if (!program || !await canAuthorQualificationCatalog(actor, program, tx)) {
      throw new AuthorizationError("explicit qualification catalog steward");
    }
    const [created] = await tx.insert(qualificationDefinitions).values({
      key: input.key, title: input.title, kind: input.kind, schemaVersion: 1, attributesSchema: {},
    }).onConflictDoNothing({ target: qualificationDefinitions.key }).returning({ id: qualificationDefinitions.id });
    if (!created) {
      const [existing] = await tx.select().from(qualificationDefinitions)
        .where(eq(qualificationDefinitions.key, input.key)).limit(1);
      if (!existing || existing.title !== input.title || existing.kind !== input.kind ||
        existing.schemaVersion !== 1 || Object.keys(existing.attributesSchema).length) {
        throw new Error("This qualification key already has a different definition. Reuse the existing definition or choose a distinct key; existing entries cannot be edited here.");
      }
      return { definitionId: existing.id, created: false };
    }
    const scope = { organizationId: program.organizationId, siteId: program.siteId, programId: program.id };
    await recordAudit(tx, actor, {
      action: "qualification.catalog_created", resourceType: "qualification_definition",
      resourceId: created.id, scope,
      after: { key: input.key, title: input.title, kind: input.kind,
        schemaVersion: 1, reason: input.reason, sharedCatalog: true, confirmed: true },
    });
    await emitEvent(tx, {
      eventType: EventTypes.QualificationDefinitionCreated, aggregateType: "qualification_definition",
      aggregateId: created.id, actorPersonId: actor.actorPersonId, ...scope,
      payload: { key: input.key, title: input.title, kind: input.kind, schemaVersion: 1 },
    });
    return { definitionId: created.id, created: true };
  });
}

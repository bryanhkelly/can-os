import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { siteEnvironmentV61Schema } from "@/domain/site-information-v61";
import {
  applySiteProgramsAudiencesV61, readSiteProgramsAudiencesV61 as normalizeSiteProgramsAudiencesV61,
  siteLaunchPreferencesSchema, siteProgramsAudiencesV61Schema,
} from "@/domain/site-launch-preferences";
import { nextSiteConfigurationRevision } from "@/domain/site-setup-configuration";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getBlueprintReferenceCatalog } from "@/modules/blueprints/blueprint-reference-catalog.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

const siteIdSchema = z.string().uuid();
const expectedRevisionSchema = z.string().datetime({ offset: true });

async function authorizedRegistrar(capability: "program.read" | "program.launch.start") {
  const actor = await getCommandContext(getRequest());
  assertCapability(actor, capability);
  if (!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
    throw new AuthorizationError("verified Site planning registrar");
  return actor;
}

/** One exact Site, private intent only. Nothing grants Program adoption or enrollment. */
export const readSiteProgramsAudiencesV61 = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ siteId: siteIdSchema }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await authorizedRegistrar("program.read");
    const [site] = await db.select().from(sites).where(eq(sites.id, data.siteId)).limit(1);
    assertSiteSetupScope(actor, site, "program.read");
    const raw = site.metadata.launchPreferences;
    // A damaged persisted Site record must be corrected, not shown as a blank form.
    const intent = normalizeSiteProgramsAudiencesV61(raw);
    const preferences = raw == null ? null : siteLaunchPreferencesSchema.parse(raw);
    return {
      siteId: site.id,
      revision: site.updatedAt.toISOString(),
      intent,
      delivery: preferences?.delivery ?? null,
      saved: !!preferences && (preferences.planningVersion === 2 ||
        preferences.interestIds.length > 0),
    };
  });

/** Canonical, revision-checked Site metadata update under one row lock. */
export const saveSiteProgramsAudiencesV61 = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: siteIdSchema,
    expectedRevision: expectedRevisionSchema,
    intent: siteProgramsAudiencesV61Schema,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await authorizedRegistrar("program.launch.start");
    // These are Site planning references, not academic Program creation.
    // Validate against the same active, published reference catalog offered in
    // Establish. Never accept an arbitrary client-provided Product/Offering ID.
    const selectedPrograms = data.intent.programCodes ?? [];
    if (selectedPrograms.length) {
      const catalog = await getBlueprintReferenceCatalog(actor, { siteId: data.siteId });
      const available = new Set(catalog.filter(item => item.kind === "program_model")
        .map(item => item.code));
      if (!selectedPrograms.every(code => available.has(code)))
        throw new AuthorizationError("selected published Program references");
    }
    return db.transaction(async tx => {
      const [site] = await tx.select().from(sites)
        .where(eq(sites.id, data.siteId)).for("update").limit(1);
      assertSiteSetupScope(actor, site, "program.launch.start");
      if (site.updatedAt.toISOString() !== data.expectedRevision)
        throw new Error("This Site changed since you opened Programs & Audiences. Reload and review before saving.");
      const old = site.metadata.launchPreferences;
      const rawEnvironment = site.metadata.siteEnvironmentV61;
      const environment = siteEnvironmentV61Schema.safeParse(rawEnvironment);
      if (rawEnvironment != null && !environment.success)
        throw new Error("Stored Learning Environment needs review before saving Site plans.");
      const authoritativeDelivery = environment.success ? environment.data.delivery : undefined;
      const preferences = applySiteProgramsAudiencesV61(old, data.intent, authoritativeDelivery);
      if (JSON.stringify(old) === JSON.stringify(preferences))
        return { siteId: site.id, revision: site.updatedAt.toISOString(), updated: false };
      const revision = nextSiteConfigurationRevision(site.updatedAt);
      const [updated] = await tx.update(sites).set({
        metadata: { ...site.metadata, launchPreferences: preferences },
        updatedAt: revision,
      }).where(eq(sites.id, site.id)).returning({ updatedAt: sites.updatedAt });
      if (!updated) throw new Error("Site planning preferences could not be saved.");
      await writeAudit(tx, actor, {
        action: "site.programs_audiences_v61.update",
        entityType: "site", entityId: site.id,
        scope: { siteId: site.id, organizationId: site.organizationId },
        before: { preferences: old ?? null },
        after: { preferences, selfReported: true, publicApproved: false },
      });
      await emitEvent(tx, {
        eventType: EventTypes.SiteInformationUpdated,
        aggregateType: "site", aggregateId: site.id,
        actorPersonId: actor.actorPersonId,
        siteId: site.id, organizationId: site.organizationId,
        payload: { section: "programs_audiences", revision: updated.updatedAt.toISOString(),
          selfReported: true, publicApproved: false },
      });
      return { siteId: site.id, revision: updated.updatedAt.toISOString(), updated: true };
    });
  });

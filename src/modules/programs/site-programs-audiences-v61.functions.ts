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
  siteLaunchPreferencesSchema, siteProgramsAudiencesV61SaveSchema,
} from "@/domain/site-launch-preferences";
import { nextSiteConfigurationRevision } from "@/domain/site-setup-configuration";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { readPublishedBlueprintReferences } from "@/modules/blueprints/blueprint-reference-catalog.server";
import { readSiteSchoolYearAvailability } from "./site-school-year-availability.server";
import { isSchoolYearAcademyReference, newlyRestrictedSiteIntent } from "@/domain/site-program-access-v61";
import { writeAudit } from "@/platform/mutation";
import { emitReportableEvent } from "@/platform/reportable-event";

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
    return db.transaction(async tx => {
    const [site] = await tx.select().from(sites).where(eq(sites.id, data.siteId)).limit(1);
    assertSiteSetupScope(actor, site, "program.read");
    const schoolYearAvailability = await readSiteSchoolYearAvailability(tx,site.id);
    const schoolYearAcademyPrograms = (await readPublishedBlueprintReferences(tx))
      .filter(isSchoolYearAcademyReference);
    const raw = site.metadata.launchPreferences;
    // A damaged persisted Site record must be corrected, not shown as a blank form.
    const intent = normalizeSiteProgramsAudiencesV61(raw);
    const preferences = raw == null ? null : siteLaunchPreferencesSchema.parse(raw);
    return {
      siteId: site.id,
      revision: site.updatedAt.toISOString(),
      intent,
      delivery: preferences?.delivery ?? null,
      schoolYearAvailability,
      schoolYearAcademyPrograms,
      saved: !!preferences && (preferences.planningVersion === 2 ||
        preferences.interestIds.length > 0),
    };
    });
  });

/** Canonical, revision-checked Site metadata update under one row lock. */
export const saveSiteProgramsAudiencesV61 = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: siteIdSchema,
    expectedRevision: expectedRevisionSchema,
    intent: siteProgramsAudiencesV61SaveSchema,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await authorizedRegistrar("program.launch.start");
    // Broad Program intent is independent from catalog provisioning.
    // Existing saved references can remain while the Site edits its vision.
    // Only newly selected catalog references require live published validation.
    return db.transaction(async tx => {
      const [site] = await tx.select().from(sites)
        .where(eq(sites.id, data.siteId)).for("update").limit(1);
      assertSiteSetupScope(actor, site, "program.launch.start");
      if (site.updatedAt.toISOString() !== data.expectedRevision)
        throw new Error("This Site changed since you opened Programs & Audiences. Reload and review before saving.");
      const old = site.metadata.launchPreferences;
      const previousIntent = normalizeSiteProgramsAudiencesV61(old);
      const schoolYearAvailability = await readSiteSchoolYearAvailability(tx,site.id);
      const previouslySelected = new Set(previousIntent.programCodes ?? []);
      const addedCodes = (data.intent.programCodes ?? []).filter(code =>
        !previouslySelected.has(code));
      let catalog: Awaited<ReturnType<typeof readPublishedBlueprintReferences>> = [];
      if (addedCodes.length) {
        // Exact Site authority was established on this locked Site row above.
        // Validate new Program intent within the *same* transaction as the
        // metadata save; no second, separately provisioned catalog role or
        // nested connection is necessary.
        catalog = await readPublishedBlueprintReferences(tx);
        const available = new Set(catalog.filter(item => item.kind === "program_model")
          .map(item => item.code));
        if (!addedCodes.every(code => available.has(code)))
          throw new AuthorizationError("selected published Program references");
      }
      const newlyRestricted = newlyRestrictedSiteIntent(
        data.intent,previousIntent,catalog,schoolYearAvailability);
      if (newlyRestricted.length) throw new AuthorizationError(
        "School-year Programs require independently authorized academic operations: " +
        newlyRestricted.join(", "),
      );
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
      await emitReportableEvent(tx, {
        eventType: EventTypes.SiteInformationUpdated,
        aggregateType: "site", aggregateId: site.id,
        actorPersonId: actor.actorPersonId,
        occurredAt: updated.updatedAt,
        source: { kind: "site", id: site.id, version: updated.updatedAt.toISOString() },
        dimensions: { organizationId: site.organizationId, siteId: site.id },
        evidenceClass: "operational_record",
        payload: { section: "programs_audiences", revision: updated.updatedAt.toISOString(),
          selfReported: true, publicApproved: false },
      });
      return { siteId: site.id, revision: updated.updatedAt.toISOString(), updated: true };
    });
  });

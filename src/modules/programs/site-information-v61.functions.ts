import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { EventTypes } from "@/domain/event-types";
import { z } from "zod";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { nextSiteConfigurationRevision } from "@/domain/site-setup-configuration";
import { siteLaunchPreferencesSchema } from "@/domain/site-launch-preferences";
import { siteIdentityV61Schema, emptySiteIdentityV61 } from "@/domain/site-identity-v61";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import {
  applySiteEnvironmentDeliveryV61, cleanSiteEnvironmentV61, cleanSiteHostingV61, emptySiteHostingV61, emptySiteStoryV61, siteStoryAuditSummaryV61,
  siteEnvironmentV61Schema, siteHostingV61Schema, siteStorySourceV61Schema, siteStoryV61Schema,
} from "@/domain/site-information-v61";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";
import { emitReportableEvent } from "@/platform/reportable-event";

/** Preserve change history without copying EINs into Site audit streams. */
function safeHostingAuditValue(value:unknown){
  const input=siteHostingV61Schema.safeParse(value);
  if(!input.success)return value===null?null:{status:"unavailable"};
  const {nonprofitEin,...safe}=input.data;
  return {...safe,einSupplied:Boolean(nonprofitEin)};
}

/** Faith identity is private and self-described. Audit only whether the Site
 * supplied it, not the tradition or religious classification itself. */
function safeIdentityAuditValue(value:unknown) {
  const parsed=siteIdentityV61Schema.safeParse(value);
  if(!parsed.success)return value==null?null:{status:"unavailable"};
  return {
    siteTypeProvided:Boolean(parsed.data.siteType),
    faithOrientationProvided:parsed.data.faithOrientation!=="undecided",
    traditionProvided:Boolean(parsed.data.faithTradition),
  };
}

const siteId = z.string().uuid();
const expectedRevision = z.string().datetime({ offset: true });
const saveInput = z.discriminatedUnion("section", [
  z.object({ siteId, expectedRevision, section: z.literal("identity"), identity: siteIdentityV61Schema }).strict(),
  z.object({ siteId, expectedRevision, section: z.literal("hosting"), host: siteHostingV61Schema }).strict(),
  z.object({ siteId, expectedRevision, section: z.literal("environment"), environment: siteEnvironmentV61Schema }).strict(),
  z.object({ siteId, expectedRevision, section: z.literal("story"), story: siteStoryV61Schema }).strict(),
]);

async function authorizedSite(capability: "program.read" | "program.launch.start") {
  const actor = await getCommandContext(getRequest());
  assertCapability(actor, capability);
  if (!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
    throw new AuthorizationError("verified Site Information registrar");
  return actor;
}

/** Exact Site-scoped private source, not the published Website or an affiliation grant. */
export const readSiteInformationV61 = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ siteId }).strict().parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await authorizedSite("program.read");
    const [site] = await db.select().from(sites).where(eq(sites.id, data.siteId)).limit(1);
    assertSiteSetupScope(actor, site, "program.read");
    const metadata = site.metadata;
    const identity = siteIdentityV61Schema.safeParse(metadata.siteIdentityV61);
    const host = siteHostingV61Schema.safeParse(metadata.siteHostingV61);
    const environment = siteEnvironmentV61Schema.safeParse(metadata.siteEnvironmentV61);
    const preferences = siteLaunchPreferencesSchema.safeParse(metadata.launchPreferences);
    const story = siteStorySourceV61Schema.safeParse(metadata.siteStoryV61);
    // A corrupt/unsupported private source is not an empty draft. Never silently erase it.
    if (metadata.siteIdentityV61 != null && !identity.success) throw new Error("Stored Site identity needs review.");
    if (metadata.siteHostingV61 != null && !host.success) throw new Error("Stored Site hosting information needs review.");
    if (metadata.siteEnvironmentV61 != null && !environment.success) throw new Error("Stored learning environment needs review.");
    if (metadata.siteStoryV61 != null && !story.success) throw new Error("Stored Site Story needs review.");
    const delivery = preferences.success ? preferences.data.delivery
      : environment.success ? environment.data.delivery : "" as const;
    const physicalSpaceArrangement = delivery === "digital" ? "" as const
      : environment.success ? environment.data.physicalSpaceArrangement : "" as const;
    return {
      siteId: site.id,
      revision: site.updatedAt.toISOString(),
      identity: identity.success ? identity.data : emptySiteIdentityV61(),
      identitySaved: identity.success,
      host: host.success ? host.data : emptySiteHostingV61(),
      hostingSaved: host.success,
      environment: { delivery, physicalSpaceArrangement },
      environmentSaved: environment.success && preferences.success &&
        environment.data.delivery === preferences.data.delivery &&
        (delivery !== "digital" || environment.data.physicalSpaceArrangement === ""),
      story: story.success ? story.data.answers : emptySiteStoryV61(),
      storyRevision: story.success ? story.data.revision : null,
    };
  });

/** All sections use the same Site revision; no blind overwrite of another editor. */
export const saveSiteInformationV61 = createServerFn({ method: "POST" })
  .validator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data }) => {
    const actor = await authorizedSite("program.launch.start");
    return db.transaction(async tx => {
      const [site] = await tx.select().from(sites)
        .where(eq(sites.id, data.siteId)).for("update").limit(1);
      assertSiteSetupScope(actor, site, "program.launch.start");
      const metadata = site.metadata;
      let nextMetadata: typeof metadata;
      let before: unknown;
      let after: unknown;
      let storyAuditBefore: Record<string, unknown> | null = null;
      if (data.section === "identity") {
        const current = siteIdentityV61Schema.safeParse(metadata.siteIdentityV61);
        if (metadata.siteIdentityV61 != null && !current.success)
          throw new Error("Stored Site identity needs review.");
        before = metadata.siteIdentityV61 ?? null;
        after = data.identity;
        nextMetadata = { ...metadata, siteIdentityV61: data.identity };
      } else if (data.section === "hosting") {
        const current = siteHostingV61Schema.safeParse(metadata.siteHostingV61);
        if (metadata.siteHostingV61 != null && !current.success)
          throw new Error("Stored Site hosting information needs review.");
        const host = cleanSiteHostingV61(data.host);
        before = metadata.siteHostingV61 ?? null;
        after = host;
        nextMetadata = { ...metadata, siteHostingV61: host };
      } else if (data.section === "environment") {
        const current = siteEnvironmentV61Schema.safeParse(metadata.siteEnvironmentV61);
        if (metadata.siteEnvironmentV61 != null && !current.success)
          throw new Error("Stored learning environment needs review.");
        const environment = cleanSiteEnvironmentV61(data.environment);
        // Keep unrelated Program interests intact; malformed legacy data fails closed.
        const preferences = applySiteEnvironmentDeliveryV61(metadata.launchPreferences, environment);
        before = { environment: metadata.siteEnvironmentV61 ?? null, preferences: metadata.launchPreferences ?? null };
        after = { environment, preferences };
        nextMetadata = { ...metadata, siteEnvironmentV61: environment, launchPreferences: preferences };
      } else {
        const previous = siteStorySourceV61Schema.safeParse(metadata.siteStoryV61);
        if (metadata.siteStoryV61 != null && !previous.success)
          throw new Error("Stored Site Story needs review before editing.");
        before = previous.success ? previous.data.answers : null;
        after = data.story;
        storyAuditBefore = previous.success ? {
          revision: previous.data.revision, ...siteStoryAuditSummaryV61(previous.data.answers),
        } : null;
        // Source text stays in Site-scoped private metadata, not the wider audit log.
        nextMetadata = metadata;
      }
      if (site.updatedAt.toISOString() !== data.expectedRevision)
        throw new Error("Site Information changed since you opened it. Reload and review before saving.");
      if (JSON.stringify(before) === JSON.stringify(after))
        return { siteId: site.id, revision: site.updatedAt.toISOString(), updated: false };
      const next = nextSiteConfigurationRevision(site.updatedAt);
      if (data.section === "story") {
        nextMetadata = { ...nextMetadata, siteStoryV61: {
          schemaVersion: 1, revision: next.toISOString(), answers: data.story,
          changedByPersonId: actor.actorPersonId!, updatedAt: next.toISOString(), status: "private_source" as const,
        } };
      }
      const [saved] = await tx.update(sites).set({
        metadata: nextMetadata, updatedAt: next,
      }).where(eq(sites.id, site.id)).returning({ updatedAt: sites.updatedAt });
      if (!saved) throw new Error("Site Information could not be saved.");
      await writeAudit(tx, actor, {
        action: "site.information_v61." + data.section + ".update",
        entityType: "site", entityId: site.id,
        scope: { organizationId: site.organizationId, siteId: site.id },
        before: data.section === "story" ? storyAuditBefore
          : { value: data.section === "hosting" ? safeHostingAuditValue(before)
            : data.section === "identity" ? safeIdentityAuditValue(before) : before as object | null },
        after: data.section === "story"
          ? { revision: next.toISOString(), ...siteStoryAuditSummaryV61(data.story),
              selfReported: true, publicApproved: false }
          : { value: data.section === "hosting" ? safeHostingAuditValue(after)
            : data.section === "identity" ? safeIdentityAuditValue(after) : after as object,
              selfReported: true, publicApproved: false },
      });
      // Notify the shared outbox of a revised private Site source, never its contents.
      await emitReportableEvent(tx, {
        eventType: EventTypes.SiteInformationUpdated,
        aggregateType: "site", aggregateId: site.id,
        actorPersonId: actor.actorPersonId,
        occurredAt: saved.updatedAt,
        source: { kind: "site", id: site.id, version: saved.updatedAt.toISOString() },
        dimensions: { organizationId: site.organizationId, siteId: site.id },
        evidenceClass: "operational_record",
        payload: { section: data.section, revision: saved.updatedAt.toISOString(),
          selfReported: true, publicApproved: false },
      });
      return { siteId: site.id, revision: saved.updatedAt.toISOString(), updated: true };
    });
  });

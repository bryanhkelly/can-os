import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { nextSiteConfigurationRevision } from "@/domain/site-setup-configuration";
import { siteLaunchPreferencesSchema } from "@/domain/site-launch-preferences";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import {
  cleanSiteEnvironmentV61, cleanSiteHostingV61, emptySiteHostingV61, emptySiteStoryV61,
  siteEnvironmentV61Schema, siteHostingV61Schema, siteStorySourceV61Schema, siteStoryV61Schema,
} from "@/domain/site-information-v61";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";

const siteId = z.string().uuid();
const expectedRevision = z.string().datetime({ offset: true });
const saveInput = z.discriminatedUnion("section", [
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
    const host = siteHostingV61Schema.safeParse(metadata.siteHostingV61);
    const environment = siteEnvironmentV61Schema.safeParse(metadata.siteEnvironmentV61);
    const preferences = siteLaunchPreferencesSchema.safeParse(metadata.launchPreferences);
    const story = siteStorySourceV61Schema.safeParse(metadata.siteStoryV61);
    return {
      siteId: site.id,
      revision: site.updatedAt.toISOString(),
      host: host.success ? host.data : emptySiteHostingV61(),
      hostingSaved: host.success,
      environment: environment.success ? environment.data : {
        delivery: preferences.success ? preferences.data.delivery : "" as const,
        physicalSpaceArrangement: "" as const,
      },
      environmentSaved: environment.success && preferences.success &&
        environment.data.delivery === preferences.data.delivery,
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
      if (data.section === "hosting") {
        const host = cleanSiteHostingV61(data.host);
        before = metadata.siteHostingV61 ?? null;
        after = host;
        nextMetadata = { ...metadata, siteHostingV61: host };
      } else if (data.section === "environment") {
        const environment = cleanSiteEnvironmentV61(data.environment);
        const previous = siteLaunchPreferencesSchema.safeParse(metadata.launchPreferences);
        // Existing interest IDs must not be erased by an unrelated delivery edit.
        if (metadata.launchPreferences != null && !previous.success)
          throw new Error("Existing Site interests need review. Refresh before editing the learning environment.");
        const preferences = siteLaunchPreferencesSchema.parse({
          delivery: environment.delivery,
          interestIds: previous.success ? previous.data.interestIds : [],
        });
        before = { environment: metadata.siteEnvironmentV61 ?? null, preferences: metadata.launchPreferences ?? null };
        after = { environment, preferences };
        nextMetadata = { ...metadata, siteEnvironmentV61: environment, launchPreferences: preferences };
      } else {
        before = metadata.siteStoryV61 ?? null;
        after = data.story;
        // Private source answers never write or approve website content.
        nextMetadata = { ...metadata, siteStoryV61: {
          schemaVersion: 1, revision: "", answers: data.story,
          changedByPersonId: actor.actorPersonId!, updatedAt: "", status: "private_source" as const,
        } };
      }
      if (site.updatedAt.toISOString() !== data.expectedRevision)
        throw new Error("Site Information changed since you opened it. Reload and review before saving.");
      if (JSON.stringify(before) === JSON.stringify(after) &&
          data.section !== "story")
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
        before: { value: before as object | null },
        after: { value: after as object, selfReported: true, publicApproved: false },
      });
      return { siteId: site.id, revision: saved.updatedAt.toISOString(), updated: true };
    });
  });

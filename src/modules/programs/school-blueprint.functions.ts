import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  sites, siteBlueprints, siteBlueprintRevisions, siteProgramPlans, siteBlueprintItems,
  blueprintCatalogItems, blueprintCatalogItemVersions, religiousAffiliationOptions,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { schoolBlueprintIdentitySchema } from "@/domain/school-blueprint";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

const uuid = z.string().uuid();
const selection = z.object({ siteId: uuid }).strict();
const expected = z.number().int().min(0);
const saveIdentity = selection.extend({
  expectedRevision: expected,
  identity: schoolBlueprintIdentitySchema,
}).strict();
const addTemplate = selection.extend({
  expectedRevision: expected,
  catalogCode: z.string().min(5).max(140).regex(/^can\.(program|community|experience|club|activity)\.[a-z0-9_]+$/),
}).strict();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

/** Caller-supplied Site IDs are never a grant. Read the Site and recheck the active scope. */
async function requireBlueprintSite(actor: AccessContext, tx: Reader, siteId: string, capability: string) {
  assertCapability(actor, capability);
  if (!hasRegistrarAuthority(actor.role) || !actor.actorPersonId)
    throw new AuthorizationError("verified school Site administrator");
  const [site] = await tx.select({
    id: sites.id, organizationId: sites.organizationId,
    name: sites.name, timezone: sites.timezone,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site || !actor.scope.siteIds?.includes(site.id) ||
      !actor.scope.organizationIds?.includes(site.organizationId))
    throw new AuthorizationError("authorized school Site");
  return site;
}

async function loadSitePlans(tx: Reader, siteId: string) {
  const [programs, items] = await Promise.all([
    tx.select().from(siteProgramPlans)
      .where(and(eq(siteProgramPlans.siteId, siteId), ne(siteProgramPlans.status, "retired")))
      .orderBy(asc(siteProgramPlans.createdAt)),
    tx.select().from(siteBlueprintItems)
      .where(and(eq(siteBlueprintItems.siteId, siteId), ne(siteBlueprintItems.status, "retired")))
      .orderBy(asc(siteBlueprintItems.createdAt)),
  ]);
  return { programs, items };
}

/** All Blueprint saves lock the canonical Site row before revision allocation. */
async function lockBlueprint(tx: Tx, actor: AccessContext, siteId: string, expectedRevision: number) {
  const site = await requireBlueprintSite(actor, tx, siteId, "program.launch.start");
  await tx.select({ id: sites.id }).from(sites)
    .where(eq(sites.id, siteId)).for("update").limit(1);
  const [head] = await tx.select().from(siteBlueprints)
    .where(eq(siteBlueprints.siteId, siteId)).limit(1);
  const revision = head?.currentRevision ?? 0;
  if (revision !== expectedRevision)
    throw new DomainError("CONFLICT", "School Blueprint was updated in another session. Reload before saving.");
  return { site, head, revision };
}

async function appendBlueprintRevision(
  tx: Tx, actor: AccessContext, input: {
    siteId: string; organizationId: string; previousRevision: number;
    identity: { religiousAffiliationCode: string | null; editorialIdentity: string; culturalContext: Record<string, unknown> };
    change: Record<string, unknown>;
  },
) {
  const revision = input.previousRevision + 1;
  const plans = await loadSitePlans(tx, input.siteId);
  await tx.insert(siteBlueprintRevisions).values({
    siteId: input.siteId, revision, schemaVersion: 1,
    snapshot: {
      identity: input.identity,
      programPlanIds: plans.programs.map(p => p.id),
      itemIds: plans.items.map(i => i.id),
      change: input.change,
    },
    createdByPersonId: actor.actorPersonId!,
  });
  await tx.update(siteBlueprints).set({
    currentRevision: revision, status: "draft", updatedAt: new Date(),
    updatedByPersonId: actor.actorPersonId!,
  }).where(eq(siteBlueprints.siteId, input.siteId));
  await writeAudit(tx, actor, {
    action: "school.blueprint.revision.save", entityType: "site_blueprint",
    entityId: input.siteId, scope: { organizationId: input.organizationId, siteId: input.siteId },
    after: { revision, change: input.change },
  });
  await emitEvent(tx, {
    eventType: "SchoolBlueprintRevisionSaved", aggregateType: "SiteBlueprint",
    aggregateId: input.siteId, actorPersonId: actor.actorPersonId!,
    organizationId: input.organizationId, siteId: input.siteId,
    payload: { revision, change: input.change },
  });
  return revision;
}

/** Private planning inventory. Does not expose family information or create public pages. */
export const getSiteBlueprintWorkspace = createServerFn({ method: "GET" })
  .validator((value: unknown) => selection.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    const site = await requireBlueprintSite(actor, db, data.siteId, "program.read");
    const [head, plans, catalogRows, affiliations] = await Promise.all([
      db.select().from(siteBlueprints).where(eq(siteBlueprints.siteId, site.id)).limit(1),
      loadSitePlans(db, site.id),
      db.select({ item: blueprintCatalogItems, version: blueprintCatalogItemVersions })
        .from(blueprintCatalogItems)
        .innerJoin(blueprintCatalogItemVersions, eq(blueprintCatalogItemVersions.itemId, blueprintCatalogItems.id))
        .where(eq(blueprintCatalogItems.status, "available"))
        .orderBy(asc(blueprintCatalogItems.sortOrder), desc(blueprintCatalogItemVersions.version)),
      db.select().from(religiousAffiliationOptions)
        .where(eq(religiousAffiliationOptions.active, true))
        .orderBy(asc(religiousAffiliationOptions.sortOrder)),
    ]);
    const versions = new Set<string>();
    const catalog = catalogRows.filter(row => {
      if (versions.has(row.item.id)) return false;
      versions.add(row.item.id);
      return true;
    }).map(({ item, version }) => ({
      id: item.id, code: item.code, kind: item.kind, category: item.category,
      name: item.name, summary: item.summary, versionId: version.id,
      version: version.version, gradeRange: version.gradeRange,
      scheduleSuggestion: version.scheduleSuggestion, requirements: version.configuration.requirements ?? [],
    }));
    return {
      site, revision: head[0]?.currentRevision ?? 0,
      identity: {
        religiousAffiliationCode: head[0]?.religiousAffiliationCode ?? null,
        editorialIdentity: head[0]?.editorialIdentity ?? "community_belonging",
        culturalContext: head[0]?.culturalContext ?? {},
      },
      catalog, affiliations, ...plans,
    };
  });

export const saveSiteBlueprintIdentity = createServerFn({ method: "POST" })
  .validator((value: unknown) => saveIdentity.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    return db.transaction(async tx => {
      const { site, head, revision } = await lockBlueprint(tx, actor, data.siteId, data.expectedRevision);
      if (data.identity.religiousAffiliationCode !== null) {
        const [option] = await tx.select({ code: religiousAffiliationOptions.code })
          .from(religiousAffiliationOptions)
          .where(and(eq(religiousAffiliationOptions.code, data.identity.religiousAffiliationCode),
            eq(religiousAffiliationOptions.active, true))).limit(1);
        if (!option) throw new DomainError("VALIDATION_FAILED", "Select a listed religious affiliation.");
      }
      const identity = data.identity;
      if (!head) {
        await tx.insert(siteBlueprints).values({
          siteId: site.id, religiousAffiliationCode: identity.religiousAffiliationCode,
          editorialIdentity: identity.editorialIdentity, culturalContext: identity.culturalContext,
          createdByPersonId: actor.actorPersonId!, updatedByPersonId: actor.actorPersonId!,
        });
      } else {
        await tx.update(siteBlueprints).set({
          religiousAffiliationCode: identity.religiousAffiliationCode,
          editorialIdentity: identity.editorialIdentity, culturalContext: identity.culturalContext,
        }).where(eq(siteBlueprints.siteId, site.id));
      }
      const next = await appendBlueprintRevision(tx, actor, {
        siteId: site.id, organizationId: site.organizationId, previousRevision: revision,
        identity, change: { operation: "identity_updated" },
      });
      return { changed: true, revision: next };
    });
  });

/** Select exactly one approved reference version into private Site planning. */
export const addSiteBlueprintTemplate = createServerFn({ method: "POST" })
  .validator((value: unknown) => addTemplate.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    return db.transaction(async tx => {
      const { site, head, revision } = await lockBlueprint(tx, actor, data.siteId, data.expectedRevision);
      const [source] = await tx.select({
        item: blueprintCatalogItems, version: blueprintCatalogItemVersions,
      }).from(blueprintCatalogItems)
        .innerJoin(blueprintCatalogItemVersions, eq(blueprintCatalogItemVersions.itemId, blueprintCatalogItems.id))
        .where(and(eq(blueprintCatalogItems.code, data.catalogCode),
          eq(blueprintCatalogItems.status, "available")))
        .orderBy(desc(blueprintCatalogItemVersions.version)).limit(1);
      if (!source) throw new DomainError("VALIDATION_FAILED", "This library reference is unavailable.");
      if (!head) await tx.insert(siteBlueprints).values({
        siteId: site.id, createdByPersonId: actor.actorPersonId!,
        updatedByPersonId: actor.actorPersonId!,
      });
      const plan = await loadSitePlans(tx, site.id);
      const alreadySelected = source.item.kind === "program"
        ? plan.programs.some(p => p.catalogVersionId === source.version.id)
        : plan.items.some(p => p.catalogVersionId === source.version.id);
      if (alreadySelected) return { changed: false, revision, reason: "already_selected" as const };
      if (source.item.kind === "program") {
        await tx.insert(siteProgramPlans).values({
          siteId: site.id, catalogVersionId: source.version.id,
          name: source.item.name, kind: source.item.code.split(".").at(-1) ?? "program",
          gradeRange: source.version.gradeRange,
          createdByPersonId: actor.actorPersonId!,
        });
      } else if (["community", "experience", "club", "activity"].includes(source.item.kind)) {
        await tx.insert(siteBlueprintItems).values({
          siteId: site.id, catalogVersionId: source.version.id,
          kind: source.item.kind, title: source.item.name, summary: source.item.summary,
          configuration: { sourceVersion: source.version.version },
          createdByPersonId: actor.actorPersonId!,
        });
      } else {
        throw new DomainError("VALIDATION_FAILED", "Unrecognized library reference kind.");
      }
      const next = await appendBlueprintRevision(tx, actor, {
        siteId: site.id, organizationId: site.organizationId, previousRevision: revision,
        identity: {
          religiousAffiliationCode: head?.religiousAffiliationCode ?? null,
          editorialIdentity: head?.editorialIdentity ?? "community_belonging",
          culturalContext: head?.culturalContext ?? {},
        },
        change: { operation: "catalog_reference_selected", catalogCode: source.item.code,
          catalogVersion: source.version.version },
      });
      return { changed: true, revision: next };
    });
  });

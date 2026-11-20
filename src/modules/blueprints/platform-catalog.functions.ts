import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccounts, organizations, auditEvents } from "@/db/schema";
import {
  blueprintReferenceItems, blueprintReferenceItemVersions,
  blueprints, blueprintVersions, blueprintComponents,
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { getIdentityContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";
import {
  mayApprovePlatformVersion, platformCatalogDecisionSchema,
  savePlatformProgramSchema, savePlatformBlueprintSchema,
} from "@/domain/platform-catalog";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PlatformContext = Awaited<ReturnType<typeof getIdentityContext>>;
type CatalogKind = "program" | "blueprint";
const auditResource = {
  program: "platform_program_version",
  blueprint: "platform_blueprint_version",
} as const;

/**
 * One account-wide CAN App Admin is the human authorization. No Site grant,
 * canonical reviewer persona or per-Organization PostgreSQL role is minted.
 * Publication still requires a different verified App Admin's review.
 */
async function currentPlatformActor(capability: "catalog.platform.manage" | "blueprint.template.manage"): Promise<PlatformContext> {
  const actor = await getIdentityContext(getRequest());
  assertCapability(actor, "platform.admin");
  assertCapability(actor, capability);
  if (actor.role !== "app_admin" || actor.sessionAccountId ||
      !actor.accountId || !actor.actorPersonId || actor.grantSiteId ||
      (actor.scope.organizationIds?.length ?? 0) !== 0 ||
      (actor.scope.siteIds?.length ?? 0) !== 0) {
    throw new AuthorizationError("verified account-wide App Admin");
  }
  const [account] = await db.select({
    personId: accessAccounts.personId,
    verifiedAt: accessAccounts.emailVerifiedAt,
    disabled: accessAccounts.disabled,
    email: accessAccounts.emailNormalized,
  }).from(accessAccounts).where(eq(accessAccounts.id, actor.accountId)).limit(1);
  if (!account || !account.verifiedAt || account.disabled ||
      account.personId !== actor.actorPersonId || isDemoAccountEmail(account.email)) {
    throw new AuthorizationError("verified non-demo App Admin");
  }
  return actor;
}

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
}

/**
 * Blueprint recipe ownership is a publishing identity, not the App Admin's
 * institution. Never accept a publisher Organization ID from the browser or
 * silently claim partner-owned templates. This setting is optional for reads.
 */
async function platformPublisher(tx: Tx): Promise<string> {
  const id = process.env.CAN_PLATFORM_CATALOG_PUBLISHER_ORGANIZATION_ID;
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw new AuthorizationError("configured CAN platform catalog publisher");
  }
  const [org] = await tx.select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, id), eq(organizations.type, "can_network"),
      eq(organizations.lifecycleStatus, "active"))).limit(1);
  if (!org) throw new AuthorizationError("approved active CAN platform publisher");
  return org.id;
}

async function latestProgram(tx: Tx, itemId: string) {
  const [version] = await tx.select().from(blueprintReferenceItemVersions)
    .where(eq(blueprintReferenceItemVersions.itemId, itemId))
    .orderBy(desc(blueprintReferenceItemVersions.versionNo)).limit(1);
  return version;
}

async function latestBlueprint(tx: Tx, blueprintId: string) {
  const [version] = await tx.select().from(blueprintVersions)
    .where(eq(blueprintVersions.blueprintId, blueprintId))
    .orderBy(desc(blueprintVersions.versionNo)).limit(1);
  return version;
}

/** Listing is a platform inventory, not an institutional approval or adoption. */
export const listPlatformCatalogDefinitions = createServerFn({ method: "GET" })
  .handler(async () => {
    noStore();
    await currentPlatformActor("catalog.platform.manage");
    const [references, recipes] = await Promise.all([
      db.select({
        id: blueprintReferenceItems.id, code: blueprintReferenceItems.code,
        category: blueprintReferenceItems.category, status: blueprintReferenceItems.status,
        versionId: blueprintReferenceItemVersions.id,
        versionNo: blueprintReferenceItemVersions.versionNo,
        lifecycle: blueprintReferenceItemVersions.lifecycle,
        title: blueprintReferenceItemVersions.title,
        summary: blueprintReferenceItemVersions.summary,
        description: blueprintReferenceItemVersions.description,
      }).from(blueprintReferenceItems)
        .innerJoin(blueprintReferenceItemVersions,
          eq(blueprintReferenceItems.id, blueprintReferenceItemVersions.itemId))
        .where(eq(blueprintReferenceItems.referenceKind, "program_model"))
        .orderBy(asc(blueprintReferenceItems.code), desc(blueprintReferenceItemVersions.versionNo)),
      db.select({
        id: blueprints.id, code: blueprints.code, title: blueprints.title,
        status: blueprints.status, publisherOrganizationId: blueprints.publisherOrganizationId,
        versionId: blueprintVersions.id, versionNo: blueprintVersions.versionNo,
        lifecycle: blueprintVersions.lifecycle,
      }).from(blueprints)
        .innerJoin(blueprintVersions, eq(blueprintVersions.blueprintId, blueprints.id))
        .orderBy(asc(blueprints.code), desc(blueprintVersions.versionNo)),
    ]);
    const known = new Set<string>();
    const programModels = references.filter(item => {
      if (known.has(item.id)) return false;
      known.add(item.id);
      return true;
    });
    const blueprintIds = new Set<string>();
    const blueprintRecipes = recipes.filter(item => {
      if (blueprintIds.has(item.id)) return false;
      blueprintIds.add(item.id);
      return true;
    }).map(item => ({
      ...item,
      managedByPlatform: item.publisherOrganizationId ===
        process.env.CAN_PLATFORM_CATALOG_PUBLISHER_ORGANIZATION_ID,
    }));
    return { programModels, blueprintRecipes };
  });

export const readPlatformBlueprintTemplate = createServerFn({ method: "GET" })
  .validator((raw: unknown) => z.object({ versionId: z.string().uuid() }).strict().parse(raw))
  .handler(async ({ data }) => {
    noStore();
    await currentPlatformActor("blueprint.template.manage");
    const [row] = await db.select({
      code: blueprints.code, title: blueprints.title,
      publisherOrganizationId: blueprints.publisherOrganizationId,
      versionNo: blueprintVersions.versionNo,
      targetKind: blueprintVersions.targetKind,
      spec: blueprintVersions.spec,
    }).from(blueprintVersions)
      .innerJoin(blueprints, eq(blueprints.id, blueprintVersions.blueprintId))
      .where(eq(blueprintVersions.id, data.versionId)).limit(1);
    if (!row || row.publisherOrganizationId !==
        process.env.CAN_PLATFORM_CATALOG_PUBLISHER_ORGANIZATION_ID) {
      throw new AuthorizationError("platform-owned Blueprint template");
    }
    const components = await db.select({
      key: blueprintComponents.componentKey,
      kind: blueprintComponents.componentKind,
      requirementMode: blueprintComponents.requirementMode,
      componentSpec: blueprintComponents.componentSpec,
    }).from(blueprintComponents)
      .where(eq(blueprintComponents.blueprintVersionId, data.versionId))
      .orderBy(asc(blueprintComponents.componentKey));
    const spec = row.spec as Record<string, unknown>;
    return {
      code: row.code, title: row.title, versionNo: row.versionNo,
      targetKind: row.targetKind,
      programCode: typeof spec.programCode === "string" ? spec.programCode : "",
      offeringCode: typeof spec.offeringCode === "string" ? spec.offeringCode : "",
      components: components.map(component => {
        const value = component.componentSpec &&
          typeof component.componentSpec === "object" &&
          !Array.isArray(component.componentSpec)
          ? component.componentSpec as Record<string, unknown> : {};
        return {
          key: component.key, kind: component.kind,
          requirementMode: component.requirementMode,
          description: typeof value.description === "string" ? value.description : "",
        };
      }),
    };
  });

export const savePlatformProgramDraft = createServerFn({ method: "POST" })
  .validator((raw: unknown) => savePlatformProgramSchema.parse(raw))
  .handler(async ({ data }) => {
    noStore();
    const actor = await currentPlatformActor("catalog.platform.manage");
    if (!data.code.startsWith("can.program.")) throw new AuthorizationError("CAN Program namespace");
    return db.transaction(async tx => {
      const [existing] = await tx.select().from(blueprintReferenceItems)
        .where(eq(blueprintReferenceItems.code, data.code)).limit(1);
      if (existing && (existing.referenceKind !== "program_model" ||
          existing.status !== "active" || existing.category !== data.category)) {
        throw new AuthorizationError("existing CAN Program definition");
      }
      const latest = existing ? await latestProgram(tx, existing.id) : undefined;
      if ((latest?.versionNo ?? 0) !== data.expectedVersion) {
        throw new Error("Program has changed. Refresh before saving a new version.");
      }
      const item = existing ?? (await tx.insert(blueprintReferenceItems).values({
        code: data.code, referenceKind: "program_model", category: data.category,
        status: "active",
      }).returning())[0];
      if (!item) throw new Error("Program item could not be created");
      const [version] = await tx.insert(blueprintReferenceItemVersions).values({
        itemId: item.id, versionNo: data.expectedVersion + 1,
        title: data.title, summary: data.summary, description: data.description,
        lifecycle: "draft", publishedAt: null,
      }).returning({ id: blueprintReferenceItemVersions.id });
      if (!version) throw new Error("Program draft could not be created");
      await writeAudit(tx, actor, {
        action: "platform.catalog.version.created", entityType: auditResource.program,
        entityId: version.id, after: { code: data.code, versionNo: data.expectedVersion + 1 },
      });
      return { versionId: version.id, versionNo: data.expectedVersion + 1, lifecycle: "draft" as const };
    });
  });

export const savePlatformBlueprintDraft = createServerFn({ method: "POST" })
  .validator((raw: unknown) => savePlatformBlueprintSchema.parse(raw))
  .handler(async ({ data }) => {
    noStore();
    const actor = await currentPlatformActor("blueprint.template.manage");
    if (!data.code.startsWith("can.")) throw new AuthorizationError("CAN Blueprint namespace");
    return db.transaction(async tx => {
      const publisher = await platformPublisher(tx);
      const [program] = await tx.select({ id: blueprintReferenceItems.id })
        .from(blueprintReferenceItems)
        .innerJoin(blueprintReferenceItemVersions,
          eq(blueprintReferenceItemVersions.itemId, blueprintReferenceItems.id))
        .where(and(eq(blueprintReferenceItems.code, data.programCode),
          eq(blueprintReferenceItems.referenceKind, "program_model"),
          eq(blueprintReferenceItems.status, "active"),
          eq(blueprintReferenceItemVersions.lifecycle, "published"))).limit(1);
      if (!program) throw new Error("Create a published Program reference before its Blueprint.");
      const [existing] = await tx.select().from(blueprints)
        .where(and(eq(blueprints.publisherOrganizationId, publisher),
          eq(blueprints.code, data.code))).limit(1);
      // Do not silently overwrite a differently owned publisher's Blueprint.
      const [foreign] = await tx.select({ id: blueprints.id }).from(blueprints)
        .where(eq(blueprints.code, data.code)).limit(1);
      if (!existing && foreign) throw new AuthorizationError("Blueprint is owned by another publisher");
      if (existing?.status === "retired") throw new AuthorizationError("retired Blueprint");
      const latest = existing ? await latestBlueprint(tx, existing.id) : undefined;
      if ((latest?.versionNo ?? 0) !== data.expectedVersion) {
        throw new Error("Blueprint has changed. Refresh before saving a new version.");
      }
      const item = existing ?? (await tx.insert(blueprints).values({
        code: data.code, title: data.title,
        publisherOrganizationId: publisher, status: "active",
      }).returning())[0];
      if (!item) throw new Error("Blueprint could not be created");
      // Published recipe titles are canonical and remain stable. A new version
      // can change components/spec but not silently relabel the existing recipe.
      if (existing && existing.title !== data.title) {
        throw new Error("An existing Blueprint title cannot be changed by a version draft.");
      }
      // Preserve versioned recipe metadata and component requirements that the
      // compact App Admin form does not expose. Editing must never erase
      // compatibility, facilities, safety, or publisher-authored guidance.
      const formerSpec = latest?.spec &&
        typeof latest.spec === "object" && !Array.isArray(latest.spec)
          ? latest.spec : {};
      const formerComponents = latest
        ? await tx.select({
            key: blueprintComponents.componentKey,
            componentSpec: blueprintComponents.componentSpec,
          }).from(blueprintComponents)
            .where(eq(blueprintComponents.blueprintVersionId, latest.id))
        : [];
      const componentSpecByKey = new Map(formerComponents.map(component => [
        component.key,
        component.componentSpec &&
        typeof component.componentSpec === "object" && !Array.isArray(component.componentSpec)
          ? component.componentSpec : {},
      ]));
      const spec = { ...formerSpec, programCode: data.programCode,
        ...(data.offeringCode ? { offeringCode: data.offeringCode } : {}) };
      if (!data.offeringCode) delete spec.offeringCode;
      const [version] = await tx.insert(blueprintVersions).values({
        blueprintId: item.id, versionNo: data.expectedVersion + 1,
        targetKind: data.targetKind, spec,
        lifecycle: "draft", publishedAt: null,
      }).returning({ id: blueprintVersions.id });
      if (!version) throw new Error("Blueprint draft could not be created");
      await tx.insert(blueprintComponents).values(data.components.map(component => ({
        blueprintVersionId: version.id,
        componentKey: component.key,
        componentKind: component.kind,
        requirementMode: component.requirementMode,
        componentSpec: {
          ...(componentSpecByKey.get(component.key) ?? {}),
          description: component.description,
        },
      })));
      await writeAudit(tx, actor, {
        action: "platform.catalog.version.created", entityType: auditResource.blueprint,
        entityId: version.id, scope: { organizationId: publisher },
        after: { code: data.code, versionNo: data.expectedVersion + 1 },
      });
      return { versionId: version.id, versionNo: data.expectedVersion + 1, lifecycle: "draft" as const };
    });
  });

async function draftVersion(tx: Tx, kind: CatalogKind, id: string) {
  if (kind === "program") {
    const [version] = await tx.select({ id: blueprintReferenceItemVersions.id,
      lifecycle: blueprintReferenceItemVersions.lifecycle,
      itemId: blueprintReferenceItemVersions.itemId,
      versionNo: blueprintReferenceItemVersions.versionNo,
    }).from(blueprintReferenceItemVersions)
      .innerJoin(blueprintReferenceItems,
        eq(blueprintReferenceItems.id, blueprintReferenceItemVersions.itemId))
      .where(and(eq(blueprintReferenceItemVersions.id, id),
        eq(blueprintReferenceItems.referenceKind, "program_model"),
        eq(blueprintReferenceItems.status, "active"))).limit(1);
    if (!version || (await latestProgram(tx, version.itemId))?.id !== id) return undefined;
    return version;
  }
  const publisher = await platformPublisher(tx);
  const [version] = await tx.select({ id: blueprintVersions.id,
    lifecycle: blueprintVersions.lifecycle,
    blueprintId: blueprintVersions.blueprintId,
    versionNo: blueprintVersions.versionNo,
  }).from(blueprintVersions)
    .innerJoin(blueprints, eq(blueprints.id, blueprintVersions.blueprintId))
    .where(and(eq(blueprintVersions.id, id),
      eq(blueprints.publisherOrganizationId, publisher),
      eq(blueprints.status, "active"))).limit(1);
  if (!version || (await latestBlueprint(tx, version.blueprintId))?.id !== id) return undefined;
  return version;
}

async function versionAudit(tx: Tx, kind: CatalogKind, versionId: string, action: string) {
  const [entry] = await tx.select({ actorPersonId: auditEvents.actorPersonId })
    .from(auditEvents)
    .where(and(eq(auditEvents.resourceType, auditResource[kind]),
      eq(auditEvents.resourceId, versionId), eq(auditEvents.action, action)))
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id)).limit(1);
  return entry?.actorPersonId ?? null;
}

export const approvePlatformCatalogDraft = createServerFn({ method: "POST" })
  .validator((raw: unknown) => platformCatalogDecisionSchema.parse(raw))
  .handler(async ({ data }) => {
    noStore();
    const actor = await currentPlatformActor(data.kind === "program"
      ? "catalog.platform.manage" : "blueprint.template.manage");
    return db.transaction(async tx => {
      const draft = await draftVersion(tx, data.kind, data.versionId);
      if (!draft || draft.lifecycle !== "draft") throw new Error("Draft is unavailable for review.");
      const authorId = await versionAudit(tx, data.kind, data.versionId,
        "platform.catalog.version.created");
      if (!mayApprovePlatformVersion(authorId, actor.actorPersonId)) {
        throw new AuthorizationError("separate verified catalog reviewer");
      }
      if (await versionAudit(tx, data.kind, data.versionId, "platform.catalog.plan.approved")) {
        return { approved: true, alreadyApproved: true };
      }
      await writeAudit(tx, actor, {
        action: "platform.catalog.plan.approved", entityType: auditResource[data.kind],
        entityId: data.versionId,
        after: { planningOnly: true, authorId },
      });
      return { approved: true, alreadyApproved: false };
    });
  });

export const publishPlatformCatalogVersion = createServerFn({ method: "POST" })
  .validator((raw: unknown) => platformCatalogDecisionSchema.parse(raw))
  .handler(async ({ data }) => {
    noStore();
    const actor = await currentPlatformActor(data.kind === "program"
      ? "catalog.platform.manage" : "blueprint.template.manage");
    return db.transaction(async tx => {
      const draft = await draftVersion(tx, data.kind, data.versionId);
      if (!draft || draft.lifecycle !== "draft") throw new Error("Draft is unavailable for publication.");
      const authorId = await versionAudit(tx, data.kind, data.versionId,
        "platform.catalog.version.created");
      const reviewerId = await versionAudit(tx, data.kind, data.versionId,
        "platform.catalog.plan.approved");
      if (!mayApprovePlatformVersion(authorId, reviewerId)) {
        throw new AuthorizationError("independent documented planning review");
      }
      const updated = data.kind === "program"
        ? await tx.update(blueprintReferenceItemVersions)
            .set({ lifecycle: "published", publishedAt: new Date() })
            .where(and(eq(blueprintReferenceItemVersions.id, data.versionId),
              eq(blueprintReferenceItemVersions.lifecycle, "draft")))
            .returning({ id: blueprintReferenceItemVersions.id })
        : await tx.update(blueprintVersions)
            .set({ lifecycle: "published", publishedAt: new Date() })
            .where(and(eq(blueprintVersions.id, data.versionId),
              eq(blueprintVersions.lifecycle, "draft")))
            .returning({ id: blueprintVersions.id });
      if (updated.length !== 1) throw new Error("Draft was already published or changed.");
      await writeAudit(tx, actor, {
        action: "platform.catalog.version.published", entityType: auditResource[data.kind],
        entityId: data.versionId, after: { planningOnly: true, reviewedBy: reviewerId },
      });
      return { published: true };
    });
  });

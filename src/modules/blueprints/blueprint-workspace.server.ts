import { isCanonicalSiteDiscoverable, isPrivateCanSitePlanningAllowed } from "@/domain/canonical-site-availability";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  blueprintComponents,
  blueprintConfigurationVersions,
  blueprintConfigurations,
  blueprintVersions,
  blueprints,
  catalogSites,
  siteOrganizationRoles,
  religiousAffiliationOptions,
  educationOperations,
  educationOperationSites,
  educationOperationOrganizationRoles,
  offerings,
  offeringVersions,
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { blueprintDatabaseRole } from "@/domain/blueprint-database-role";
import { selectBlueprintWorkspaceRecipes } from "@/domain/blueprint-configuration";
import { publicSolutionComponentDescription } from "@/domain/public-solution-component";
import { assertVerifiedCanPlanningSite, isVerifiedCanSitePlanning } from "./verified-site-planning.server";
import { z } from "zod";

export const blueprintWorkspaceInputSchema = z.object({
  siteId: z.string().uuid(),
}).strict();

/**
 * Site-scoped planning surface. A canonical Blueprint configuration belongs to
 * an Organization; the version's config.siteId identifies the Site that owns
 * this particular planning draft, without treating the Site as its publisher.
 */
export async function getCanonicalBlueprintWorkspace(
  context: CommandContext,
  rawInput: unknown,
) {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  // This workspace exposes local configuration drafts and planning operations.
  // It is not CAN's publisher authoring Studio. The legacy blueprint_author
  // SQL role may write Site configuration versions, never Blueprint definitions.
  // Read-only publisher discovery must use its separately scoped catalog service.
  assertCapability(context, "blueprint.read");
  assertCapability(context, "blueprint.configure");
  const { siteId } = blueprintWorkspaceInputSchema.parse(rawInput);
  if (!context.scope.siteIds?.includes(siteId)) {
    throw new AuthorizationError("Blueprint workspace Site scope");
  }

  const isCanPlanning = isVerifiedCanSitePlanning(context);
  const databaseRole = isCanPlanning ? null : blueprintDatabaseRole(context, "blueprint_author");
  return db.transaction(async tx => {
    if (databaseRole) await tx.execute(sql.raw(`SET LOCAL ROLE ${databaseRole}`));
    const [site] = await tx.select({ id: catalogSites.id, status: catalogSites.status })
      .from(catalogSites).where(eq(catalogSites.id, siteId)).limit(1);
    if (!site || (isCanPlanning
      ? !isPrivateCanSitePlanningAllowed(site.status)
      : !isCanonicalSiteDiscoverable(site.status))) {
      throw new DomainError("UNAVAILABLE", "The selected canonical Site is unavailable.");
    }
    const now = new Date();
    const organizationIds = context.scope.organizationIds ?? [];
    if (organizationIds.length !== 1) throw new AuthorizationError("one Blueprint Organization scope");
    // The verified CAN Site owner needs no second canonical operator grant.
    // An independently delegated canonical operator still uses the existing
    // purpose-scoped role and current operator relationship below.
    const organizationId = isCanPlanning
      ? await assertVerifiedCanPlanningSite(tx, context, siteId)
      : (await tx.select({
          organizationId: siteOrganizationRoles.organizationId,
        }).from(siteOrganizationRoles).where(and(
          eq(siteOrganizationRoles.siteId, siteId),
          eq(siteOrganizationRoles.roleCode, "operator"),
          inArray(siteOrganizationRoles.organizationId, organizationIds),
          lte(siteOrganizationRoles.validFrom, now),
          or(isNull(siteOrganizationRoles.validThrough), gt(siteOrganizationRoles.validThrough, now)),
        )).limit(1))[0]?.organizationId;
    if (!organizationId) throw new AuthorizationError("current Blueprint Site authority");

    const [recipes, configurations, affiliations, operations] = await Promise.all([
      tx.select({
        blueprintId: blueprints.id,
        title: blueprints.title,
        publisherOrganizationId: blueprints.publisherOrganizationId,
        blueprintVersionId: blueprintVersions.id,
        versionNo: blueprintVersions.versionNo,
        spec: blueprintVersions.spec,
      }).from(blueprints)
        .innerJoin(blueprintVersions, eq(blueprintVersions.blueprintId, blueprints.id))
        .where(and(
          eq(blueprints.status, "active"),
          eq(blueprintVersions.lifecycle, "published"),
        )).orderBy(asc(blueprints.title), desc(blueprintVersions.versionNo)),
      tx.select({
        id: blueprintConfigurations.id,
        name: blueprintConfigurations.name,
      }).from(blueprintConfigurations)
        .where(eq(blueprintConfigurations.owningOrganizationId, organizationId))
        .orderBy(asc(blueprintConfigurations.name)),
      tx.select({
        code: religiousAffiliationOptions.code,
        label: religiousAffiliationOptions.label,
      }).from(religiousAffiliationOptions)
        .where(eq(religiousAffiliationOptions.active, true))
        .orderBy(asc(religiousAffiliationOptions.sortOrder)),
      tx.select({
        id: educationOperations.id,
        name: educationOperations.name,
      }).from(educationOperations)
        .innerJoin(educationOperationOrganizationRoles,
          eq(educationOperationOrganizationRoles.operationId, educationOperations.id))
        .innerJoin(educationOperationSites,
          eq(educationOperationSites.operationId, educationOperations.id))
        .where(and(
          eq(educationOperationSites.siteId, siteId),
          lte(educationOperationSites.validFrom, now),
          or(isNull(educationOperationSites.validThrough),
            gt(educationOperationSites.validThrough, now)),
          eq(educationOperationOrganizationRoles.organizationId, organizationId),
          eq(educationOperationOrganizationRoles.roleCode, "operator"),
          eq(educationOperationOrganizationRoles.status, "approved"),
          lte(educationOperationOrganizationRoles.validFrom, now),
          or(isNull(educationOperationOrganizationRoles.validThrough),
            gt(educationOperationOrganizationRoles.validThrough, now)),
          inArray(educationOperations.status, ["planning", "active", "paused"]),
        ))
        .orderBy(asc(educationOperations.name)),
    ]);
    // Read saved configuration versions before choosing recipe templates. An
    // existing Site plan must remain openable after CAN publishes a newer
    // recipe version for the same Blueprint.
    const versions = configurations.length
      ? await tx.select({
          configurationId: blueprintConfigurationVersions.configurationId,
          id: blueprintConfigurationVersions.id,
          revision: blueprintConfigurationVersions.revision,
          lifecycle: blueprintConfigurationVersions.lifecycle,
          blueprintVersionId: blueprintConfigurationVersions.blueprintVersionId,
          config: blueprintConfigurationVersions.config,
        }).from(blueprintConfigurationVersions)
          .where(inArray(blueprintConfigurationVersions.configurationId,
            configurations.map(configuration => configuration.id)))
          .orderBy(desc(blueprintConfigurationVersions.revision))
      : [];
    const latestByConfiguration = new Map<string, (typeof versions)[number]>();
    for (const version of versions) {
      if (!latestByConfiguration.has(version.configurationId)) {
        latestByConfiguration.set(version.configurationId, version);
      }
    }
    const savedRecipeVersionIds = new Set(
      [...latestByConfiguration.values()]
        .filter(version => version.config && typeof version.config === "object"
          && !Array.isArray(version.config) && version.config.siteId === siteId)
        .map(version => version.blueprintVersionId),
    );
    const templates = selectBlueprintWorkspaceRecipes(recipes, savedRecipeVersionIds);
    const linkedCodes = [...new Set(templates.flatMap(template => {
      const spec = template.spec;
      if (!spec || typeof spec !== "object" || Array.isArray(spec)) return [];
      const code = (spec as Record<string, unknown>).offeringCode;
      return typeof code === "string" && code.trim() ? [code] : [];
    }))];
    const linkedPublishers = [...new Set(templates.map(template => template.publisherOrganizationId))];
    const linkedPublishedProducts = linkedCodes.length
      ? await tx.select({
          publisherOrganizationId: offerings.publisherOrganizationId,
          code: offerings.code,
          title: offerings.title,
          offeringVersionId: offeringVersions.id,
          versionNo: offeringVersions.versionNo,
        }).from(offerings)
          .innerJoin(offeringVersions, eq(offeringVersions.offeringId, offerings.id))
          .where(and(
            inArray(offerings.code, linkedCodes),
            inArray(offerings.publisherOrganizationId, linkedPublishers),
            eq(offerings.status, "active"),
            eq(offeringVersions.lifecycle, "published"),
          )).orderBy(desc(offeringVersions.versionNo))
      : [];
    const linkedByPublisherAndCode = new Map<string, (typeof linkedPublishedProducts)[number]>();
    for (const product of linkedPublishedProducts) {
      const lookupKey = product.publisherOrganizationId + ":" + product.code;
      if (!linkedByPublisherAndCode.has(lookupKey))
        linkedByPublisherAndCode.set(lookupKey, product);
    }
    const components = templates.length
      ? await tx.select({
          id: blueprintComponents.id,
          blueprintVersionId: blueprintComponents.blueprintVersionId,
          key: blueprintComponents.componentKey,
          kind: blueprintComponents.componentKind,
          requirementMode: blueprintComponents.requirementMode,
          componentSpec: blueprintComponents.componentSpec,
        }).from(blueprintComponents)
          .where(inArray(blueprintComponents.blueprintVersionId,
            templates.map(template => template.blueprintVersionId)))
          .orderBy(asc(blueprintComponents.componentKey))
      : [];
    return {
      siteId,
      organizationId,
      canConfigure: context.capabilities.has("blueprint.configure"),
      canReview: context.capabilities.has("blueprint.review"),
      canExecute: context.capabilities.has("blueprint.execute"),
      affiliations,
      operations: [...new Map(operations.map(operation => [operation.id, operation])).values()],
      templates: templates.map(({ spec, publisherOrganizationId, ...template }) => {
        // Only expose the published, non-sensitive planning association.
        // Do not return unreviewed internal Blueprint spec to Site clients.
        const metadata: Record<string, unknown> = spec && typeof spec === "object"
          && !Array.isArray(spec) ? spec as Record<string, unknown> : {};
        const offeringCode = typeof metadata.offeringCode === "string"
          ? metadata.offeringCode : null;
        const linkedProduct = offeringCode
          ? linkedByPublisherAndCode.get(publisherOrganizationId + ":" + offeringCode)
          : null;
        return {
          ...template,
          programCode: typeof metadata.programCode === "string" ? metadata.programCode : null,
          offeringCode,
          // Publisher identity is used only to prove the source relationship.
          // A published product is not an availability or enrollment decision.
          linkedPublishedOffering: linkedProduct ? {
            code: linkedProduct.code, title: linkedProduct.title,
            offeringVersionId: linkedProduct.offeringVersionId,
            versionNo: linkedProduct.versionNo,
          } : null,
          components: components
            .filter(component => component.blueprintVersionId === template.blueprintVersionId)
            .map(({ id, key, kind, requirementMode, componentSpec }) => ({
              id, key, kind, requirementMode,
              ...publicSolutionComponentDescription(componentSpec),
            })),
        };
      }),
      configurations: configurations.flatMap(configuration => {
        const version = latestByConfiguration.get(configuration.id);
        if (!version || !version.config || typeof version.config !== "object"
          || Array.isArray(version.config)
          || version.config.siteId !== siteId) return [];
        return [{
          configurationId: configuration.id,
          name: configuration.name,
          versionId: version.id,
          blueprintVersionId: version.blueprintVersionId,
          revision: version.revision,
          lifecycle: version.lifecycle,
        }];
      }),
    };
  });
}

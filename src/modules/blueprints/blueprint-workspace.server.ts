import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
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
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
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
  assertCapability(context, "blueprint.read");
  const { siteId } = blueprintWorkspaceInputSchema.parse(rawInput);
  if (!context.scope.siteIds?.includes(siteId)) {
    throw new AuthorizationError("Blueprint workspace Site scope");
  }
  if (process.env.CAN_CANONICAL_BLUEPRINT_WRITE_ENABLED !== "true") {
    throw new DomainError("UNAVAILABLE", "Canonical Blueprint workspace is not enabled.");
  }

  return db.transaction(async tx => {
    const [site] = await tx.select({ id: catalogSites.id, status: catalogSites.status })
      .from(catalogSites).where(eq(catalogSites.id, siteId)).limit(1);
    if (!site || site.status === "closed") {
      throw new DomainError("UNAVAILABLE", "The selected canonical Site is unavailable.");
    }
    const now = new Date();
    const organizationIds = context.scope.organizationIds ?? [];
    if (!organizationIds.length) throw new AuthorizationError("Blueprint Organization scope");
    const [operator] = await tx.select({
      organizationId: siteOrganizationRoles.organizationId,
    }).from(siteOrganizationRoles).where(and(
      eq(siteOrganizationRoles.siteId, siteId),
      eq(siteOrganizationRoles.roleCode, "operator"),
      inArray(siteOrganizationRoles.organizationId, organizationIds),
      lte(siteOrganizationRoles.validFrom, now),
      or(isNull(siteOrganizationRoles.validThrough), gt(siteOrganizationRoles.validThrough, now)),
    )).limit(1);
    if (!operator) throw new AuthorizationError("current Blueprint Site operator relationship");

    const [recipes, configurations, affiliations] = await Promise.all([
      tx.select({
        blueprintId: blueprints.id,
        title: blueprints.title,
        blueprintVersionId: blueprintVersions.id,
        versionNo: blueprintVersions.versionNo,
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
        .where(eq(blueprintConfigurations.owningOrganizationId, operator.organizationId))
        .orderBy(asc(blueprintConfigurations.name)),
      tx.select({
        code: religiousAffiliationOptions.code,
        label: religiousAffiliationOptions.label,
      }).from(religiousAffiliationOptions)
        .where(eq(religiousAffiliationOptions.active, true))
        .orderBy(asc(religiousAffiliationOptions.sortOrder)),
    ]);
    const seenRecipes = new Set<string>();
    const templates = recipes.filter(recipe => {
      if (seenRecipes.has(recipe.blueprintId)) return false;
      seenRecipes.add(recipe.blueprintId);
      return true;
    });
    const components = templates.length
      ? await tx.select({
          id: blueprintComponents.id,
          blueprintVersionId: blueprintComponents.blueprintVersionId,
          key: blueprintComponents.componentKey,
          kind: blueprintComponents.componentKind,
          requirementMode: blueprintComponents.requirementMode,
        }).from(blueprintComponents)
          .where(inArray(blueprintComponents.blueprintVersionId,
            templates.map(template => template.blueprintVersionId)))
          .orderBy(asc(blueprintComponents.componentKey))
      : [];

    const versions = configurations.length
      ? await tx.select({
          configurationId: blueprintConfigurationVersions.configurationId,
          id: blueprintConfigurationVersions.id,
          revision: blueprintConfigurationVersions.revision,
          lifecycle: blueprintConfigurationVersions.lifecycle,
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
    return {
      siteId,
      organizationId: operator.organizationId,
      canConfigure: context.capabilities.has("blueprint.configure"),
      canReview: context.capabilities.has("blueprint.review"),
      canExecute: context.capabilities.has("blueprint.execute"),
      affiliations,
      templates: templates.map(template => ({
        ...template,
        components: components
          .filter(component => component.blueprintVersionId === template.blueprintVersionId)
          .map(({ id, key, kind, requirementMode }) => ({ id, key, kind, requirementMode })),
      })),
      configurations: configurations.flatMap(configuration => {
        const version = latestByConfiguration.get(configuration.id);
        if (!version || !version.config || typeof version.config !== "object"
          || Array.isArray(version.config)
          || version.config.siteId !== siteId) return [];
        return [{
          configurationId: configuration.id,
          name: configuration.name,
          versionId: version.id,
          revision: version.revision,
          lifecycle: version.lifecycle,
        }];
      }),
    };
  });
}

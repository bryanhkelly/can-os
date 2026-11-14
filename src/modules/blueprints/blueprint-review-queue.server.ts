import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  blueprintComponents,
  blueprintConfigurationComponents,
  blueprintConfigurations,
  blueprintConfigurationVersions,
  blueprints,
  configurationReviews,
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";

export async function getCanonicalBlueprintReviewQueue(context: CommandContext) {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "blueprint.review");
  if (process.env.CAN_CANONICAL_BLUEPRINT_WRITE_ENABLED !== "true") {
    throw new DomainError("UNAVAILABLE", "Canonical Blueprint review is not enabled.");
  }
  const organizationIds = context.scope.organizationIds ?? [];
  if (!organizationIds.length) throw new AuthorizationError("Blueprint reviewer Organization scope");

  return db.transaction(async tx => {
    const versions = await tx.select({
      configurationId: blueprintConfigurations.id,
      name: blueprintConfigurations.name,
      owningOrganizationId: blueprintConfigurations.owningOrganizationId,
      blueprintTitle: blueprints.title,
      versionId: blueprintConfigurationVersions.id,
      revision: blueprintConfigurationVersions.revision,
      lifecycle: blueprintConfigurationVersions.lifecycle,
    }).from(blueprintConfigurations)
      .innerJoin(blueprints, eq(blueprints.id, blueprintConfigurations.blueprintId))
      .innerJoin(blueprintConfigurationVersions,
        eq(blueprintConfigurationVersions.configurationId, blueprintConfigurations.id))
      .where(inArray(blueprintConfigurations.owningOrganizationId, organizationIds))
      .orderBy(asc(blueprintConfigurations.name), desc(blueprintConfigurationVersions.revision));

    const seen = new Set<string>();
    const pending = versions.filter(version => {
      if (seen.has(version.configurationId)) return false;
      seen.add(version.configurationId);
      return version.lifecycle === "frozen";
    });
    if (!pending.length) return [];

    const versionIds = pending.map(version => version.versionId);
    const configurationIds = pending.map(version => version.configurationId);
    const [reviews, components, authors] = await Promise.all([
      tx.select({
        versionId: configurationReviews.configurationVersionId,
        decision: configurationReviews.decision,
        decidedAt: configurationReviews.decidedAt,
      }).from(configurationReviews)
        .where(inArray(configurationReviews.configurationVersionId, versionIds))
        .orderBy(desc(configurationReviews.decidedAt)),
      tx.select({
        versionId: blueprintConfigurationComponents.configurationVersionId,
        componentId: blueprintComponents.id,
        key: blueprintComponents.componentKey,
        kind: blueprintComponents.componentKind,
      }).from(blueprintConfigurationComponents)
        .innerJoin(blueprintComponents,
          eq(blueprintComponents.id, blueprintConfigurationComponents.componentId))
        .where(and(
          inArray(blueprintConfigurationComponents.configurationVersionId, versionIds),
          eq(blueprintConfigurationComponents.selectionStatus, "selected"),
        )).orderBy(asc(blueprintComponents.componentKey)),
      tx.select({
        configurationId: auditEvents.entityId,
        authorPersonId: auditEvents.actorPersonId,
        payload: auditEvents.payload,
      }).from(auditEvents).where(and(
        inArray(auditEvents.entityId, configurationIds),
        inArray(auditEvents.eventCode, [
          "blueprint.configuration.created",
          "blueprint.configuration.saved",
          "blueprint.configuration.submitted",
        ]),
      )),
    ]);
    const latestReviews = new Map<string, string>();
    for (const review of reviews) {
      if (!latestReviews.has(review.versionId)) {
        latestReviews.set(review.versionId, review.decision);
      }
    }
    return pending
      .filter(version => !authors.some(author =>
        author.configurationId === version.configurationId
        && author.authorPersonId === context.actorPersonId
        && author.payload.versionId === version.versionId
      ))
      .map(version => ({
        configurationId: version.configurationId,
        configurationVersionId: version.versionId,
        owningOrganizationId: version.owningOrganizationId!,
        name: version.name,
        blueprintTitle: version.blueprintTitle,
        revision: version.revision,
        latestDecision: latestReviews.get(version.versionId) ?? "not_reviewed",
        selectedComponents: components
          .filter(component => component.versionId === version.versionId)
          .map(({ componentId, key, kind }) => ({ componentId, key, kind })),
      }));
  });
}

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  blueprintComponents,
  blueprintConfigurationComponents,
  blueprintConfigurationComponentReferences,
  blueprintConfigurationLocalExperiences,
  blueprintConfigurationOfferingIntents,
  blueprintReferenceItemVersions,
  blueprintReferenceItems,
  offeringVersions,
  offerings,
  blueprintConfigurations,
  blueprintConfigurationVersions,
  blueprints,
  configurationReviews,
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { blueprintDatabaseRole } from "@/domain/blueprint-database-role";

export async function getCanonicalBlueprintReviewQueue(context: CommandContext) {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "blueprint.review");
  const organizationIds = context.scope.organizationIds ?? [];
  if (!organizationIds.length) throw new AuthorizationError("Blueprint reviewer Organization scope");

  const databaseRole = blueprintDatabaseRole(context, "blueprint_reviewer");
  return db.transaction(async tx => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${databaseRole}`));
    const versions = await tx.select({
      configurationId: blueprintConfigurations.id,
      name: blueprintConfigurations.name,
      owningOrganizationId: blueprintConfigurations.owningOrganizationId,
      blueprintTitle: blueprints.title,
      versionId: blueprintConfigurationVersions.id,
      revision: blueprintConfigurationVersions.revision,
      lifecycle: blueprintConfigurationVersions.lifecycle,
      config: blueprintConfigurationVersions.config,
      religiousAffiliationCode: blueprintConfigurationVersions.religiousAffiliationCode,
      editorialIdentity: blueprintConfigurationVersions.editorialIdentity,
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
    const [reviews, components, authors, references, offeringIntents, localExperiences] = await Promise.all([
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
      tx.select({
        versionId: blueprintConfigurationComponentReferences.configurationVersionId,
        componentId: blueprintConfigurationComponentReferences.componentId,
        title: blueprintReferenceItemVersions.title,
        kind: blueprintReferenceItems.referenceKind,
        summary: blueprintReferenceItemVersions.summary,
      }).from(blueprintConfigurationComponentReferences)
        .innerJoin(blueprintReferenceItemVersions,
          eq(blueprintReferenceItemVersions.id,
            blueprintConfigurationComponentReferences.referenceItemVersionId))
        .innerJoin(blueprintReferenceItems,
          eq(blueprintReferenceItems.id, blueprintReferenceItemVersions.itemId))
        .where(inArray(blueprintConfigurationComponentReferences.configurationVersionId,
          versionIds)),
      tx.select({
        versionId: blueprintConfigurationOfferingIntents.configurationVersionId,
        componentId: blueprintConfigurationOfferingIntents.componentId,
        title: offerings.title,
        code: offerings.code,
        offeringVersionNo: offeringVersions.versionNo,
      }).from(blueprintConfigurationOfferingIntents)
        .innerJoin(offeringVersions,
          eq(offeringVersions.id, blueprintConfigurationOfferingIntents.offeringVersionId))
        .innerJoin(offerings, eq(offerings.id, offeringVersions.offeringId))
        .where(inArray(blueprintConfigurationOfferingIntents.configurationVersionId,
          versionIds)),
      tx.select({
        versionId: blueprintConfigurationLocalExperiences.configurationVersionId,
        componentId: blueprintConfigurationLocalExperiences.componentId,
        kind: blueprintConfigurationLocalExperiences.experienceKind,
        title: blueprintConfigurationLocalExperiences.title,
        summary: blueprintConfigurationLocalExperiences.summary,
      }).from(blueprintConfigurationLocalExperiences)
        .where(inArray(blueprintConfigurationLocalExperiences.configurationVersionId,
          versionIds)),
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
        siteId: version.config && typeof version.config === "object" &&
          !Array.isArray(version.config) && typeof version.config.siteId === "string"
            ? version.config.siteId : null,
        editorialIdentity: version.editorialIdentity,
        religiousAffiliationCode: version.religiousAffiliationCode,
        latestDecision: latestReviews.get(version.versionId) ?? "not_reviewed",
        references: references.filter(item => item.versionId === version.versionId)
          .map(({ componentId, title, kind, summary }) => ({
            componentId, title, kind, summary,
          })),
        offeringIntents: offeringIntents.filter(item => item.versionId === version.versionId)
          .map(({ componentId, title, code, offeringVersionNo }) => ({
            componentId, title, code, offeringVersionNo,
          })),
        localExperiences: localExperiences.filter(item => item.versionId === version.versionId)
          .map(({ componentId, title, kind, summary }) => ({
            componentId, title, kind, summary,
          })),
        selectedComponents: components
          .filter(component => component.versionId === version.versionId)
          .map(({ componentId, key, kind }) => ({ componentId, key, kind })),
      }));
  });
}

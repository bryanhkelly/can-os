import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents as sharedAuditEvents } from "@/db/schema";
import { writeBlueprintTransition } from "./blueprint-journal.server";
import {
  blueprintComponentApprovalDecisions,
  blueprintConfigurationComponents,
  blueprintConfigurations,
  blueprintConfigurationVersions,
  configurationReviews,
  evidenceDocuments,
  evidenceDocumentVersions,
  type JsonObject,
} from "@/db/canonical-v301";
import {
  decideBlueprintReviewInputSchema,
  blueprintReviewReadInputSchema,
  blueprintReviewHistoryInputSchema,
} from "@/domain/blueprint-review";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { blueprintDatabaseRole, blueprintReadDatabaseRole } from "@/domain/blueprint-database-role";
import { requireBlueprintSiteScope } from "@/domain/blueprint-studio-scope";
import { assertVerifiedCanPlanningSite, isVerifiedCanSitePlanning } from "./verified-site-planning.server";

type ReviewInput = ReturnType<typeof decideBlueprintReviewInputSchema.parse>;

export interface BlueprintReviewResult {
  reviewId: string;
  configurationVersionId: string;
  decision: "approved" | "conditional" | "rejected";
  created: boolean;
}

/** The actual frozen version and its Organization come from the database, not the caller. */
async function requireReviewVersion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  context: CommandContext,
  versionId: string,
) {
  const [version] = await tx.select({
    id: blueprintConfigurationVersions.id,
    configurationId: blueprintConfigurationVersions.configurationId,
    owningOrganizationId: blueprintConfigurations.owningOrganizationId,
    lifecycle: blueprintConfigurationVersions.lifecycle,
    config: blueprintConfigurationVersions.config,
  }).from(blueprintConfigurationVersions)
    .innerJoin(blueprintConfigurations,
      eq(blueprintConfigurations.id, blueprintConfigurationVersions.configurationId))
    .where(eq(blueprintConfigurationVersions.id, versionId))
    .limit(1);
  if (!version?.owningOrganizationId) {
    throw new DomainError("UNAVAILABLE", "The Blueprint configuration version is unavailable.");
  }
  if (!context.scope.organizationIds?.includes(version.owningOrganizationId)) {
    throw new AuthorizationError("Blueprint review Organization scope");
  }
  return version;
}

function assertComponentCoverage(
  selectedComponentIds: readonly string[],
  input: ReviewInput,
): void {
  const selected = new Set(selectedComponentIds);
  if (input.components.some(item => !selected.has(item.componentId))) {
    throw new DomainError("VALIDATION_FAILED",
      "Review decisions must belong to selected Blueprint components.");
  }
  if (input.decision === "approved" &&
      input.components.length !== selected.size) {
    throw new DomainError("VALIDATION_FAILED",
      "Every selected component requires explicit approval.");
  }
}

export async function getBlueprintReview(
  context: CommandContext,
  rawInput: unknown,
) {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "blueprint.read");
  const { configurationVersionId } = blueprintReviewReadInputSchema.parse(rawInput);
  const isCanPlanning = isVerifiedCanSitePlanning(context);
  const databaseRole = isCanPlanning ? null : blueprintReadDatabaseRole(context);
  return db.transaction(async tx => {
    if (databaseRole) await tx.execute(sql.raw(`SET LOCAL ROLE ${databaseRole}`));
    const version = await requireReviewVersion(tx, context, configurationVersionId);
    if (isCanPlanning) {
      const siteId = requireBlueprintSiteScope(context, version.config);
      await assertVerifiedCanPlanningSite(tx, context, siteId, version.owningOrganizationId);
    }
    const [latestReview] = await tx.select({
      id: configurationReviews.id,
      decision: configurationReviews.decision,
      reviewerPersonId: configurationReviews.reviewerPersonId,
      decidedAt: configurationReviews.decidedAt,
    }).from(configurationReviews)
      .where(eq(configurationReviews.configurationVersionId, version.id))
      .orderBy(desc(configurationReviews.decidedAt), desc(configurationReviews.id))
      .limit(1);
    const components = await tx.select({
      componentId: blueprintConfigurationComponents.componentId,
      selectionStatus: blueprintConfigurationComponents.selectionStatus,
    }).from(blueprintConfigurationComponents)
      .where(eq(blueprintConfigurationComponents.configurationVersionId, version.id));
    const decisions = await tx.select({
      componentId: blueprintComponentApprovalDecisions.componentId,
      decision: blueprintComponentApprovalDecisions.decision,
      decisionOrder: blueprintComponentApprovalDecisions.decisionOrder,
    }).from(blueprintComponentApprovalDecisions)
      .where(eq(blueprintComponentApprovalDecisions.configurationVersionId, version.id))
      .orderBy(desc(blueprintComponentApprovalDecisions.decisionOrder));
    const latestByComponent = new Map<string, string>();
    for (const decision of decisions) {
      if (!latestByComponent.has(decision.componentId)) {
        latestByComponent.set(decision.componentId, decision.decision);
      }
    }
    return {
      configurationVersionId: version.id,
      lifecycle: version.lifecycle,
      latestReview: latestReview ?? null,
      components: components
        .filter(item => item.selectionStatus === "selected")
        .map(item => ({
          componentId: item.componentId,
          decision: latestByComponent.get(item.componentId) ?? "not_reviewed",
        })),
    };
  });
}

/**
 * Read actual append-only decisions for one Blueprint version. This is
 * intentionally distinct from the latest-decision authorization check and
 * does not infer operating approval or manufacture revision transitions.
 */
export async function getBlueprintReviewHistory(
  context: CommandContext,
  rawInput: unknown,
) {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "blueprint.read");
  const { configurationVersionId, page } = blueprintReviewHistoryInputSchema.parse(rawInput);
  const isCanPlanning = isVerifiedCanSitePlanning(context);
  const databaseRole = isCanPlanning ? null : blueprintReadDatabaseRole(context);
  return db.transaction(async tx => {
    if (databaseRole) await tx.execute(sql.raw(`SET LOCAL ROLE ${databaseRole}`));
    const version = await requireReviewVersion(tx, context, configurationVersionId);
    if (isCanPlanning) {
      const siteId = requireBlueprintSiteScope(context, version.config);
      await assertVerifiedCanPlanningSite(tx, context, siteId, version.owningOrganizationId);
    }
    requireBlueprintSiteScope(context, version.config);
    const rows = await tx.select({
      id: configurationReviews.id,
      decision: configurationReviews.decision,
      reviewerPersonId: configurationReviews.reviewerPersonId,
      decidedAt: configurationReviews.decidedAt,
      evidenceVersionId: configurationReviews.evidenceVersionId,
      conditions: configurationReviews.conditions,
    }).from(configurationReviews)
      .where(eq(configurationReviews.configurationVersionId, version.id))
      .orderBy(desc(configurationReviews.decidedAt), desc(configurationReviews.id))
      .limit(21).offset(page * 20);
    return {
      configurationVersionId: version.id,
      page,
      hasMore: rows.length > 20,
      items: rows.slice(0, 20).map(row => ({
        id: row.id,
        decision: row.decision,
        reviewerPersonId: row.reviewerPersonId,
        decidedAt: row.decidedAt.toISOString(),
        evidenceVersionId: row.evidenceVersionId,
        rationale: row.conditions && typeof row.conditions === "object" &&
          !Array.isArray(row.conditions) && "rationale" in row.conditions &&
          typeof row.conditions.rationale === "string"
            ? row.conditions.rationale : null,
      })),
    };
  });
}

/**
 * One atomic, append-only review: selected components first, then overall
 * decision, followed by audit and outbox. Does not authorize a Deployment.
 */
export async function decideBlueprintReview(
  context: CommandContext,
  rawInput: unknown,
): Promise<BlueprintReviewResult> {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "blueprint.review");
  const input = decideBlueprintReviewInputSchema.parse(rawInput);
  const actorPersonId = context.actorPersonId;

  const databaseRole = blueprintDatabaseRole(context, "blueprint_reviewer");
  return db.transaction(async tx => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${databaseRole}`));
    const version = await requireReviewVersion(tx, context, input.configurationVersionId);
    await tx.select({ id: blueprintConfigurations.id })
      .from(blueprintConfigurations)
      .where(eq(blueprintConfigurations.id, version.configurationId))
      .for("update");
    if (version.lifecycle !== "frozen") {
      throw new DomainError("CONFLICT", "Submit the Blueprint configuration before review.");
    }
    const [latestVersion] = await tx.select({
      id: blueprintConfigurationVersions.id,
    }).from(blueprintConfigurationVersions)
      .where(eq(blueprintConfigurationVersions.configurationId, version.configurationId))
      .orderBy(desc(blueprintConfigurationVersions.revision))
      .limit(1);
    if (latestVersion?.id !== version.id) {
      throw new DomainError("CONFLICT",
        "Only the current submitted Blueprint configuration can be reviewed.");
    }

    const [existing] = await tx.select().from(configurationReviews)
      .where(eq(configurationReviews.id, input.reviewId))
      .limit(1);
    if (existing) {
      if (existing.configurationVersionId !== version.id
        || existing.reviewerPersonId !== actorPersonId
        || existing.decision !== input.decision
        || existing.evidenceVersionId !== input.evidenceVersionId) {
        throw new DomainError("CONFLICT", "The Blueprint review identifier is already in use.");
      }
      return {
        reviewId: existing.id,
        configurationVersionId: version.id,
        decision: existing.decision as BlueprintReviewResult["decision"],
        created: false,
      };
    }

    const authors = await tx.select({ actorPersonId: sharedAuditEvents.actorPersonId })
      .from(sharedAuditEvents)
      .where(and(
        eq(sharedAuditEvents.resourceType, "blueprint_configuration"),
        eq(sharedAuditEvents.resourceId, version.configurationId),
        inArray(sharedAuditEvents.action, [
          "blueprint.configuration.created",
          "blueprint.configuration.saved",
          "blueprint.configuration.submitted",
        ]),
      ));
    // Independence applies to the entire configuration, not just the
    // latest revision. The original author cannot approve another person's
    // subsequent edit of the same plan.
    if (authors.length === 0 || authors.some(author => author.actorPersonId === actorPersonId)) {
      throw new AuthorizationError("independent Blueprint reviewer");
    }

    const selectedComponents = await tx.select({
      id: blueprintConfigurationComponents.componentId,
    }).from(blueprintConfigurationComponents)
      .where(and(
        eq(blueprintConfigurationComponents.configurationVersionId, version.id),
        eq(blueprintConfigurationComponents.selectionStatus, "selected"),
      ));
    assertComponentCoverage(selectedComponents.map(item => item.id), input);

    if (!version.owningOrganizationId) throw new AuthorizationError("review requires an owning Organization");
    // A review must cite verified evidence belonging to the Organization under
    // review; arbitrary document UUIDs are not approval.
    const evidenceIds = [...new Set([
      input.evidenceVersionId,
      ...input.components.map(item => item.evidenceVersionId),
    ].filter((id): id is string => id !== null))];
    if (evidenceIds.length > 0) {
      const allowed = await tx.select({ id: evidenceDocumentVersions.id })
        .from(evidenceDocumentVersions)
        .innerJoin(evidenceDocuments,
          eq(evidenceDocuments.id, evidenceDocumentVersions.documentId))
        .where(and(
          inArray(evidenceDocumentVersions.id, evidenceIds),
          eq(evidenceDocuments.owningOrganizationId, version.owningOrganizationId),
          isNotNull(evidenceDocumentVersions.verifiedAt),
          or(isNull(evidenceDocumentVersions.validFrom),
            lte(evidenceDocumentVersions.validFrom, sql`CURRENT_DATE`)),
          or(isNull(evidenceDocumentVersions.validThrough),
            gte(evidenceDocumentVersions.validThrough, sql`CURRENT_DATE`)),
        ));
      if (allowed.length !== evidenceIds.length) {
        throw new DomainError("VALIDATION_FAILED",
          "Blueprint approval evidence must be verified, current and owned by the review Organization.");
      }
    }

    if (input.components.length > 0) {
      await tx.insert(blueprintComponentApprovalDecisions).values(input.components.map(item => ({
        configurationVersionId: version.id,
        componentId: item.componentId,
        decision: item.decision,
        reviewerPersonId: actorPersonId,
        authorityOrganizationId: version.owningOrganizationId!,
        evidenceVersionId: item.evidenceVersionId,
        conditions: item.conditions,
      })));
    }

    await tx.insert(configurationReviews).values({
      id: input.reviewId,
      configurationVersionId: version.id,
      reviewerPersonId: actorPersonId,
      decision: input.decision,
      evidenceVersionId: input.evidenceVersionId,
      conditions: { rationale: input.rationale } satisfies JsonObject,
    });
    const payload: JsonObject = {
      owningOrganizationId: version.owningOrganizationId,
      configurationVersionId: version.id,
      reviewId: input.reviewId,
      decision: input.decision,
      componentDecisions: input.components.map(item => ({
        componentId: item.componentId,
        decision: item.decision,
      })),
      requestId: context.requestId ?? null,
    };
    await writeBlueprintTransition(tx, context, {
      actorPersonId,
      owningOrganizationId: version.owningOrganizationId,
      eventCode: "blueprint.configuration.reviewed",
      entityKind: "blueprint_configuration",
      entityId: version.configurationId,
      payload,
    }, {
      eventType: "BlueprintConfigurationReviewed",
      aggregateType: "blueprint_configuration",
      aggregateId: version.configurationId,
      actorPersonId,
      payload,
    });
    return {
      reviewId: input.reviewId,
      configurationVersionId: version.id,
      decision: input.decision,
      created: true,
    };
  });
}

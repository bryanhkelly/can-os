import { and, desc, eq, gt, inArray, isNull, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  blueprintComponentApprovalDecisions,
  blueprintConfigurationComponents,
  blueprintConfigurationOfferingIntents,
  blueprintConfigurationVersions,
  blueprintConfigurations,
  blueprintExecutionBatches,
  blueprintOutputs,
  blueprintVersions,
  configurationReviews,
  deploymentOfferingAdoptions,
  domainEvents,
  educationOperationOrganizationRoles,
  educationOperations,
  educationOperationSites,
  offeringVersions,
  offerings,
  programDeployments,
} from "@/db/canonical-v301";
import { assertCurrentBlueprintExecutionVersion, blueprintDeploymentCode, executeBlueprintConfigurationInputSchema } from "@/domain/blueprint-execution";
import {
  assertCapability,
  AuthorizationError,
  type CommandContext,
} from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { blueprintDatabaseRole } from "@/domain/blueprint-database-role";

type ExecutionResult = {
  executionBatchId: string;
  deploymentIds: string[];
  created: boolean;
};

function deploymentName(configuration: Record<string, unknown>, offeringTitle: string): string {
  const configuredName = configuration.name;
  return typeof configuredName === "string" && configuredName.trim()
    ? configuredName.trim().slice(0, 160)
    : offeringTitle;
}

async function loadExecutionResult(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  executionBatchId: string,
  created: boolean,
): Promise<ExecutionResult> {
  const outputs = await tx.select({ deploymentId: blueprintOutputs.deploymentId })
    .from(blueprintOutputs)
    .where(and(
      eq(blueprintOutputs.executionBatchId, executionBatchId),
      isNotNull(blueprintOutputs.deploymentId),
    ))
    .orderBy(blueprintOutputs.deploymentId);
  return {
    executionBatchId,
    deploymentIds: outputs.flatMap((row) => row.deploymentId ? [row.deploymentId] : []),
    created,
  };
}

export async function executeBlueprintConfiguration(
  context: CommandContext,
  rawInput: unknown,
): Promise<ExecutionResult> {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  const actorPersonId = context.actorPersonId;
  assertCapability(context, "blueprint.execute");
  const input = executeBlueprintConfigurationInputSchema.parse(rawInput);
  const databaseRole = blueprintDatabaseRole(context, "blueprint_author");

  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${databaseRole}`));
    const [configurationVersion] = await tx.select({
      id: blueprintConfigurationVersions.id,
      blueprintId: blueprintConfigurationVersions.blueprintId,
      blueprintVersionId: blueprintConfigurationVersions.blueprintVersionId,
      configurationId: blueprintConfigurationVersions.configurationId,
      lifecycle: blueprintConfigurationVersions.lifecycle,
      config: blueprintConfigurationVersions.config,
      owningOrganizationId: blueprintConfigurations.owningOrganizationId,
    }).from(blueprintConfigurationVersions)
      .innerJoin(
        blueprintConfigurations,
        eq(blueprintConfigurations.id, blueprintConfigurationVersions.configurationId),
      )
      .where(eq(blueprintConfigurationVersions.id, input.configurationVersionId))
      .limit(1);
    if (!configurationVersion?.owningOrganizationId) {
      throw new DomainError("UNAVAILABLE", "Blueprint configuration is unavailable for execution.");
    }
    if (!context.scope.organizationIds?.includes(configurationVersion.owningOrganizationId)) {
      throw new AuthorizationError("Blueprint configuration organization scope");
    }
    if (configurationVersion.lifecycle !== "frozen") {
      throw new DomainError("CONFLICT", "Only a frozen Blueprint configuration can be executed.");
    }
    // A new draft supersedes the reviewed version. Execution must use the
    // latest frozen revision, never an obsolete previously approved plan.
    const [latestConfigurationVersion] = await tx.select({
      id: blueprintConfigurationVersions.id,
    }).from(blueprintConfigurationVersions)
      .where(eq(blueprintConfigurationVersions.configurationId, configurationVersion.configurationId))
      .orderBy(desc(blueprintConfigurationVersions.revision))
      .limit(1);
    assertCurrentBlueprintExecutionVersion(configurationVersion.id, latestConfigurationVersion?.id);

    const [operation] = await tx.select({
      id: educationOperations.id,
      name: educationOperations.name,
      status: educationOperations.status,
    }).from(educationOperations)
      .where(eq(educationOperations.id, input.operationId))
      .limit(1);
    if (!operation || operation.status === "closed") {
      throw new DomainError("UNAVAILABLE", "The selected Operation is unavailable.");
    }

    const now = new Date();
    const [operatorRole] = await tx.select({ id: educationOperationOrganizationRoles.id })
      .from(educationOperationOrganizationRoles)
      .where(and(
        eq(educationOperationOrganizationRoles.operationId, operation.id),
        eq(educationOperationOrganizationRoles.organizationId, configurationVersion.owningOrganizationId),
        eq(educationOperationOrganizationRoles.roleCode, "operator"),
        eq(educationOperationOrganizationRoles.status, "approved"),
        lte(educationOperationOrganizationRoles.validFrom, now),
        or(
          isNull(educationOperationOrganizationRoles.validThrough),
          gt(educationOperationOrganizationRoles.validThrough, now),
        ),
      ))
      .limit(1);
    if (!operatorRole) {
      throw new AuthorizationError("current Operation operator relationship");
    }
    // The Organization may operate multiple schools or learning centers.
    // Execution must target the Operation serving this specific planned Site.
    const plannedSiteId = configurationVersion.config?.siteId;
    if (typeof plannedSiteId !== "string"
      || !context.scope.siteIds?.includes(plannedSiteId)) {
      throw new AuthorizationError("Blueprint execution Site scope");
    }
    const [siteParticipation] = await tx.select({ id: educationOperationSites.id })
      .from(educationOperationSites)
      .where(and(
        eq(educationOperationSites.operationId, operation.id),
        eq(educationOperationSites.siteId, plannedSiteId),
        lte(educationOperationSites.validFrom, now),
        or(isNull(educationOperationSites.validThrough),
          gt(educationOperationSites.validThrough, now)),
      ))
      .limit(1);
    if (!siteParticipation) {
      throw new AuthorizationError("current Operation participation in the Blueprint Site");
    }

    const commandLockKey = [
      "blueprint-execution-command",
      configurationVersion.owningOrganizationId,
      input.idempotencyKey,
    ].join(":");
    const targetLockKey = [
      "blueprint-execution",
      configurationVersion.owningOrganizationId,
      operation.id,
      configurationVersion.id,
    ].join(":");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${commandLockKey}, 0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${targetLockKey}, 0))`);

    const [keyedBatch] = await tx.select().from(blueprintExecutionBatches)
      .where(and(
        eq(blueprintExecutionBatches.executingOrganizationId, configurationVersion.owningOrganizationId),
        eq(blueprintExecutionBatches.idempotencyKey, input.idempotencyKey),
      ))
      .limit(1)
      .for("update");
    if (keyedBatch) {
      if (keyedBatch.configurationVersionId !== configurationVersion.id
        || keyedBatch.blueprintVersionId !== configurationVersion.blueprintVersionId
        || keyedBatch.reviewId !== input.reviewId
        || keyedBatch.executionStatus !== "executed") {
        throw new DomainError("CONFLICT", "The Blueprint execution idempotency key was already used.");
      }
      const [operationOutput] = await tx.select({ id: blueprintOutputs.id })
        .from(blueprintOutputs)
        .where(and(
          eq(blueprintOutputs.executionBatchId, keyedBatch.id),
          eq(blueprintOutputs.operationId, operation.id),
        ))
        .limit(1);
      if (!operationOutput) {
        throw new DomainError("CONFLICT", "The Blueprint execution key belongs to a different Operation.");
      }
      return loadExecutionResult(tx, keyedBatch.id, false);
    }

    const [priorOutput] = await tx.select({
      batchId: blueprintExecutionBatches.id,
      reviewId: blueprintExecutionBatches.reviewId,
      executionStatus: blueprintExecutionBatches.executionStatus,
    }).from(blueprintOutputs)
      .innerJoin(
        blueprintExecutionBatches,
        eq(blueprintExecutionBatches.id, blueprintOutputs.executionBatchId),
      )
      .where(and(
        eq(blueprintOutputs.configurationVersionId, configurationVersion.id),
        eq(blueprintOutputs.operationId, operation.id),
        eq(blueprintExecutionBatches.executingOrganizationId, configurationVersion.owningOrganizationId),
      ))
      .limit(1);
    if (priorOutput) {
      if (priorOutput.reviewId !== input.reviewId || priorOutput.executionStatus !== "executed") {
        throw new DomainError("CONFLICT", "This frozen configuration already has a different execution decision.");
      }
      return loadExecutionResult(tx, priorOutput.batchId, false);
    }

    const [latestReview] = await tx.select({
      id: configurationReviews.id,
      decision: configurationReviews.decision,
      reviewerPersonId: configurationReviews.reviewerPersonId,
      decidedAt: configurationReviews.decidedAt,
    }).from(configurationReviews)
      .where(eq(configurationReviews.configurationVersionId, configurationVersion.id))
      .orderBy(desc(configurationReviews.decidedAt), desc(configurationReviews.id))
      .limit(1);
    if (!latestReview
      || latestReview.id !== input.reviewId
      || latestReview.decision !== "approved"
      || latestReview.decidedAt > now
      || latestReview.reviewerPersonId === actorPersonId) {
      throw new DomainError("CONFLICT", "Execution requires the current independent approval for this configuration.");
    }

    const selectedComponents = await tx.select({
      componentId: blueprintConfigurationComponents.componentId,
    }).from(blueprintConfigurationComponents)
      .where(and(
        eq(blueprintConfigurationComponents.configurationVersionId, configurationVersion.id),
        eq(blueprintConfigurationComponents.selectionStatus, "selected"),
      ));
    if (selectedComponents.length > 0) {
      const decisions = await tx.select({
        componentId: blueprintComponentApprovalDecisions.componentId,
        decision: blueprintComponentApprovalDecisions.decision,
        decidedAt: blueprintComponentApprovalDecisions.decidedAt,
      }).from(blueprintComponentApprovalDecisions)
        .where(and(
          eq(blueprintComponentApprovalDecisions.configurationVersionId, configurationVersion.id),
          inArray(
            blueprintComponentApprovalDecisions.componentId,
            selectedComponents.map((component) => component.componentId),
          ),
        ))
        .orderBy(desc(blueprintComponentApprovalDecisions.decisionOrder));
      const latestDecisionByComponent = new Map<string, string>();
      const futureDecision = new Set<string>();
      for (const decision of decisions) {
        if (!latestDecisionByComponent.has(decision.componentId)) {
          latestDecisionByComponent.set(decision.componentId, decision.decision);
          if (decision.decidedAt > now) futureDecision.add(decision.componentId);
        }
      }
      if (selectedComponents.some((component) =>
        latestDecisionByComponent.get(component.componentId) !== "approved"
        || futureDecision.has(component.componentId))) {
        throw new DomainError("CONFLICT", "Every selected Blueprint component needs a current approval.");
      }
    }

    const selectedComponentIds = new Set(selectedComponents.map((component) => component.componentId));
    const offeringIntents = await tx.select({
      componentId: blueprintConfigurationOfferingIntents.componentId,
      offeringVersionId: offeringVersions.id,
      offeringId: offerings.id,
      offeringCode: offerings.code,
      offeringTitle: offerings.title,
      offeringStatus: offerings.status,
      versionLifecycle: offeringVersions.lifecycle,
      configuration: blueprintConfigurationOfferingIntents.configuration,
    }).from(blueprintConfigurationOfferingIntents)
      .innerJoin(
        offeringVersions,
        eq(offeringVersions.id, blueprintConfigurationOfferingIntents.offeringVersionId),
      )
      .innerJoin(offerings, eq(offerings.id, offeringVersions.offeringId))
      .where(eq(blueprintConfigurationOfferingIntents.configurationVersionId, configurationVersion.id));
    if (offeringIntents.some((intent) => !selectedComponentIds.has(intent.componentId))) {
      throw new DomainError("CONFLICT", "An Offering adoption intent is not attached to a selected component.");
    }
    if (offeringIntents.some((intent) =>
      intent.offeringStatus !== "active" || intent.versionLifecycle !== "published")) {
      throw new DomainError("UNAVAILABLE", "A selected Offering is no longer actively published.");
    }

    const [blueprint] = await tx.select({ lifecycle: blueprintVersions.lifecycle })
      .from(blueprintVersions)
      .where(eq(blueprintVersions.id, configurationVersion.blueprintVersionId))
      .limit(1);
    if (!blueprint || blueprint.lifecycle !== "published") {
      throw new DomainError("UNAVAILABLE", "The Blueprint version is no longer published.");
    }

    const [batch] = await tx.insert(blueprintExecutionBatches).values({
      configurationVersionId: configurationVersion.id,
      blueprintVersionId: configurationVersion.blueprintVersionId,
      reviewId: latestReview.id,
      idempotencyKey: input.idempotencyKey,
      executionStatus: "proposed",
      executingOrganizationId: configurationVersion.owningOrganizationId,
    }).returning();
    if (!batch) throw new Error("Blueprint execution batch was not created.");

    const [executedBatch] = await tx.update(blueprintExecutionBatches)
      .set({
        executionStatus: "executed",
        executedByPersonId: actorPersonId,
        executedAt: now,
      })
      .where(and(
        eq(blueprintExecutionBatches.id, batch.id),
        eq(blueprintExecutionBatches.executionStatus, "proposed"),
      ))
      .returning({ id: blueprintExecutionBatches.id });
    if (!executedBatch) {
      throw new DomainError("CONFLICT", "The Blueprint execution batch could not be authorized.");
    }

    await tx.insert(blueprintOutputs).values({
      blueprintVersionId: configurationVersion.blueprintVersionId,
      executionBatchId: batch.id,
      configurationVersionId: configurationVersion.id,
      reviewId: latestReview.id,
      operationId: operation.id,
    });

    const deploymentIds: string[] = [];
    for (const intent of offeringIntents) {
      const [deployment] = await tx.insert(programDeployments).values({
        operationId: operation.id,
        offeringId: intent.offeringId,
        code: blueprintDeploymentCode(
          intent.offeringCode,
          configurationVersion.id,
          intent.componentId,
          intent.offeringVersionId,
        ),
        name: deploymentName(intent.configuration, intent.offeringTitle),
        status: "planning",
      }).returning({ id: programDeployments.id });
      if (!deployment) throw new Error("Blueprint Offering Deployment was not created.");
      deploymentIds.push(deployment.id);

      await tx.insert(deploymentOfferingAdoptions).values({
        deploymentId: deployment.id,
        offeringId: intent.offeringId,
        offeringVersionId: intent.offeringVersionId,
        validFrom: now,
        approvalStatus: "proposed",
      });
      await tx.insert(blueprintOutputs).values({
        blueprintVersionId: configurationVersion.blueprintVersionId,
        executionBatchId: batch.id,
        configurationVersionId: configurationVersion.id,
        reviewId: latestReview.id,
        deploymentId: deployment.id,
      });
    }

    await tx.insert(auditEvents).values({
      actorPersonId,
      owningOrganizationId: configurationVersion.owningOrganizationId,
      eventCode: "blueprint.configuration.executed",
      entityKind: "blueprint_execution_batch",
      entityId: batch.id,
      payload: {
        configurationVersionId: configurationVersion.id,
        operationId: operation.id,
        deploymentIds,
        requestId: context.requestId ?? null,
      },
    });
    await tx.insert(domainEvents).values({
      eventType: "BlueprintConfigurationExecuted",
      aggregateType: "BlueprintExecutionBatch",
      aggregateId: batch.id,
      actorPersonId,
      payload: {
        organizationId: configurationVersion.owningOrganizationId,
        operationId: operation.id,
        configurationVersionId: configurationVersion.id,
        deploymentIds,
      },
    });

    return { executionBatchId: batch.id, deploymentIds, created: true };
  });
}

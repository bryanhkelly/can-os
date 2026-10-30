import { currentSafeguardingFallbacks } from "./safeguarding-routing.server";
import { db } from "@/db/client";
import {
  accessAccounts,
  accountPersonGrants,
  documents,
  enrollments,
  incidentAmendments,
  incidentEvidence,
  incidentNotifications,
  incidentReviews,
  incidents,
  people,
  programs,
  safeguardingCaseAssignments,
  safeguardingConcerns,
  safeguardingExternalReports,
  safeguardingSitePolicies,
  safeguardingSiteResponders,
  sites,
  studentProfiles,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import {
  assertSafeguardingCaseAccess,
  assertSafeguardingConfigurationScope,
  assertSafeguardingReporterRelationship,
  isSafeguardingResponderRole,
  type SafeguardingCaseResource,
} from "@/domain/safeguarding-case-access";
import { safeguardingIntakeGuidance, type SafeguardingObservationInput } from "@/domain/safeguarding-intake-policy";
import { assertOnsiteSafeguardingSubmissionScope } from "@/domain/site-safeguarding-access";
import {
  assertOrganizationScope,
  assertProgramScope,
  assertSiteScope,
  AuthorizationError,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, notifyMany, writeAudit } from "@/platform/mutation";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";

export const safeguardingResponsibilities = ["primary", "deputy", "can_lead"] as const;
export type SafeguardingResponsibility = (typeof safeguardingResponsibilities)[number];

export type SafeguardingConfigurationInput = {
  siteId: string;
  jurisdictionId: string;
  procedureVersion: string;
  emergencyInstructions: string;
  externalReportingInstructions: string;
  offlineInstructions: string;
  acknowledgmentDueMinutes: number;
  active: boolean;
  responders: Record<SafeguardingResponsibility, string>;
};

export type SubmitSafeguardingConcernInput = SafeguardingObservationInput & {
  idempotencyKey: string;
  observedAt: string;
};

export type SafeguardingExternalReportInput = {
  incidentId: string;
  idempotencyKey: string;
  status: "attempted" | "submitted" | "agency_acknowledged";
  agencyType: "emergency_services" | "child_welfare" | "law_enforcement" | "medical" | "other";
  agencyLabel: string;
  channel: "phone" | "online" | "in_person" | "formal_notice" | "other";
  occurredAt: Date;
  reference?: string;
  details?: string;
};

export type SafeguardingEvidenceInput = {
  incidentId: string;
  idempotencyKey: string;
  type: "observation" | "document" | "photograph" | "other";
  description: string;
  documentId?: string;
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function loadSite(actor: AccessContext, siteId: string) {
  const [site] = await db.select({
    id: sites.id,
    name: sites.name,
    organizationId: sites.organizationId,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new AuthorizationError("safeguarding site resource");
  assertOrganizationScope(actor, site.organizationId);
  assertSiteScope(actor, site.id);
  return site;
}

async function loadPolicyAndResponders(siteId: string) {
  const [policy] = await db.select().from(safeguardingSitePolicies)
    .where(eq(safeguardingSitePolicies.siteId, siteId)).limit(1);
  const responderRows = await db.select({
    personId: safeguardingSiteResponders.personId,
    responsibility: safeguardingSiteResponders.responsibility,
    active: people.active,
  }).from(safeguardingSiteResponders)
    .innerJoin(people, eq(people.id, safeguardingSiteResponders.personId))
    .where(eq(safeguardingSiteResponders.siteId, siteId));
  return { policy, responderRows };
}

export async function saveSafeguardingSiteConfiguration(
  actor: AccessContext,
  input: SafeguardingConfigurationInput,
) {
  const site = await loadSite(actor, input.siteId);
  assertSafeguardingConfigurationScope(actor, site.organizationId, site.id);
  const recipientIds = Object.values(input.responders);
  if (new Set(recipientIds).size !== safeguardingResponsibilities.length) {
    throw new Error("Primary, deputy and CAN fallback must be three different active people");
  }
  const recipients = await db.select({ id: people.id }).from(people)
    .where(and(inArray(people.id, recipientIds), eq(people.active, true)));
  if (recipients.length !== recipientIds.length) {
    throw new Error("Every safeguarding responder must be an active Person");
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(safeguardingSitePolicies).values({
      siteId: site.id,
      jurisdictionId: input.jurisdictionId,
      procedureVersion: input.procedureVersion,
      emergencyInstructions: input.emergencyInstructions,
      externalReportingInstructions: input.externalReportingInstructions,
      offlineInstructions: input.offlineInstructions,
      acknowledgmentDueMinutes: input.acknowledgmentDueMinutes,
      active: input.active,
      reviewedByPersonId: input.active ? actor.actorPersonId : null,
      reviewedAt: input.active ? now : null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: safeguardingSitePolicies.siteId,
      set: {
        jurisdictionId: input.jurisdictionId,
        procedureVersion: input.procedureVersion,
        emergencyInstructions: input.emergencyInstructions,
        externalReportingInstructions: input.externalReportingInstructions,
        offlineInstructions: input.offlineInstructions,
        acknowledgmentDueMinutes: input.acknowledgmentDueMinutes,
        active: input.active,
        reviewedByPersonId: input.active ? actor.actorPersonId : null,
        reviewedAt: input.active ? now : null,
        updatedAt: now,
      },
    });
    for (const responsibility of safeguardingResponsibilities) {
      await tx.insert(safeguardingSiteResponders).values({
        siteId: site.id,
        personId: input.responders[responsibility],
        responsibility,
        appointedByPersonId: actor.actorPersonId!,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [safeguardingSiteResponders.siteId, safeguardingSiteResponders.responsibility],
        set: {
          personId: input.responders[responsibility],
          appointedByPersonId: actor.actorPersonId!,
          updatedAt: now,
        },
      });
    }
    const eventId = await emitEvent(tx, {
      eventType: EventTypes.SafeguardingSiteConfigurationSaved,
      aggregateType: "site",
      aggregateId: site.id,
      actorPersonId: actor.actorPersonId,
      organizationId: site.organizationId,
      siteId: site.id,
      payload: { procedureVersion: input.procedureVersion, active: input.active },
    });
    await writeAudit(tx, actor, {
      action: "safeguarding.policy.save",
      entityType: "site",
      entityId: site.id,
      scope: { organizationId: site.organizationId, siteId: site.id },
      after: {
        jurisdictionId: input.jurisdictionId,
        procedureVersion: input.procedureVersion,
        active: input.active,
        responders: input.responders,
      },
      contextExtras: { domainEventId: eventId, reviewType: "operational_not_legal" },
    });
  });
  return { saved: true, active: input.active, procedureVersion: input.procedureVersion };
}

async function findConcernReplay(actor: AccessContext, input: SubmitSafeguardingConcernInput) {
  const [existing] = await db.select({
    incident: incidents,
    concern: safeguardingConcerns,
  }).from(safeguardingConcerns)
    .innerJoin(incidents, eq(incidents.id, safeguardingConcerns.incidentId))
    .where(and(
      eq(safeguardingConcerns.reporterPersonId, actor.actorPersonId!),
      eq(safeguardingConcerns.idempotencyKey, input.idempotencyKey),
    )).limit(1);
  if (!existing) return null;
  assertSafeguardingReporterRelationship(actor, existing.incident);
  const unchanged = existing.incident.siteId === input.siteId &&
    existing.incident.programId === (input.programId ?? null) &&
    existing.incident.summary === input.factualObservation &&
    existing.incident.occurredAt.toISOString() === new Date(input.observedAt).toISOString() &&
    existing.concern.studentProfileId === (input.studentProfileId ?? null) &&
    existing.concern.source === input.source &&
    existing.concern.immediateDanger === input.immediateDanger &&
    JSON.stringify(existing.concern.concernKinds) === JSON.stringify(input.concernKinds);
  if (!unchanged) throw new Error("This idempotency key was already used for a different report");
  return {
    incidentId: existing.incident.id,
    incidentNumber: existing.incident.incidentNumber,
    urgent: existing.concern.urgent,
    acknowledgmentDueAt: existing.concern.acknowledgmentDueAt,
    replayed: true,
  };
}

export async function submitSafeguardingConcern(
  actor: AccessContext,
  input: SubmitSafeguardingConcernInput,
) {
  assertOnsiteSafeguardingSubmissionScope(actor, input.siteId);
  const replay = await findConcernReplay(actor, input);
  if (replay) return replay;
  const site = await loadSite(actor, input.siteId);
  const { policy, responderRows } = await loadPolicyAndResponders(site.id);
  if (!policy?.active || !policy.reviewedAt || !policy.reviewedByPersonId) {
    throw new Error("This site has no active operationally reviewed safeguarding procedure. Use its offline emergency procedure.");
  }
  const responders = new Map(
    responderRows.filter(row => row.active).map(row => [row.responsibility, row.personId]),
  );
  if (safeguardingResponsibilities.some(kind => !responders.has(kind)) ||
      new Set(responders.values()).size !== safeguardingResponsibilities.length) {
    throw new Error("Named primary, deputy and CAN fallback coverage is unavailable. Use the site's offline procedure.");
  }
  if (input.programId) {
    const [program] = await db.select({ id: programs.id }).from(programs).where(and(
      eq(programs.id, input.programId),
      eq(programs.siteId, site.id),
      eq(programs.organizationId, site.organizationId),
    )).limit(1);
    if (!program) throw new AuthorizationError("safeguarding program resource");
    assertProgramScope(actor, program.id);
  }
  if (input.studentProfileId) {
    const [relationship] = await db.select({ id: enrollments.id }).from(enrollments)
      .innerJoin(programs, eq(programs.id, enrollments.programId))
      .where(and(
        eq(enrollments.studentProfileId, input.studentProfileId),
        eq(enrollments.kind, "program"),
        eq(enrollments.status, "active"),
        eq(enrollments.organizationId, site.organizationId),
        eq(programs.siteId, site.id),
        ...(input.programId ? [eq(enrollments.programId, input.programId)] : []),
      )).limit(1);
    if (!relationship) throw new AuthorizationError("active onsite student relationship");
  }

  const guidance = safeguardingIntakeGuidance(input);
  const urgent = guidance.requiresImmediateHumanReview;
  const now = new Date();
  const acknowledgmentDueAt = new Date(now.getTime() + policy.acknowledgmentDueMinutes * 60_000);
  const incidentNumber = `SG-${now.toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    return await db.transaction(async (tx) => {
      const [incident] = await tx.insert(incidents).values({
        incidentNumber,
        type: "safeguarding_concern",
        severity: urgent ? "urgent" : "high",
        status: "filed",
        occurredAt: new Date(input.observedAt),
        reportedAt: now,
        reporterPersonId: actor.actorPersonId!,
        organizationId: site.organizationId,
        siteId: site.id,
        programId: input.programId,
        summary: input.factualObservation,
        immediateActions: input.immediateActions,
        classification: "safeguarding_restricted",
        metadata: { safeguarding: true, policyVersion: policy.procedureVersion },
        updatedAt: now,
      }).returning({ id: incidents.id });
      if (!incident) throw new Error("Failed to create restricted safeguarding Incident");
      await tx.insert(safeguardingConcerns).values({
        incidentId: incident.id,
        reporterPersonId: actor.actorPersonId!,
        idempotencyKey: input.idempotencyKey,
        studentProfileId: input.studentProfileId,
        concernKinds: input.concernKinds,
        source: input.source,
        immediateDanger: input.immediateDanger,
        urgent,
        policyVersion: policy.procedureVersion,
        acknowledgmentDueAt,
      });
      const routed = safeguardingResponsibilities.filter(kind => urgent || kind === "primary");
      await tx.insert(safeguardingCaseAssignments).values(routed.map(responsibility => ({
        incidentId: incident.id,
        personId: responders.get(responsibility)!,
        responsibility,
      })));
      await tx.insert(incidentNotifications).values(routed.map(responsibility => ({
        incidentId: incident.id,
        recipientPersonId: responders.get(responsibility)!,
        recipientType: "safeguarding_responder",
        recipientLabel: responsibility,
        channel: "in_app",
        purpose: "safeguarding_concern_response",
        status: "pending" as const,
      })));
      const eventId = await emitEvent(tx, {
        eventType: EventTypes.SafeguardingConcernFiled,
        aggregateType: "incident",
        aggregateId: incident.id,
        actorPersonId: actor.actorPersonId,
        organizationId: site.organizationId,
        siteId: site.id,
        programId: input.programId,
        payload: {
          incidentNumber,
          urgent,
          acknowledgmentDueAt: acknowledgmentDueAt.toISOString(),
          routedResponsibilities: routed,
          outsideReportConfirmed: false,
        },
      });
      await notifyMany(tx, routed.map(responsibility => ({
        recipientPersonId: responders.get(responsibility)!,
        type: "safeguarding_response_required",
        title: urgent ? "Urgent safeguarding response needed" : "Safeguarding response needed",
        body: "Open your assigned safeguarding workspace. This internal notification is not emergency dispatch or an external report.",
        resourceType: "safeguarding_concern",
        resourceId: incident.id,
        eventId,
      })));
      await writeAudit(tx, actor, {
        action: "safeguarding.concern.file",
        entityType: "incident",
        entityId: incident.id,
        scope: { organizationId: site.organizationId, siteId: site.id, programId: input.programId ?? null },
        after: {
          incidentNumber,
          status: "filed",
          urgent,
          source: input.source,
          concernKinds: input.concernKinds,
          policyVersion: policy.procedureVersion,
          routedResponsibilities: routed,
        },
        contextExtras: { domainEventId: eventId, idempotencyKey: input.idempotencyKey },
      });
      return {
        incidentId: incident.id,
        incidentNumber,
        urgent,
        acknowledgmentDueAt,
        replayed: false,
      };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const concurrent = await findConcernReplay(actor, input);
    if (concurrent) return concurrent;
    throw error;
  }
}

async function loadIncidentAndAssignment(actor: AccessContext, incidentId: string, capability: string) {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!incident) throw new AuthorizationError("safeguarding case resource");
  const [assignment] = await db.select().from(safeguardingCaseAssignments).where(and(
    eq(safeguardingCaseAssignments.incidentId, incidentId),
    eq(safeguardingCaseAssignments.personId, actor.actorPersonId!),
    isNull(safeguardingCaseAssignments.revokedAt),
  )).limit(1);
  assertSafeguardingCaseAccess(actor, incident, assignment, capability);
  return { incident, assignment: assignment! };
}

export async function acknowledgeSafeguardingConcern(actor: AccessContext, incidentId: string) {
  const { incident, assignment } = await loadIncidentAndAssignment(
    actor,
    incidentId,
    "safeguarding.respond",
  );
  return db.transaction(async (tx) => {
    // Shared with the scheduled overdue processor: acknowledgment and routing
    // cannot pass each other's unacknowledged check concurrently.
    await tx.select({id:incidents.id}).from(incidents)
      .where(eq(incidents.id,incidentId)).for("update").limit(1);
    const notifications = await tx.select().from(incidentNotifications).where(and(
      eq(incidentNotifications.incidentId, incidentId),
      eq(incidentNotifications.recipientPersonId, actor.actorPersonId!),
      eq(incidentNotifications.purpose, "safeguarding_concern_response"),
    )).orderBy(asc(incidentNotifications.createdAt));
    const priorAcknowledgment = notifications.find(row => row.acknowledgedAt);
    const pending = notifications.find(row => !row.acknowledgedAt);
    if (!pending) {
      if (priorAcknowledgment) return { acknowledgedAt: priorAcknowledgment.acknowledgedAt, replayed: true };
      throw new Error("No response handoff is assigned to this responder");
    }
    const acknowledgedAt = new Date();
    const changed = await tx.update(incidentNotifications).set({ acknowledgedAt, updatedAt: acknowledgedAt })
      .where(and(
        eq(incidentNotifications.id, pending.id),
        eq(incidentNotifications.recipientPersonId, actor.actorPersonId!),
        isNull(incidentNotifications.acknowledgedAt),
      )).returning({ id: incidentNotifications.id });
    // A concurrent retry may acknowledge the same handoff first. Only the
    // transaction that changed the row emits the business event and audit.
    if (!changed.length) return { acknowledgedAt, replayed: true };
    const eventId = await emitEvent(tx, {
      eventType: EventTypes.SafeguardingConcernAcknowledged,
      aggregateType: "incident",
      aggregateId: incidentId,
      actorPersonId: actor.actorPersonId,
      organizationId: incident.organizationId,
      siteId: incident.siteId,
      programId: incident.programId,
      payload: { responsibility: assignment.responsibility, outsideReportConfirmed: false },
    });
    await writeAudit(tx, actor, {
      action: "safeguarding.concern.acknowledge",
      entityType: "incident",
      entityId: incidentId,
      scope: { organizationId: incident.organizationId, siteId: incident.siteId, programId: incident.programId },
      after: { acknowledgedAt: acknowledgedAt.toISOString(), responsibility: assignment.responsibility },
      contextExtras: { domainEventId: eventId },
    });
    return { acknowledgedAt, replayed: false };
  });
}

export async function escalateSafeguardingConcern(actor: AccessContext, incidentId: string) {
  const { incident } = await loadIncidentAndAssignment(actor, incidentId, "safeguarding.respond");
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ status: incidents.status }).from(incidents)
      .where(eq(incidents.id, incidentId)).for("update").limit(1);
    if (current?.status !== "filed") throw new Error("Only an open safeguarding case can be escalated");
    const candidates = await currentSafeguardingFallbacks(tx, incident);
    // A revoked case assignment remains revoked. Only new, currently eligible
    // assignments receive a handoff; retries never duplicate notifications.
    const created = candidates.length ? await tx.insert(safeguardingCaseAssignments).values(candidates.map(candidate => ({
      incidentId,
      personId: candidate.personId,
      responsibility: candidate.responsibility,
      assignedByPersonId: actor.actorPersonId,
    }))).onConflictDoNothing().returning({
      personId: safeguardingCaseAssignments.personId,
      responsibility: safeguardingCaseAssignments.responsibility,
    }) : [];
    const active = candidates.length ? await tx.select({ personId: safeguardingCaseAssignments.personId,
      responsibility: safeguardingCaseAssignments.responsibility,
    }).from(safeguardingCaseAssignments).where(and(
      eq(safeguardingCaseAssignments.incidentId, incidentId),
      isNull(safeguardingCaseAssignments.revokedAt),
    )) : [];
    const unroutable = !candidates.some(candidate => active.some(assignment =>
      assignment.personId === candidate.personId && assignment.responsibility === candidate.responsibility));
    if (!created.length) {
      if (unroutable) await writeAudit(tx, actor, {
        action: "safeguarding.concern.escalation_unroutable",
        entityType: "incident", entityId: incidentId,
        scope: { organizationId: incident.organizationId, siteId: incident.siteId, programId: incident.programId },
        after: { eligibleFallbackAssigned: false, emergencyServicesDispatched: false },
      });
      return { escalated: false, responsibilities: [] as string[], unroutable };
    }
    await tx.insert(incidentNotifications).values(created.map(assignment => ({
      incidentId,
      recipientPersonId: assignment.personId,
      recipientType: "safeguarding_responder",
      recipientLabel: assignment.responsibility,
      channel: "in_app",
      purpose: "safeguarding_concern_response",
      status: "pending" as const,
    })));
    const routed = created.map(row => row.responsibility);
    const eventId = await emitEvent(tx, {
      eventType: EventTypes.SafeguardingConcernEscalated,
      aggregateType: "incident",
      aggregateId: incidentId,
      actorPersonId: actor.actorPersonId,
      organizationId: incident.organizationId,
      siteId: incident.siteId,
      programId: incident.programId,
      payload: { routedResponsibilities: routed, emergencyServicesDispatched: false },
    });
    await notifyMany(tx, created.map(assignment => ({
      recipientPersonId: assignment.personId,
      type: "safeguarding_response_required",
      title: "Safeguarding escalation assigned",
      body: "Open your assigned safeguarding workspace. This is an internal escalation, not emergency dispatch.",
      resourceType: "safeguarding_concern",
      resourceId: incidentId,
      eventId,
    })));
    await writeAudit(tx, actor, {
      action: "safeguarding.concern.escalate",
      entityType: "incident",
      entityId: incidentId,
      scope: { organizationId: incident.organizationId, siteId: incident.siteId, programId: incident.programId },
      after: { routedResponsibilities: routed },
      contextExtras: { domainEventId: eventId },
    });
    return { escalated: true, responsibilities: routed, unroutable: false };
  });
}

/** Accountable closure of a restricted case by an assigned responder who has
 * already recorded their own human acknowledgment. Closure never deletes
 * evidence, notification or external-report records, and does not complete or
 * replace any outside-agency legal duty. The conditional status transition is
 * the idempotency boundary: only the transaction that moves the case out of
 * `filed` writes the amendment, event and audit entries. */
export async function resolveSafeguardingConcern(
  actor: AccessContext,
  input: { incidentId: string; resolutionSummary: string },
) {
  const summary = input.resolutionSummary.trim();
  if (summary.length < 10 || summary.length > 2000) {
    throw new Error("Provide a 10-2000 character factual resolution summary");
  }
  const { incident, assignment } = await loadIncidentAndAssignment(
    actor,
    input.incidentId,
    "safeguarding.respond",
  );
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(incidents)
      .where(eq(incidents.id,incident.id)).for("update").limit(1);
    if (current?.status === "closed") {
      if (current.closedByPersonId !== actor.actorPersonId) {
        throw new Error("This safeguarding case was already closed by another responder");
      }
      if (current.metadata?.safeguardingResolutionSummary !== summary) {
        throw new Error("This case already has a different recorded resolution summary; closure retries cannot amend it");
      }
      return { incidentId: incident.id, closedAt: current.closedAt!, replayed: true };
    }
    if (current?.status !== "filed") throw new Error("Only an open safeguarding case can be closed");
    const pendingReviews=await tx.select({id:incidentReviews.id}).from(incidentReviews)
      .where(and(eq(incidentReviews.incidentId,incident.id),eq(incidentReviews.status,"pending"))).limit(1);
    if(pendingReviews.length)throw new Error("Complete all assigned restricted case reviews before closure");
    const acknowledged = await tx.select({ id: incidentNotifications.id })
      .from(incidentNotifications).where(and(
        eq(incidentNotifications.incidentId, incident.id),
        eq(incidentNotifications.recipientPersonId, actor.actorPersonId!),
        eq(incidentNotifications.purpose, "safeguarding_concern_response"),
        isNotNull(incidentNotifications.acknowledgedAt),
      )).limit(1);
    if (!acknowledged.length) {
      throw new Error("Record your own human acknowledgment before closing this restricted case");
    }
    const closedAt = new Date();
    const changed = await tx.update(incidents).set({
      status: "closed",
      closedAt,
      closedByPersonId: actor.actorPersonId,
      updatedAt: closedAt,
      metadata: { ...current.metadata, safeguardingResolutionSummary: summary },
    }).where(and(
      eq(incidents.id, incident.id),
      eq(incidents.status, "filed"),
    )).returning({ id: incidents.id });
    if (!changed.length) throw new Error("The safeguarding case state changed; reload before closing");
    await tx.insert(incidentAmendments).values({
      incidentId: incident.id,
      amendedByPersonId: actor.actorPersonId!,
      field: "status",
      priorValue: { value: "filed" },
      newValue: { value: "closed" },
      reason: summary,
    });
    const eventId = await emitEvent(tx, {
      eventType: EventTypes.IncidentClosed,
      aggregateType: "incident",
      aggregateId: incident.id,
      actorPersonId: actor.actorPersonId,
      organizationId: incident.organizationId,
      siteId: incident.siteId,
      programId: incident.programId,
      payload: {
        incidentNumber: incident.incidentNumber,
        responsibility: assignment.responsibility,
        resolutionSummaryRecorded: true,
        externalDutyCompleted: false,
      },
    });
    await writeAudit(tx, actor, {
      action: "safeguarding.concern.resolve",
      entityType: "incident",
      entityId: incident.id,
      scope: { organizationId: incident.organizationId, siteId: incident.siteId, programId: incident.programId },
      before: { status: "filed" },
      after: { status: "closed", resolutionSummary: summary, responsibility: assignment.responsibility },
      contextExtras: { domainEventId: eventId },
    });
    return { incidentId: incident.id, closedAt, replayed: false };
  });
}

/**
 * Metadata-only safety net: a restricted case whose acknowledgment target has
 * passed with NO recorded human acknowledgment must be visible to the site's
 * currently configured deputy and CAN fallback responders, or an unavailable
 * primary silently strands a child-safety concern. This listing exposes no
 * case content — only existence, urgency and the missed target — for sites
 * where the actor is the CURRENT named deputy/CAN fallback, and every read is
 * audited like other restricted access.
 */
export async function listOverdueUnacknowledgedSafeguardingCases(actor: AccessContext) {
  if (!isSafeguardingResponderRole(actor.role) || !actor.actorPersonId ||
      !actor.scope.siteIds?.length || !actor.scope.organizationIds?.length)
    throw new AuthorizationError("scoped safeguarding responder grant");
  const configured = await db.select({
    siteId: safeguardingSiteResponders.siteId,
    responsibility: safeguardingSiteResponders.responsibility,
  }).from(safeguardingSiteResponders)
    .innerJoin(people, eq(people.id, safeguardingSiteResponders.personId))
    .where(and(
      eq(safeguardingSiteResponders.personId, actor.actorPersonId),
      eq(people.active, true),
      inArray(safeguardingSiteResponders.siteId, actor.scope.siteIds),
      inArray(safeguardingSiteResponders.responsibility, ["deputy", "can_lead"]),
    ));
  if (!configured.length) return { overdue: [] };
  const responsibilityBySite = new Map(configured.map(row => [row.siteId, row.responsibility]));
  const candidates = await db.select({
    incidentId: incidents.id,
    incidentNumber: incidents.incidentNumber,
    siteId: incidents.siteId,
    reportedAt: incidents.reportedAt,
    urgent: safeguardingConcerns.urgent,
    acknowledgmentDueAt: safeguardingConcerns.acknowledgmentDueAt,
  }).from(safeguardingConcerns)
    .innerJoin(incidents, eq(incidents.id, safeguardingConcerns.incidentId))
    .where(and(
      inArray(incidents.siteId, [...responsibilityBySite.keys()]),
      inArray(incidents.organizationId, actor.scope.organizationIds),
      eq(incidents.type, "safeguarding_concern"),
      eq(incidents.classification, "safeguarding_restricted"),
      eq(incidents.status, "filed"),
      lt(safeguardingConcerns.acknowledgmentDueAt, new Date()),
    )).orderBy(asc(safeguardingConcerns.acknowledgmentDueAt)).limit(50);
  if (!candidates.length) return { overdue: [] };
  const ids = candidates.map(row => row.incidentId);
  const acknowledged = await db.select({ incidentId: incidentNotifications.incidentId })
    .from(incidentNotifications).where(and(
      inArray(incidentNotifications.incidentId, ids),
      eq(incidentNotifications.purpose, "safeguarding_concern_response"),
      isNotNull(incidentNotifications.acknowledgedAt),
    ));
  const acknowledgedIds = new Set(acknowledged.map(row => row.incidentId));
  const mine = await db.select({ incidentId: safeguardingCaseAssignments.incidentId })
    .from(safeguardingCaseAssignments).where(and(
      inArray(safeguardingCaseAssignments.incidentId, ids),
      eq(safeguardingCaseAssignments.personId, actor.actorPersonId),
      isNull(safeguardingCaseAssignments.revokedAt),
    ));
  const mineIds = new Set(mine.map(row => row.incidentId));
  const overdue = candidates.filter(row =>
    !acknowledgedIds.has(row.incidentId) && !mineIds.has(row.incidentId));
  if (overdue.length) {
    await db.transaction(async tx => {
      await writeAudit(tx, actor, {
        action: "safeguarding.overdue.list",
        entityType: "person",
        entityId: actor.actorPersonId!,
        scope: { siteIds: actor.scope.siteIds, organizationIds: actor.scope.organizationIds },
        after: { incidentIds: overdue.map(row => row.incidentId) },
        contextExtras: { classification: "safeguarding_restricted", metadataOnly: true },
      });
    });
  }
  return {
    overdue: overdue.map(row => ({
      incidentId: row.incidentId,
      incidentNumber: row.incidentNumber,
      siteId: row.siteId,
      urgent: row.urgent,
      reportedAt: row.reportedAt,
      acknowledgmentDueAt: row.acknowledgmentDueAt,
      claimResponsibility: responsibilityBySite.get(row.siteId)!,
    })),
  };
}

/**
 * A configured deputy/CAN fallback takes over a restricted case whose
 * acknowledgment target has passed with no recorded human acknowledgment.
 * This is not synthetic authorization: the person must be the site's CURRENT
 * named deputy/CAN fallback with an active Person record and matching scope,
 * the case must still be filed and completely unacknowledged, and the
 * assignment uniqueness constraint is the idempotency boundary. The takeover
 * creates a real named assignment and response handoff, with event and audit
 * records; case content remains restricted until that assignment exists.
 */
export async function claimOverdueSafeguardingResponse(actor: AccessContext, incidentId: string) {
  if (!isSafeguardingResponderRole(actor.role) || !actor.actorPersonId)
    throw new AuthorizationError("scoped safeguarding responder grant");
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!incident || incident.type !== "safeguarding_concern" ||
      incident.classification !== "safeguarding_restricted")
    throw new AuthorizationError("restricted safeguarding case resource");
  assertOrganizationScope(actor, incident.organizationId);
  assertSiteScope(actor, incident.siteId);
  const [configuration] = await db.select({
    responsibility: safeguardingSiteResponders.responsibility,
  }).from(safeguardingSiteResponders)
    .innerJoin(people, eq(people.id, safeguardingSiteResponders.personId))
    .where(and(
      eq(safeguardingSiteResponders.siteId, incident.siteId),
      eq(safeguardingSiteResponders.personId, actor.actorPersonId),
      inArray(safeguardingSiteResponders.responsibility, ["deputy", "can_lead"]),
      eq(people.active, true),
    )).limit(1);
  if (!configuration)
    throw new AuthorizationError("current configured deputy or CAN fallback responder for this site");
  const [concern] = await db.select({
    acknowledgmentDueAt: safeguardingConcerns.acknowledgmentDueAt,
  }).from(safeguardingConcerns)
    .where(eq(safeguardingConcerns.incidentId, incidentId)).limit(1);
  if (!concern) throw new AuthorizationError("safeguarding concern resource");
  if (incident.status !== "filed")
    throw new Error("This case is no longer awaiting a first response");
  if (concern.acknowledgmentDueAt >= new Date())
    throw new Error("The acknowledgment target has not passed; the assigned responder still has time");
  const [existingAssignment] = await db.select({ id: safeguardingCaseAssignments.id })
    .from(safeguardingCaseAssignments).where(and(
      eq(safeguardingCaseAssignments.incidentId, incidentId),
      eq(safeguardingCaseAssignments.personId, actor.actorPersonId),
      isNull(safeguardingCaseAssignments.revokedAt),
    )).limit(1);
  if (existingAssignment)
    throw new Error("You are already assigned to this case; use acknowledge or escalate");
  const acknowledged = await db.select({ id: incidentNotifications.id })
    .from(incidentNotifications).where(and(
      eq(incidentNotifications.incidentId, incidentId),
      eq(incidentNotifications.purpose, "safeguarding_concern_response"),
      isNotNull(incidentNotifications.acknowledgedAt),
    )).limit(1);
  if (acknowledged.length)
    throw new Error("A responder has already acknowledged this case; no takeover is needed");
  return db.transaction(async tx => {
    // Re-check inside the transaction: a concurrent acknowledgment between
    // the pre-checks and this write must cancel the takeover.
    const [current] = await tx.select({status:incidents.status}).from(incidents)
      .where(eq(incidents.id,incidentId)).for("update").limit(1);
    if(current?.status!=="filed")throw new Error("This case is no longer awaiting a first response");
    const raced = await tx.select({ id: incidentNotifications.id })
      .from(incidentNotifications).where(and(
        eq(incidentNotifications.incidentId, incidentId),
        eq(incidentNotifications.purpose, "safeguarding_concern_response"),
        isNotNull(incidentNotifications.acknowledgedAt),
      )).limit(1);
    if (raced.length)
      throw new Error("A responder has already acknowledged this case; no takeover is needed");
    const created = await tx.insert(safeguardingCaseAssignments).values({
      incidentId,
      personId: actor.actorPersonId!,
      responsibility: configuration.responsibility,
      assignedByPersonId: actor.actorPersonId,
    }).onConflictDoNothing().returning({ id: safeguardingCaseAssignments.id });
    if (!created.length)
      throw new Error("This responsibility is already assigned; reload your workspace");
    await tx.insert(incidentNotifications).values({
      incidentId,
      recipientPersonId: actor.actorPersonId!,
      recipientType: "safeguarding_responder",
      recipientLabel: configuration.responsibility,
      channel: "in_app",
      purpose: "safeguarding_concern_response",
      status: "pending" as const,
    });
    const eventId = await emitEvent(tx, {
      eventType: EventTypes.SafeguardingConcernEscalated,
      aggregateType: "incident",
      aggregateId: incidentId,
      actorPersonId: actor.actorPersonId,
      organizationId: incident.organizationId,
      siteId: incident.siteId,
      programId: incident.programId,
      payload: {
        routedResponsibilities: [configuration.responsibility],
        trigger: "acknowledgment_overdue",
        emergencyServicesDispatched: false,
      },
    });
    await writeAudit(tx, actor, {
      action: "safeguarding.concern.claim_overdue",
      entityType: "incident",
      entityId: incidentId,
      scope: { organizationId: incident.organizationId, siteId: incident.siteId, programId: incident.programId },
      after: { responsibility: configuration.responsibility, trigger: "acknowledgment_overdue" },
      contextExtras: { domainEventId: eventId },
    });
    return { claimed: true as const, responsibility: configuration.responsibility };
  });
}

async function authorizeEvidenceOrExternalReporter(
  actor: AccessContext,
  incidentId: string,
  capability: "safeguarding.evidence.add" | "safeguarding.external_report.record",
): Promise<SafeguardingCaseResource> {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!incident) throw new AuthorizationError("safeguarding case resource");
  if (incident.reporterPersonId === actor.actorPersonId) {
    assertSafeguardingReporterRelationship(actor, incident);
    return incident;
  }
  await loadIncidentAndAssignment(actor, incidentId, capability);
  return incident;
}

export async function addSafeguardingEvidence(actor: AccessContext, input: SafeguardingEvidenceInput) {
  const incident = await authorizeEvidenceOrExternalReporter(actor, input.incidentId, "safeguarding.evidence.add");
  const [replay] = await db.select().from(incidentEvidence).where(and(
    eq(incidentEvidence.incidentId, input.incidentId),
    eq(incidentEvidence.addedByPersonId, actor.actorPersonId!),
    eq(incidentEvidence.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (replay) {
    if (replay.type !== input.type || replay.description !== input.description ||
        replay.documentId !== (input.documentId ?? null)) {
      throw new Error("This idempotency key was already used for different evidence");
    }
    return { evidenceId: replay.id, replayed: true };
  }
  if (input.documentId) {
    const [document] = await db.select({ id: documents.id }).from(documents).where(and(
      eq(documents.id, input.documentId),
      eq(documents.subjectType, "incident"),
      eq(documents.subjectId, input.incidentId),
      eq(documents.sensitivityTier, "safeguarding_restricted"),
    )).limit(1);
    if (!document) throw new AuthorizationError("restricted incident evidence document");
  }
  try {
    return await db.transaction(async (tx) => {
      const [evidence] = await tx.insert(incidentEvidence).values({
        incidentId: input.incidentId,
        documentId: input.documentId,
        type: input.type,
        description: input.description,
        addedByPersonId: actor.actorPersonId!,
        idempotencyKey: input.idempotencyKey,
      }).returning({ id: incidentEvidence.id });
      if (!evidence) throw new Error("Failed to preserve safeguarding evidence");
      const eventId = await emitEvent(tx, {
        eventType: EventTypes.SafeguardingEvidenceAdded,
        aggregateType: "incident",
        aggregateId: input.incidentId,
        actorPersonId: actor.actorPersonId,
        organizationId: incident.organizationId,
        siteId: incident.siteId,
        programId: incident.programId,
        payload: { evidenceId: evidence.id, evidenceType: input.type, hasDocument: Boolean(input.documentId) },
      });
      await writeAudit(tx, actor, {
        action: "safeguarding.evidence.add",
        entityType: "incident_evidence",
        entityId: evidence.id,
        scope: { organizationId: incident.organizationId, siteId: incident.siteId, programId: incident.programId, incidentId: input.incidentId },
        after: { incidentId: input.incidentId, type: input.type, documentId: input.documentId ?? null },
        contextExtras: { domainEventId: eventId, idempotencyKey: input.idempotencyKey },
      });
      return { evidenceId: evidence.id, replayed: false };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [concurrent] = await db.select({ id: incidentEvidence.id }).from(incidentEvidence).where(and(
      eq(incidentEvidence.incidentId, input.incidentId),
      eq(incidentEvidence.addedByPersonId, actor.actorPersonId!),
      eq(incidentEvidence.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (concurrent) return { evidenceId: concurrent.id, replayed: true };
    throw error;
  }
}

export async function recordSafeguardingExternalReport(
  actor: AccessContext,
  input: SafeguardingExternalReportInput,
) {
  const incident = await authorizeEvidenceOrExternalReporter(
    actor,
    input.incidentId,
    "safeguarding.external_report.record",
  );
  const whereReplay = and(
    eq(safeguardingExternalReports.incidentId, input.incidentId),
    eq(safeguardingExternalReports.reporterPersonId, actor.actorPersonId!),
    eq(safeguardingExternalReports.idempotencyKey, input.idempotencyKey),
  );
  const [replay] = await db.select().from(safeguardingExternalReports).where(whereReplay).limit(1);
  if (replay) {
    if (replay.status !== input.status || replay.agencyType !== input.agencyType ||
        replay.agencyLabel !== input.agencyLabel || replay.channel !== input.channel ||
        replay.occurredAt.toISOString() !== input.occurredAt.toISOString() ||
        replay.reference !== (input.reference ?? null) || replay.details !== (input.details ?? null)) {
      throw new Error("This idempotency key was already used for a different external-report record");
    }
    return { externalReportId: replay.id, replayed: true };
  }
  try {
    return await db.transaction(async (tx) => {
      const [record] = await tx.insert(safeguardingExternalReports).values({
        incidentId: input.incidentId,
        reporterPersonId: actor.actorPersonId!,
        idempotencyKey: input.idempotencyKey,
        status: input.status,
        agencyType: input.agencyType,
        agencyLabel: input.agencyLabel,
        channel: input.channel,
        occurredAt: input.occurredAt,
        reference: input.reference,
        details: input.details,
      }).returning({ id: safeguardingExternalReports.id });
      if (!record) throw new Error("Failed to record independent external report");
      const eventId = await emitEvent(tx, {
        eventType: EventTypes.SafeguardingExternalReportRecorded,
        aggregateType: "incident",
        aggregateId: input.incidentId,
        actorPersonId: actor.actorPersonId,
        organizationId: incident.organizationId,
        siteId: incident.siteId,
        programId: incident.programId,
        payload: { externalReportId: record.id, status: input.status, agencyType: input.agencyType },
      });
      await writeAudit(tx, actor, {
        action: "safeguarding.external_report.record",
        entityType: "safeguarding_external_report",
        entityId: record.id,
        scope: { organizationId: incident.organizationId, siteId: incident.siteId, programId: incident.programId, incidentId: input.incidentId },
        after: {
          incidentId: input.incidentId,
          status: input.status,
          agencyType: input.agencyType,
          occurredAt: input.occurredAt.toISOString(),
        },
        contextExtras: { domainEventId: eventId, idempotencyKey: input.idempotencyKey },
      });
      return { externalReportId: record.id, replayed: false };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [concurrent] = await db.select({ id: safeguardingExternalReports.id })
      .from(safeguardingExternalReports).where(whereReplay).limit(1);
    if (concurrent) return { externalReportId: concurrent.id, replayed: true };
    throw error;
  }
}

export async function getSafeguardingWorkspace(actor: AccessContext) {
  if (!isSafeguardingResponderRole(actor.role)) {
    assertOnsiteSafeguardingSubmissionScope(actor, actor.grantSiteId!);
    const site = await loadSite(actor, actor.grantSiteId!);
    const { policy } = await loadPolicyAndResponders(site.id);
    const reports = await db.select({
      incidentId: incidents.id,
      incidentNumber: incidents.incidentNumber,
      reportedAt: incidents.reportedAt,
      immediateActions: incidents.immediateActions,
      urgent: safeguardingConcerns.urgent,
      acknowledgmentDueAt: safeguardingConcerns.acknowledgmentDueAt,
    }).from(safeguardingConcerns)
      .innerJoin(incidents, eq(incidents.id, safeguardingConcerns.incidentId))
      .where(and(
        eq(safeguardingConcerns.reporterPersonId, actor.actorPersonId!),
        eq(incidents.siteId, site.id),
        ...(actor.scope.programIds?.length
          ? [or(isNull(incidents.programId), inArray(incidents.programId, actor.scope.programIds))]
          : [isNull(incidents.programId)]),
        eq(incidents.type, "safeguarding_concern"),
        eq(incidents.classification, "safeguarding_restricted"),
      )).orderBy(desc(incidents.reportedAt)).limit(50);
    const incidentIds = reports.map(row => row.incidentId);
    const acknowledgments = incidentIds.length ? await db.select({
      incidentId: incidentNotifications.incidentId,
      acknowledgedAt: incidentNotifications.acknowledgedAt,
    }).from(incidentNotifications).where(and(
      inArray(incidentNotifications.incidentId, incidentIds),
      eq(incidentNotifications.purpose, "safeguarding_concern_response"),
    )) : [];
    const externalReports = incidentIds.length ? await db.select({
      id: safeguardingExternalReports.id,
      incidentId: safeguardingExternalReports.incidentId,
      status: safeguardingExternalReports.status,
      agencyType: safeguardingExternalReports.agencyType,
      agencyLabel: safeguardingExternalReports.agencyLabel,
      channel: safeguardingExternalReports.channel,
      occurredAt: safeguardingExternalReports.occurredAt,
      reference: safeguardingExternalReports.reference,
      details: safeguardingExternalReports.details,
    }).from(safeguardingExternalReports).where(and(
      inArray(safeguardingExternalReports.incidentId, incidentIds),
      eq(safeguardingExternalReports.reporterPersonId, actor.actorPersonId!),
    )).orderBy(desc(safeguardingExternalReports.occurredAt)) : [];
    return {
      mode: "reporter" as const,
      site: { id: site.id, name: site.name },
      policy: policy?.active ? {
        procedureVersion: policy.procedureVersion,
        emergencyInstructions: policy.emergencyInstructions,
        externalReportingInstructions: policy.externalReportingInstructions,
        offlineInstructions: policy.offlineInstructions,
      } : null,
      reports: reports.map(report => ({
        ...report,
        acknowledgedAt: acknowledgments.find(row => row.incidentId === report.incidentId && row.acknowledgedAt)?.acknowledgedAt ?? null,
        externalReports: externalReports.filter(row => row.incidentId === report.incidentId),
      })),
    };
  }

  if (!actor.actorPersonId || !actor.scope.siteIds?.length || !actor.scope.organizationIds?.length) {
    throw new AuthorizationError("scoped safeguarding responder grant");
  }
  const cases = await db.select({
    incident: incidents,
    concern: safeguardingConcerns,
    responsibility: safeguardingCaseAssignments.responsibility,
  }).from(safeguardingCaseAssignments)
    .innerJoin(incidents, eq(incidents.id, safeguardingCaseAssignments.incidentId))
    .innerJoin(safeguardingConcerns, eq(safeguardingConcerns.incidentId, incidents.id))
    .where(and(
      eq(safeguardingCaseAssignments.personId, actor.actorPersonId),
      isNull(safeguardingCaseAssignments.revokedAt),
      inArray(incidents.siteId, actor.scope.siteIds),
      inArray(incidents.organizationId, actor.scope.organizationIds),
      ...(actor.scope.programIds?.length
        ? [or(isNull(incidents.programId), inArray(incidents.programId, actor.scope.programIds))]
        : [isNull(incidents.programId)]),
      eq(incidents.type, "safeguarding_concern"),
      eq(incidents.classification, "safeguarding_restricted"),
    )).orderBy(desc(incidents.reportedAt)).limit(100);
  for (const row of cases) {
    assertSafeguardingCaseAccess(actor, row.incident, {
      personId: actor.actorPersonId,
      responsibility: row.responsibility,
      revokedAt: null,
    });
  }
  if (cases.length) {
    await db.transaction(async (tx) => {
      await writeAudit(tx, actor, {
        action: "safeguarding.case.list",
        entityType: "person",
        entityId: actor.actorPersonId!,
        scope: { siteIds: actor.scope.siteIds, organizationIds: actor.scope.organizationIds },
        after: { incidentIds: cases.map(row => row.incident.id) },
        contextExtras: { classification: "safeguarding_restricted" },
      });
    });
  }
  const acknowledgments = cases.length ? await db.select({
    incidentId: incidentNotifications.incidentId,
    acknowledgedAt: incidentNotifications.acknowledgedAt,
  }).from(incidentNotifications).where(and(
    inArray(incidentNotifications.incidentId, cases.map(row => row.incident.id)),
    eq(incidentNotifications.recipientPersonId, actor.actorPersonId),
    eq(incidentNotifications.purpose, "safeguarding_concern_response"),
  )) : [];
  return {
    mode: "responder" as const,
    cases: cases.map(row => ({
      incidentId: row.incident.id,
      incidentNumber: row.incident.incidentNumber,
      siteId: row.incident.siteId,
      status: row.incident.status,
      closedAt: row.incident.closedAt,
      reportedAt: row.incident.reportedAt,
      occurredAt: row.incident.occurredAt,
      urgent: row.concern.urgent,
      concernKinds: row.concern.concernKinds,
      acknowledgmentDueAt: row.concern.acknowledgmentDueAt,
      responsibility: row.responsibility,
      acknowledgedAt: acknowledgments.find(item => item.incidentId === row.incident.id && item.acknowledgedAt)?.acknowledgedAt ?? null,
    })),
  };
}

export async function getSafeguardingCase(actor: AccessContext, incidentId: string) {
  return db.transaction(async (tx) => {
    const [incident] = await tx.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
    if (!incident) throw new AuthorizationError("safeguarding case resource");
    const [assignment] = await tx.select().from(safeguardingCaseAssignments).where(and(
      eq(safeguardingCaseAssignments.incidentId, incidentId),
      eq(safeguardingCaseAssignments.personId, actor.actorPersonId!),
      isNull(safeguardingCaseAssignments.revokedAt),
    )).limit(1);
    assertSafeguardingCaseAccess(actor, incident, assignment);
    const [concern] = await tx.select().from(safeguardingConcerns)
      .where(eq(safeguardingConcerns.incidentId, incidentId)).limit(1);
    if (!concern) throw new AuthorizationError("safeguarding concern resource");
    const [student] = concern.studentProfileId ? await tx.select({
      preferredName: people.preferredName,
      legalFirstName: people.legalFirstName,
      legalLastName: people.legalLastName,
    }).from(studentProfiles)
      .innerJoin(people, eq(people.id, studentProfiles.personId))
      .where(eq(studentProfiles.id, concern.studentProfileId)).limit(1) : [];
    const [evidence, externalReports, assignments, notifications, reviews] = await Promise.all([
      tx.select().from(incidentEvidence).where(eq(incidentEvidence.incidentId, incidentId)).orderBy(asc(incidentEvidence.createdAt)),
      tx.select().from(safeguardingExternalReports).where(eq(safeguardingExternalReports.incidentId, incidentId)).orderBy(asc(safeguardingExternalReports.occurredAt)),
      tx.select({
        id: safeguardingCaseAssignments.id,
        personId: safeguardingCaseAssignments.personId,
        responsibility: safeguardingCaseAssignments.responsibility,
        assignedAt: safeguardingCaseAssignments.assignedAt,
        revokedAt: safeguardingCaseAssignments.revokedAt,
        preferredName: people.preferredName,
        legalFirstName: people.legalFirstName,
        legalLastName: people.legalLastName,
      }).from(safeguardingCaseAssignments)
        .innerJoin(people, eq(people.id, safeguardingCaseAssignments.personId))
        .where(eq(safeguardingCaseAssignments.incidentId, incidentId)),
      tx.select({
        id: incidentNotifications.id,
        recipientPersonId: incidentNotifications.recipientPersonId,
        recipientLabel: incidentNotifications.recipientLabel,
        purpose: incidentNotifications.purpose,
        createdAt: incidentNotifications.createdAt,
        acknowledgedAt: incidentNotifications.acknowledgedAt,
      }).from(incidentNotifications).where(eq(incidentNotifications.incidentId, incidentId)),
      tx.select({id:incidentReviews.id,reviewerPersonId:incidentReviews.reviewerPersonId,
        level:incidentReviews.level,status:incidentReviews.status,notes:incidentReviews.notes,
        decision:incidentReviews.decision,reviewedAt:incidentReviews.reviewedAt,
      }).from(incidentReviews).where(eq(incidentReviews.incidentId,incidentId)).orderBy(asc(incidentReviews.createdAt)),
    ]);
    await writeAudit(tx, actor, {
      action: "safeguarding.case.read",
      entityType: "incident",
      entityId: incidentId,
      scope: { organizationId: incident.organizationId, siteId: incident.siteId, programId: incident.programId },
      contextExtras: { classification: incident.classification, responsibility: assignment!.responsibility },
    });
    return {
      // Explicit DTO: never expose arbitrary Incident metadata or future
      // restricted columns merely because a responder can open one case.
      incident: {
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        type: incident.type,
        severity: incident.severity,
        status: incident.status,
        occurredAt: incident.occurredAt,
        reportedAt: incident.reportedAt,
        siteId: incident.siteId,
        programId: incident.programId,
        locationText: incident.locationText,
        summary: incident.summary,
        immediateActions: incident.immediateActions,
        classification: incident.classification,
        closedAt: incident.closedAt,
        resolutionSummary: typeof incident.metadata.safeguardingResolutionSummary === "string"
          ? incident.metadata.safeguardingResolutionSummary
          : null,
      },
      concern,
      student: student ? {
        name: student.preferredName ?? `${student.legalFirstName} ${student.legalLastName}`,
      } : null,
      evidence,
      externalReports,
      assignments,
      notifications,
      reviews:reviews.map(review=>({...review,canComplete:incident.status==="filed"&&
        review.status==="pending"&&review.reviewerPersonId===actor.actorPersonId})),
    };
  });
}

/** Complete an existing canonical Incident review under restricted case access.
 * An internal review outcome never attests that an outside legal duty ended.
 */
export async function completeSafeguardingCaseReview(actor:AccessContext,input:{
  incidentId:string;reviewId:string;outcome:string;
}){
  const outcome=input.outcome.trim();
  if(outcome.length<10||outcome.length>2000)throw new Error("Record a 10-2000 character factual review outcome");
  const {incident}=await loadIncidentAndAssignment(actor,input.incidentId,"safeguarding.respond");
  return db.transaction(async tx=>{
    const [current]=await tx.select({status:incidents.status}).from(incidents)
      .where(eq(incidents.id,incident.id)).for("update").limit(1);
    const [review]=await tx.select().from(incidentReviews).where(and(
      eq(incidentReviews.id,input.reviewId),eq(incidentReviews.incidentId,incident.id),
    )).for("update").limit(1);
    if(!review||review.reviewerPersonId!==actor.actorPersonId)
      throw new AuthorizationError("only the named restricted case reviewer can complete this review");
    if(review.status==="complete"){
      if(review.decision===outcome)return {reviewId:review.id,replayed:true};
      throw new Error("This review already has a recorded outcome");
    }
    if(current?.status!=="filed")throw new Error("This restricted case is closed");
    const reviewedAt=new Date();
    await tx.update(incidentReviews).set({status:"complete",decision:outcome,reviewedAt,updatedAt:reviewedAt})
      .where(eq(incidentReviews.id,review.id));
    const eventId=await emitEvent(tx,{
      eventType:EventTypes.SafeguardingCaseReviewCompleted,aggregateType:"incident",aggregateId:incident.id,
      actorPersonId:actor.actorPersonId,organizationId:incident.organizationId,siteId:incident.siteId,programId:incident.programId,
      payload:{reviewId:review.id,classification:"safeguarding_restricted",outcomeRecorded:true,externalDutyCompleted:false},
    });
    await writeAudit(tx,actor,{action:"safeguarding.review.complete",entityType:"incident",entityId:incident.id,
      scope:{organizationId:incident.organizationId,siteId:incident.siteId,programId:incident.programId},
      before:{reviewId:review.id,status:"pending"},after:{reviewId:review.id,status:"complete",outcome},
      contextExtras:{domainEventId:eventId}});
    return {reviewId:review.id,replayed:false};
  });
}

/** Assign a canonical review only within an already-authorized restricted case.
 * The client-generated review ID is the retry boundary, never an access grant.
 */
export async function assignSafeguardingCaseReview(actor:AccessContext,input:{
  incidentId:string;reviewId:string;reviewerPersonId:string;
  kind:"protective_measure_review"|"external_reporting_review"|"follow_up_review";notes:string;
}){
  const notes=input.notes.trim();
  if(notes.length<10||notes.length>2000||
    !["protective_measure_review","external_reporting_review","follow_up_review"].includes(input.kind))
    throw new Error("Choose a recognized internal review and describe the task in 10-2000 characters");
  const {incident}=await loadIncidentAndAssignment(actor,input.incidentId,"safeguarding.respond");
  return db.transaction(async tx=>{
    const [current]=await tx.select({status:incidents.status}).from(incidents)
      .where(eq(incidents.id,incident.id)).for("update").limit(1);
    const [existing]=await tx.select().from(incidentReviews).where(eq(incidentReviews.id,input.reviewId)).limit(1);
    if(existing){
      if(existing.incidentId===incident.id&&existing.reviewerPersonId===input.reviewerPersonId&&
        existing.level===input.kind&&existing.notes===notes)return {reviewId:existing.id,replayed:true};
      throw new Error("This review identifier is already in use");
    }
    if(current?.status!=="filed")throw new Error("This restricted case is closed");
    const [eligible]=await tx.select({id:safeguardingCaseAssignments.id}).from(safeguardingCaseAssignments)
      .innerJoin(people,eq(people.id,safeguardingCaseAssignments.personId))
      .innerJoin(accountPersonGrants,eq(accountPersonGrants.personId,people.id))
      .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
      .where(and(eq(safeguardingCaseAssignments.incidentId,incident.id),
        eq(safeguardingCaseAssignments.personId,input.reviewerPersonId),isNull(safeguardingCaseAssignments.revokedAt),
        eq(people.active,true),eq(accountPersonGrants.active,true),eq(accessAccounts.disabled,false),
        isNotNull(accessAccounts.emailVerifiedAt),eq(accountPersonGrants.organizationId,incident.organizationId!),
        or(eq(accountPersonGrants.siteId,incident.siteId),isNull(accountPersonGrants.siteId)),
        inArray(accountPersonGrants.role,["safeguarding_responder","safeguarding_lead"])))
      .for("share",{of:[safeguardingCaseAssignments,people,accountPersonGrants,accessAccounts]}).limit(1);
    if(!eligible)throw new AuthorizationError("reviewer must already have current restricted case access");
    const [created]=await tx.insert(incidentReviews).values({id:input.reviewId,incidentId:incident.id,
      reviewerPersonId:input.reviewerPersonId,level:input.kind,notes})
      .onConflictDoNothing().returning({id:incidentReviews.id});
    if(!created)throw new Error("This review identifier is already in use");
    const eventId=await emitEvent(tx,{
      eventType:EventTypes.SafeguardingCaseReviewAssigned,aggregateType:"incident",aggregateId:incident.id,
      actorPersonId:actor.actorPersonId,organizationId:incident.organizationId,siteId:incident.siteId,programId:incident.programId,
      payload:{reviewId:input.reviewId,classification:"safeguarding_restricted"},
    });
    await notifyMany(tx,[{recipientPersonId:input.reviewerPersonId,type:"safeguarding_response_required",
      title:"Restricted case review assigned",body:"Open your assigned safeguarding workspace to review the internal task.",
      resourceType:"safeguarding_concern",resourceId:incident.id,eventId}]);
    await writeAudit(tx,actor,{action:"safeguarding.review.assign",entityType:"incident",entityId:incident.id,
      scope:{organizationId:incident.organizationId,siteId:incident.siteId,programId:incident.programId},
      after:{reviewId:input.reviewId,reviewerPersonId:input.reviewerPersonId,kind:input.kind},contextExtras:{domainEventId:eventId}});
    return {reviewId:input.reviewId,replayed:false};
  });
}

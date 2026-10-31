import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { completeJourneyRequirement } from "@/modules/journeys/complete-requirement";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { programTypes } from "@/domain/program-offerings";
import { isPublicSiteSlug, publicSiteHost } from "@/domain/public-site-address";
import { activateProgram,createProgramOrientation,startProgramLaunch } from "./program-launch-service";
import { listOpeningOperators } from "./opening-handoff.server";

import { isLaunchOpeningDate, launchOpeningDate } from "@/domain/launch-opening-date";
import { launchEntrySelection } from "@/domain/launch-entry";

/** Convert database JSONB's unknown-value index signatures to genuine
 * serializable values before crossing a TanStack server-function boundary. */
type SafeJson = string | number | boolean | null | SafeJson[] | {[key:string]:SafeJson};
function safeJson(value:unknown):SafeJson {
  if(value===null||typeof value==="string"||typeof value==="boolean")return value;
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  if(Array.isArray(value))return value.map(safeJson);
  if(typeof value==="object")return Object.fromEntries(
    Object.entries(value).map(([key,entry])=>[key,safeJson(entry)]));
  return null;
}
function safeJsonObject(value:Record<string,unknown>):Record<string,SafeJson>{
  return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,safeJson(entry)]));
}

const uuid = z.string().uuid();

const startLaunchInput = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),
  type: z.enum(programTypes),
  gradeRange: z.object({
    min: z.string().trim().min(1).max(10),
    max: z.string().trim().min(1).max(10),
  }),
  deliveryModel: z
    .object({
      onsite: z.boolean().optional(),
      asynchronous: z.boolean().optional(),
      liveOnline: z.boolean().optional(),
      onsiteDaysPerWeek: z.number().int().min(1).max(7).optional(),
    })
    .refine(
      (model) => !!(model.onsite || model.asynchronous || model.liveOnline),
      "Select at least one delivery model",
    ),
  hostOrganizationId: uuid,
  jurisdictionId: uuid,
  academicProviderOrganizationId: uuid,
  creditIssuingOrganizationId: uuid.optional(),
  creditMode: z.enum(["credit_bearing", "non_credit"]).optional(),
  siteId: uuid.optional(),
  targetOpeningDate: z.string().refine(isLaunchOpeningDate, "Choose a valid target opening date").optional(),
});

async function registrarContext(capability: string) {
  const context = await getCommandContext(getRequest());
  assertCapability(context, capability);
  if (context.role !== "registrar") {
    throw new AuthorizationError("registrar program launch workspace");
  }
  return context;
}

/** Wizard dropdown options, scoped to the registrar's verified organization grant. */
export const listLaunchOptions = createServerFn({ method: "GET" }).handler(
  async () => {
    const context = await registrarContext("program.read");
    const organizationIds = context.scope.organizationIds ?? [];
    if (!organizationIds.length) {
      return { organizations: [], academicProviderOrganizations: [], creditIssuingOrganizations: [], sites: [], jurisdictions: [] };
    }
    const [{ db }, s, { and, asc, eq, inArray, or }] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const [organizationRows, siteRows, jurisdictionRows, canProviderRows] = await Promise.all([
      db
        .select({ id: s.organizations.id, name: s.organizations.name, type: s.organizations.type })
        .from(s.organizations)
        .where(inArray(s.organizations.id, organizationIds))
        .orderBy(asc(s.organizations.name)),
      db
        .select({
          id: s.sites.id,
          organizationId: s.sites.organizationId,
          name: s.sites.name,
          slug: s.sites.slug,
          timezone: s.sites.timezone,
        })
        .from(s.sites)
        .where(and(inArray(s.sites.organizationId, organizationIds),
          ...(context.grantSiteId === null ? [] : [eq(s.sites.id, context.grantSiteId)])))
        .orderBy(asc(s.sites.name)),
      db
        .select({ id: s.jurisdictions.id, code: s.jurisdictions.code, name: s.jurisdictions.name })
        .from(s.jurisdictions)
        .orderBy(asc(s.jurisdictions.name)),
      // CAN provider choices are distinct from the host's organization grants.
      // This is public organization identity, not a grant or verified service agreement.
      db.select({ id: s.organizations.id, name: s.organizations.name, type: s.organizations.type })
        .from(s.organizations).where(eq(s.organizations.type, "can_network"))
        .orderBy(asc(s.organizations.name)),
    ]);
    const knownIds = new Set(organizationRows.map(organization => organization.id));
    const academicProviderOrganizations = [
      ...organizationRows,
      ...canProviderRows.filter(provider => !knownIds.has(provider.id)),
    ];
    return {
      organizations: organizationRows, // The host selector remains scoped to the local registrar.
      academicProviderOrganizations,
      creditIssuingOrganizations: academicProviderOrganizations,
      sites: siteRows,
      jurisdictions: jurisdictionRows,
    };
  },
);

/** Start a GF3 host/program launch: creates the Program and instantiates its Launch Journey. */
export const startLaunch = createServerFn({ method: "POST" })
  .validator((data: unknown) => startLaunchInput.parse(data))
  .handler(async ({ data }) => {
    const context = await registrarContext("program.launch.start");
    if (!context.scope.organizationIds?.includes(data.hostOrganizationId)) {
      throw new AuthorizationError("host organization scope");
    }
    const organizationWide = context.grantSiteId === null;
    if (!organizationWide && !data.siteId) {
      throw new AuthorizationError("site-scoped launch requires a site");
    }
    if (data.siteId && !organizationWide && !context.scope.siteIds?.includes(data.siteId)) {
      throw new AuthorizationError("site scope");
    }
    // Organization-wide grants have no site filter. The domain service checks
    // that the target site belongs to the selected host organization.
    const permittedContext = organizationWide
      ? { ...context, scope: { ...context.scope, siteIds: undefined } }
      : context;
    return startProgramLaunch(permittedContext, data);
  });

/** Programs in pre-active states with their Launch Journey and requirement checklist. */
export const listLaunches = createServerFn({ method: "GET" }).handler(
  async () => {
    const context = await registrarContext("program.read");
    const organizationIds = context.scope.organizationIds ?? [];
    if (!organizationIds.length) return { launches: [] };
    const [{ db }, s, { and, asc, eq, inArray, or }] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const canReviewerOrganizations = context.grantSiteId === null && !context.scope.siteIds?.length && context.capabilities.has("program.activate")
      ? await db.select({ id: s.organizations.id }).from(s.organizations)
          .where(and(inArray(s.organizations.id, organizationIds), eq(s.organizations.type, "can_network")))
      : [];
    const programRows = await db
      .select({
        id: s.programs.id,
        name: s.programs.name,
        slug: s.programs.slug,
        type: s.programs.type,
        status: s.programs.status,
        organizationId: s.programs.organizationId,
        academicProviderOrganizationId: s.programs.academicProviderOrganizationId,
        siteId: s.programs.siteId,
        siteTimezone: s.sites.timezone,
        metadata: s.programs.metadata,
        publicSiteSlug: s.sitePublications.slug,
        publicSiteStatus: s.sitePublications.status,
        createdAt: s.programs.createdAt,
      })
      .from(s.programs)
      .leftJoin(s.sites, eq(s.sites.id, s.programs.siteId))
      .leftJoin(s.sitePublications, eq(s.sitePublications.siteId, s.programs.siteId))
      .where(
        and(
          or(inArray(s.programs.organizationId, organizationIds),
            ...(canReviewerOrganizations.length ? [inArray(s.programs.academicProviderOrganizationId, canReviewerOrganizations.map(org => org.id))] : [])),
          inArray(s.programs.status, ["draft", "launching", "ready"]),
          ...(context.grantSiteId === null ? [] : [eq(s.programs.siteId, context.grantSiteId)]),
          ...(context.scope.programIds?.length
            ? [inArray(s.programs.id, context.scope.programIds)] : []),
          ...(context.scope.siteIds?.length
            ? [inArray(s.programs.siteId, context.scope.siteIds)] : []),
        ),
      )
      .orderBy(asc(s.programs.createdAt));
    const launches = await Promise.all(
      programRows.map(async (program) => {
        const [journey] = await db
          .select({ id: s.journeys.id, status: s.journeys.status })
          .from(s.journeys)
          .where(
            and(
              eq(s.journeys.participantType, "program"),
              eq(s.journeys.participantId, program.id),
            ),
          )
          .limit(1);
        const requirements = journey
          ? await db
              .select({
                id: s.journeyRequirements.id,
                key: s.journeyRequirements.key,
                title: s.journeyRequirements.title,
                status: s.journeyRequirements.status,
                blocking: s.journeyRequirements.blocking,
                ownerPersonId: s.journeyRequirements.ownerPersonId,
                evidence: s.journeyRequirements.evidence,
                metadata: s.journeyRequirements.metadata,
              })
              .from(s.journeyRequirements)
              .where(eq(s.journeyRequirements.journeyId, journey.id))
              .orderBy(asc(s.journeyRequirements.createdAt))
          : [];
        const { metadata, ...record } = program;
        const targetOpeningDate = launchOpeningDate(metadata);
        return {
          ...record,
          ...(targetOpeningDate ? { targetOpeningDate } : {}),
          createdAt: program.createdAt.toISOString(),
          // Re-read canonical Site publication state on every launch reload.
          publicSite: program.publicSiteSlug && isPublicSiteSlug(program.publicSiteSlug)
            ? { host: publicSiteHost(program.publicSiteSlug),
                status: program.publicSiteStatus === "published" ? "published" as const : "draft" as const }
            : null,
          journey: journey ?? null,
          requirements:requirements.map(requirement=>({
            ...requirement,
            evidence:requirement.evidence.map(safeJsonObject),
            metadata:safeJsonObject(requirement.metadata),
          })),
          canReviewEvidence: canReviewerOrganizations.some(org => org.id === program.academicProviderOrganizationId),
          openingOperators:await listOpeningOperators(program),
        };
      }),
    );
    return { launches };
  },
);

/**
 * Record a school-owned launch requirement. The shared command rechecks the
 * locked requirement's current owner so a registrar cannot complete CAN or
 * third-party work through this launch endpoint.
 */
export const completeLaunchRequirement = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ journeyRequirementId: uuid, confirmed: z.literal(true) }).strict().parse(data),
  )
  .handler(async ({ data }) => {
    const context = await registrarContext("journey.requirement.complete");
    const journeyStatus = await completeJourneyRequirement(
      context,
      data.journeyRequirementId,
      [{ fact: "school_owned_requirement_confirmed" }],
      { allowedCurrentStatuses: ["needs_you"] },
    );
    return { journeyRequirementId: data.journeyRequirementId, journeyStatus };
  });

/**
 * Submit a written evidence statement against a canonical program Launch Journey.
 * Submission does not complete or approve the requirement.
 */
export const submitLaunchEvidence = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    journeyRequirementId: uuid,
    statement: z.string().trim().min(10).max(4000),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const context = await registrarContext("journey.requirement.complete");
    const [{ db }, s, { eq }] = await Promise.all([
      import("@/db/client"), import("@/db/schema"), import("drizzle-orm"),
    ]);
    return db.transaction(async tx => {
      const [row] = await tx.select({
        id: s.journeyRequirements.id,
        status: s.journeyRequirements.status,
        evidence: s.journeyRequirements.evidence,
        metadata: s.journeyRequirements.metadata,
        journeyStatus: s.journeys.status,
        participantType: s.journeys.participantType,
        programId: s.journeys.programId,
        organizationId: s.journeys.organizationId,
        siteId: s.journeys.siteId,
      }).from(s.journeyRequirements)
        .innerJoin(s.journeys, eq(s.journeys.id, s.journeyRequirements.journeyId))
        .where(eq(s.journeyRequirements.id, data.journeyRequirementId))
        .for("update").limit(1);
      if (!row || row.participantType !== "program" || !row.programId)
        throw new Error("Program launch requirement not found");
      if (!context.actorPersonId || !context.scope.organizationIds?.includes(row.organizationId ?? "") ||
          (context.scope.programIds && !context.scope.programIds.includes(row.programId)) ||
          (context.scope.siteIds && (!row.siteId || !context.scope.siteIds.includes(row.siteId))))
        throw new AuthorizationError("program launch evidence scope");
      if (row.status === "complete" || ["active", "complete", "cancelled"].includes(row.journeyStatus))
        throw new Error("This launch requirement is closed to evidence submissions");
      if (row.status !== "needs_you" && row.status !== "needs_can")
        throw new Error("Evidence submissions are only accepted for school or CAN-owned pending requirements");
      if (row.metadata.enrollmentForm !== undefined)
        throw new Error("Enrollment form evidence belongs in the dedicated admissions review workflow");
      const previousStatement = [...row.evidence].reverse().find(item => item.kind === "launch_evidence_statement");
      const pendingDecision = row.evidence.map(item => item.kind).lastIndexOf("launch_evidence_statement") >
        row.evidence.map(item => item.kind).lastIndexOf("launch_evidence_review");
      if (pendingDecision && (row.status === "needs_can" || row.metadata.evidenceReviewRequired === true))
        throw new Error("Evidence is already awaiting institutional review");

      const latestReview = [...row.evidence].reverse().find(item => item.kind === "document_review" || item.kind === "launch_evidence_review");
      if (previousStatement?.text === data.statement && previousStatement?.submittedByPersonId === context.actorPersonId &&
          (!latestReview || row.evidence.lastIndexOf(previousStatement) > row.evidence.lastIndexOf(latestReview)))
        return { journeyRequirementId: row.id, submitted: true, duplicate: true };
      const now = new Date();
      await tx.update(s.journeyRequirements).set({
        evidence: [...row.evidence, {
          kind: "launch_evidence_statement",
          text: data.statement,
          submittedAt: now.toISOString(),
          submittedByPersonId: context.actorPersonId,
        }],
        updatedAt: now,
      }).where(eq(s.journeyRequirements.id, row.id));
      await writeAudit(tx, context, {
        action: "journey.requirement.evidence.submit",
        entityType: "journey_requirement",
        entityId: row.id,
        scope: { programId: row.programId },
        before: { status: row.status },
        after: { status: row.status, evidenceSubmitted: true },
      });
      return { journeyRequirementId: row.id, submitted: true };
    });
  });

/**
 * CAN institutional decision on a submitted program-opening evidence statement.
 * Site-level registrar grants cannot approve their own launch evidence.
 */
export const reviewLaunchEvidence = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    journeyRequirementId: uuid,
    decision: z.enum(["accepted", "rejected"]),
    reason: z.string().trim().max(1000).default(""),
  }).strict().refine(value => value.decision !== "rejected" ? value.reason.length >= 1 : value.reason.length >= 5,
    "Institutional decisions require a rationale; corrections require at least five characters").parse(value))
  .handler(async ({ data }) => {
    const context = await registrarContext("program.activate");
    if (!context.actorPersonId || context.grantSiteId !== null || context.scope.siteIds?.length)
      throw new AuthorizationError("CAN institutional evidence reviewer");
    const [{ db }, s, { and, eq, ne, inArray }] = await Promise.all([
      import("@/db/client"), import("@/db/schema"), import("drizzle-orm"),
    ]);
    const canOrganizations = context.scope.organizationIds?.length
      ? await db.select({ id: s.organizations.id }).from(s.organizations)
          .where(and(inArray(s.organizations.id, context.scope.organizationIds),
            eq(s.organizations.type, "can_network")))
      : [];
    if (!canOrganizations.length) throw new AuthorizationError("CAN institutional organization grant");
    return db.transaction(async tx => {
      const [row] = await tx.select({
        id: s.journeyRequirements.id, journeyId: s.journeyRequirements.journeyId,
        status: s.journeyRequirements.status, evidence: s.journeyRequirements.evidence,
        metadata: s.journeyRequirements.metadata, journeyStatus: s.journeys.status,
        participantType: s.journeys.participantType, programId: s.journeys.programId,
        organizationId: s.journeys.organizationId, siteId: s.journeys.siteId,
      }).from(s.journeyRequirements)
        .innerJoin(s.journeys, eq(s.journeys.id, s.journeyRequirements.journeyId))
        .where(eq(s.journeyRequirements.id, data.journeyRequirementId))
        .for("update").limit(1);
      if (!row || row.participantType !== "program" || !row.programId)
        throw new Error("Program launch requirement not found");
      if (context.scope.programIds && !context.scope.programIds.includes(row.programId))
        throw new AuthorizationError("program launch review scope");
      const [reviewProgram] = await tx.select({ providerOrganizationId: s.programs.academicProviderOrganizationId })
        .from(s.programs).where(eq(s.programs.id, row.programId)).limit(1);
      if (!reviewProgram || !canOrganizations.some(org => org.id === reviewProgram.providerOrganizationId))
        throw new AuthorizationError("CAN academic provider authority for program");
      if (["active", "complete", "cancelled"].includes(row.journeyStatus) || row.status === "complete")
        throw new Error("This launch requirement is closed to review");
      if (!["needs_can", "needs_you"].includes(row.status))
        throw new Error("Requirement is not awaiting review");
      if (row.metadata.enrollmentForm !== undefined)
        throw new Error("Enrollment forms require their dedicated review workflow");
      if (row.status === "needs_you" && row.metadata.evidenceReviewRequired !== true)
        throw new Error("School-owned work must use its owner-specific completion workflow unless institutional review is required");
      const latestSubmission = [...row.evidence].reverse().find(item => item.kind === "launch_evidence_statement");
      if (row.metadata.evidenceReviewRequired !== true && row.status !== "needs_can")
        throw new Error("Institutional decisions require an explicitly reviewable or CAN-owned requirement");
      if (!latestSubmission || typeof latestSubmission.submittedAt !== "string")
        throw new Error("Evidence must be submitted before review");
      if (latestSubmission.submittedByPersonId === context.actorPersonId)
        throw new Error("A reviewer cannot approve or reject their own evidence");
      if (typeof latestSubmission.submittedByPersonId !== "string" || !latestSubmission.submittedByPersonId)
        throw new Error("Evidence without an attributable submitter cannot be institutionally reviewed");
      const latestDecision = [...row.evidence].reverse().find(item => item.kind === "launch_evidence_review");
      if (latestDecision && row.evidence.lastIndexOf(latestDecision) > row.evidence.lastIndexOf(latestSubmission))
        throw new Error("This evidence submission has already been reviewed");
      const now = new Date();
      const nextStatus = data.decision === "accepted" ? "complete" : row.status === "needs_can" ? "needs_can" : "needs_you";
      await tx.update(s.journeyRequirements).set({
        status: nextStatus, completedAt: nextStatus === "complete" ? now : null,
        evidence: [...row.evidence, {
          kind: "launch_evidence_review", status: data.decision, text: data.reason,
          reviewedAt: now.toISOString(), reviewedByPersonId: context.actorPersonId,
          submissionAt: latestSubmission.submittedAt,
        }],
        updatedAt: now,
      }).where(eq(s.journeyRequirements.id, row.id));
      if (data.decision === "accepted") {
        await emitEvent(tx, {
          eventType: EventTypes.JourneyRequirementCompleted,
          aggregateType: "journey_requirement",
          aggregateId: row.id,
          actorPersonId: context.actorPersonId,
          payload: { journeyId: row.journeyId },
        });
      }
      if (data.decision === "accepted") {
        await writeAudit(tx, context, {
          action: "journey.requirement.complete", entityType: "journey_requirement", entityId: row.id,
          scope: { organizationId: row.organizationId, siteId: row.siteId, programId: row.programId },
          before: { status: row.status }, after: { status: "complete" },
        });
      }
      const incomplete = await tx.select({ id: s.journeyRequirements.id })
        .from(s.journeyRequirements).where(and(
          eq(s.journeyRequirements.journeyId, row.journeyId),
          eq(s.journeyRequirements.blocking, true),
          ne(s.journeyRequirements.status, "complete"),
        ));
      const ready = incomplete.length === 0;
      const nextJourneyStatus = ready ? "ready" : "in_progress";
      if (row.journeyStatus !== nextJourneyStatus) {
        await tx.update(s.journeys).set({
          status: nextJourneyStatus, updatedAt: now,
        }).where(eq(s.journeys.id, row.journeyId));
      }
      if (ready && row.journeyStatus !== "ready") {
        await emitEvent(tx, {
          eventType: EventTypes.JourneyReady,
          aggregateType: "journey", aggregateId: row.journeyId,
          actorPersonId: context.actorPersonId, payload: {},
        });
      }
      if (ready && row.journeyStatus !== "ready") {
        await writeAudit(tx, context, {
          action: "journey.ready", entityType: "journey", entityId: row.journeyId,
          scope: { organizationId: row.organizationId, siteId: row.siteId, programId: row.programId },
          before: { status: row.journeyStatus }, after: { status: "ready" },
        });
      }
      await writeAudit(tx, context, {
        action: "journey.requirement.evidence.review",
        entityType: "journey_requirement", entityId: row.id,
        scope: { organizationId: row.organizationId, siteId: row.siteId, programId: row.programId },
        before: { status: row.status },
        after: { status: nextStatus, decision: data.decision },
      });
      return { journeyRequirementId: row.id, decision: data.decision, journeyStatus: ready ? "ready" as const : "in_progress" as const };
    });
  });

/** Activate a launched program; program-launch-service enforces the Launch Journey ready invariant. */
export const activateLaunch = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ programId: uuid,recipientPersonId:uuid.optional() }).strict().parse(data))
  .handler(async ({ data }) => {
    const context = await registrarContext("program.activate");
    await activateProgram(context, data.programId,data.recipientPersonId?{recipientPersonId:data.recipientPersonId}:undefined);
    return { programId: data.programId, status: "active" as const };
  });

/** Create a host site inside an organization-wide registrar grant. */
export const createLaunchSite = createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({
  organizationId:uuid,name:z.string().trim().min(2).max(160),
  slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timezone:z.string().trim().min(3).max(80),
 }).parse(v))
 .handler(async({data})=>{
  const actor=await registrarContext("program.launch.start");
  if(!actor.actorPersonId||!actor.scope.organizationIds?.includes(data.organizationId)||actor.grantSiteId!==null)
   throw new AuthorizationError("organization-wide site creation");
  const [{db},s,{provisionNewSitePublicationDraft},{and,eq,or,sql}]=await Promise.all([
   import("@/db/client"),import("@/db/schema"),
   import("@/modules/sites/site-public-provisioning.server"),
   import("drizzle-orm"),
  ]);
  return db.transaction(async tx=>{
   // D1: recognize the church's existing Site instead of creating a duplicate.
   // The unique index only covers slug; a renamed slug would otherwise fork the campus.
   const [existing]=await tx.select({id:s.sites.id,name:s.sites.name,slug:s.sites.slug})
    .from(s.sites)
    .where(and(eq(s.sites.organizationId,data.organizationId),or(
     eq(s.sites.slug,data.slug),
     sql`lower(${s.sites.name}) = ${data.name.trim().toLowerCase()}`,
    )))
    .limit(1);
   if(existing)throw new Error(
    `This church already has the site "${existing.name}" (${existing.slug}). Select it from the Site list instead of creating a duplicate.`);
   const [site]=await tx.insert(s.sites).values({...data}).returning({id:s.sites.id});
   if(!site)throw new Error("Failed to create Site");
   await emitEvent(tx,{
    eventType:EventTypes.SiteCreated,aggregateType:"site",aggregateId:site.id,
    actorPersonId:actor.actorPersonId,organizationId:data.organizationId,
    siteId:site.id,payload:{name:data.name,timezone:data.timezone},
   });
   await writeAudit(tx,actor,{
    action:"site.create",entityType:"site",entityId:site.id,
    scope:{organizationId:data.organizationId,siteId:site.id},
    after:{name:data.name,timezone:data.timezone}});
   // PUB-12: create the draft within the same transaction, AFTER the Site
   // creation evidence. Nothing is public, and no publishing grant is issued.
   const publicSiteDraft=await provisionNewSitePublicationDraft(tx,actor,{
    id:site.id,organizationId:data.organizationId,slug:data.slug,
   });
   return {siteId:site.id,publicSiteDraft};
  });
 });
/** Create a unique orientation event and expose it to site/program calendars. */
export const scheduleLaunchOrientation=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({programId:uuid,
  title:z.string().trim().min(2).max(160),startsAt:z.string().datetime({offset:true}),
  endsAt:z.string().datetime({offset:true}),timezone:z.string().min(3)}).parse(v))
 .handler(async({data})=>{
  const actor=await registrarContext("calendar.event.create");
  if(actor.scope.programIds && !actor.scope.programIds.includes(data.programId))
   throw new AuthorizationError("orientation program");
  const start=new Date(data.startsAt),end=new Date(data.endsAt);
  if(end<=start)throw new Error("Orientation end must follow start");
  const [{db},s,{eq}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
  const [program]=await db.select({siteId:s.programs.siteId})
   .from(s.programs).where(eq(s.programs.id,data.programId)).limit(1);
  const [site]=program?.siteId?await db.select({timezone:s.sites.timezone}).from(s.sites)
   .where(eq(s.sites.id,program.siteId)).limit(1):[];
  const eventId=await createProgramOrientation(actor,{programId:data.programId,title:data.title,
   startsAt:start,endsAt:end,timezone:site?.timezone??data.timezone});
  return {eventId};
 });

/** Read-only landing decision. Uses the same verified registrar/capability
 * boundary as starting a launch; it never creates or completes records. */
export const getLaunchEntry = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({
    siteId: uuid.optional(), programId: uuid.optional(),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const context = await registrarContext("program.launch.start");
    const options = await listLaunchOptions();
    if (!options.organizations.length) return null;
    const [{ db }, s, { and, eq, inArray }] = await Promise.all([
      import("@/db/client"), import("@/db/schema"), import("drizzle-orm"),
    ]);
    // Organization-wide registrars can legitimately have no enumerated Program IDs.
    // Discover existing Programs through the verified organization/Site grant, not
    // through an optional list that would falsely signal a first-time launch.
    const records = await db.select({
      id: s.programs.id, siteId: s.programs.siteId, status: s.programs.status,
    }).from(s.programs).where(and(
      inArray(s.programs.organizationId, options.organizations.map(org => org.id)),
      ...(context.grantSiteId === null ? [] : [eq(s.programs.siteId, context.grantSiteId)]),
      ...(context.grantSiteId !== null && context.scope.programIds?.length
        ? [inArray(s.programs.id, context.scope.programIds)] : []),
      ...(context.scope.siteIds?.length
        ? [inArray(s.programs.siteId, context.scope.siteIds)] : []),
    ));
    return launchEntrySelection({ programs: records, sites: options.sites, selection: data });
  });



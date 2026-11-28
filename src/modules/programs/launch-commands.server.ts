import {z} from "zod";
import {parseCommandInput} from "@/domain/command-input";
import {schoolPlanningLocationSchema} from "@/domain/school-stub";
import {hasRegistrarAuthority} from "@/domain/school-roles";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {completeJourneyRequirement} from "@/modules/journeys/complete-requirement";
import {EventTypes} from "@/domain/event-types";
import {emitEvent,writeAudit} from "@/platform/mutation";
import {readSitePhysicalAddress,launchOnsiteDaysPerWeekSchema} from "@/domain/site-setup-configuration";
import {addressStateJurisdiction,launchSiteJurisdictionIssue,siteJurisdictionLocation} from "@/domain/site-jurisdiction-default";
import {DomainError} from "@/domain/errors";
import {launchGradeRangeIsOrdered} from "@/domain/launch-grade-range";
import {programTypes} from "@/domain/program-offerings";
import {isLaunchOpeningDate} from "@/domain/launch-opening-date";
import {activateProgram,createProgramOrientation,startProgramLaunch} from "./program-launch-service";
const uuid=z.string().uuid();
export async function resolveLaunchRegistrar(request:Request,capability:string){
 const context=await getCommandContext(request);
 assertCapability(context,capability);
 if(!hasRegistrarAuthority(context.role))throw new AuthorizationError("registrar program launch workspace");
 return context;
}
export const startLaunchInput = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),
  type: z.enum(programTypes),
  gradeRange: z.object({
    min: z.string().trim().min(1).max(10),
    max: z.string().trim().min(1).max(10),
  }).refine(launchGradeRangeIsOrdered,"Minimum grade cannot come after maximum grade"),
  deliveryModel: z
    .object({
      onsite: z.boolean().optional(),
      asynchronous: z.boolean().optional(),
      liveOnline: z.boolean().optional(),
      onsiteDaysPerWeek: launchOnsiteDaysPerWeekSchema.optional(),
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
}).refine(input=>!input.deliveryModel.onsite||Boolean(input.siteId),{
  message:"Choose a school location for onsite learning.",path:["siteId"],
});

export async function startLaunchService(request:Request,raw:unknown){
 const data=parseCommandInput(startLaunchInput,raw);

    const context = await resolveLaunchRegistrar(request,"program.launch.start");
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
    // A state mismatch is not equivalent to a manual legal exception. Reject it
    // before creation; jurisdiction applicability remains independently reviewed by C.
    if(data.siteId) {
      const [{db},schema,{eq}]=await Promise.all([
        import("@/db/client"),import("@/db/schema"),import("drizzle-orm"),
      ]);
      const [site]=await db.select({address:schema.sites.address,
        metadata:schema.sites.metadata,organizationId:schema.sites.organizationId}).from(schema.sites)
        .where(eq(schema.sites.id,data.siteId)).limit(1);
      if(site && site.organizationId===data.hostOrganizationId) {
        const address=readSitePhysicalAddress(site.address);
        const planningLocation=schoolPlanningLocationSchema.safeParse(site.metadata.schoolPlanningLocation);
        const location=siteJurisdictionLocation(address.value,planningLocation.success?planningLocation.data:null);
        if(location?.country==="US") {
          const jurisdictions=await db.select({
            id:schema.jurisdictions.id,code:schema.jurisdictions.code,
            name:schema.jurisdictions.name,
          }).from(schema.jurisdictions);
          const issue=launchSiteJurisdictionIssue(location,jurisdictions,data.jurisdictionId);
          if(issue?.code==="LAUNCH_LOCATION_MISMATCH") throw new DomainError(issue.code,issue.message);
          const target=jurisdictions.find(item=>item.id===data.jurisdictionId);
          if(target && !addressStateJurisdiction(location,[target]))
            throw new DomainError("LAUNCH_LOCATION_MISMATCH");
        }
      }
    }
    // Organization-wide grants have no site filter. The domain service checks
    // that the target site belongs to the selected host organization.
    const permittedContext = organizationWide
      ? { ...context, scope: { ...context.scope, siteIds: undefined } }
      : context;
    return startProgramLaunch(permittedContext, data);
}

export const completeLaunchRequirementInput=z.object({ journeyRequirementId: uuid, confirmed: z.literal(true) }).strict();

export async function completeLaunchRequirementService(request:Request,raw:unknown){
 const data=parseCommandInput(completeLaunchRequirementInput,raw);

    const context = await resolveLaunchRegistrar(request,"journey.requirement.complete");
    const journeyStatus = await completeJourneyRequirement(
      context,
      data.journeyRequirementId,
      [{ fact: "school_owned_requirement_confirmed" }],
      { allowedCurrentStatuses: ["needs_you"] },
    );
    return { journeyRequirementId: data.journeyRequirementId, journeyStatus };
}

export const submitLaunchEvidenceInput=z.object({
    journeyRequirementId: uuid,
    statement: z.string().trim().min(10).max(4000),
  }).strict();

export async function submitLaunchEvidenceService(request:Request,raw:unknown){
 const data=parseCommandInput(submitLaunchEvidenceInput,raw);

    const context = await resolveLaunchRegistrar(request,"journey.requirement.complete");
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
}

export const reviewLaunchEvidenceInput=z.object({
    journeyRequirementId: uuid,
    decision: z.enum(["accepted", "rejected"]),
    reason: z.string().trim().max(1000).default(""),
  }).strict().refine(value => value.decision !== "rejected" ? value.reason.length >= 1 : value.reason.length >= 5,
    "Institutional decisions require a rationale; corrections require at least five characters");

export async function reviewLaunchEvidenceService(request:Request,raw:unknown){
 const data=parseCommandInput(reviewLaunchEvidenceInput,raw);

    const context = await resolveLaunchRegistrar(request,"program.activate");
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
}

export const activateLaunchInput=z.object({ programId: uuid,recipientPersonId:uuid.optional() }).strict();

export async function activateLaunchService(request:Request,raw:unknown){
 const data=parseCommandInput(activateLaunchInput,raw);

    const context = await resolveLaunchRegistrar(request,"program.activate");
    await activateProgram(context, data.programId,data.recipientPersonId?{recipientPersonId:data.recipientPersonId}:undefined);
    return { programId: data.programId, status: "active" as const };
}

export const scheduleLaunchOrientationInput=z.object({programId:uuid,
  title:z.string().trim().min(2).max(160),startsAt:z.string().datetime({offset:true}),
  endsAt:z.string().datetime({offset:true}),timezone:z.string().min(3)});

export async function scheduleLaunchOrientationService(request:Request,raw:unknown){
 const data=parseCommandInput(scheduleLaunchOrientationInput,raw);

  const actor=await resolveLaunchRegistrar(request,"calendar.event.create");
  if(actor.scope.programIds && !actor.scope.programIds.includes(data.programId))
   throw new AuthorizationError("orientation program");
  const start=new Date(data.startsAt),end=new Date(data.endsAt);
  if(end<=start)throw new DomainError("VALIDATION_FAILED","Orientation end must follow start");
  const [{db},s,{eq}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
  const [program]=await db.select({siteId:s.programs.siteId})
   .from(s.programs).where(eq(s.programs.id,data.programId)).limit(1);
  const [site]=program?.siteId?await db.select({timezone:s.sites.timezone}).from(s.sites)
   .where(eq(s.sites.id,program.siteId)).limit(1):[];
  const eventId=await createProgramOrientation(actor,{programId:data.programId,title:data.title,
   startsAt:start,endsAt:end,timezone:site?.timezone??data.timezone});
  return {eventId};
}

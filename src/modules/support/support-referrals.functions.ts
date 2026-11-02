import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { actorSiteIds,recordAudit,requireActor,type Actor } from "@/modules/identity/actors.server";
import { emitEvent,notify } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and,desc,eq,inArray,or,sql } from "drizzle-orm";
import { z } from "zod";

const stages = ["submitted","accepted","plan_created","in_service","review","closed"] as const;
type Stage = typeof stages[number];
const categories = ["academic","attendance","learning","personal","planning"] as const;
const areas = ["academic","learning","counselor","planning"] as const;
const destination: Record<typeof categories[number], typeof areas[number]> = { academic:"academic", attendance:"academic", learning:"learning", personal:"counselor", planning:"planning" };
const stagePriority = (x: Stage) => stages.indexOf(x);
function safeNote(input: string, max = 1500) { const s = input.trim(); if (s.length < 3 || s.length > max) throw new Error(`Notes must be 3-${max} characters`); return s; }
async function context() { const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]); return { db, s }; }


async function taughtStudentIds(db: any, s: any, actor: Actor): Promise<string[]> {
  const rows = await db.select({ studentProfileId: s.enrollments.studentProfileId }).from(s.enrollments)
    .innerJoin(s.sectionTeachers,eq(s.sectionTeachers.sectionId,s.enrollments.sectionId))
    .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
    .where(and(eq(s.sectionTeachers.personId,actor.actorPersonId),
      eq(s.enrollments.status,"active"),eq(s.enrollments.kind,"section"),
      inArray(s.sections.siteId,actor.scope.siteIds??[]),
      inArray(s.sections.programId,actor.scope.programIds??[])));
  return [...new Set(rows.map((r: { studentProfileId: string }) => r.studentProfileId))] as string[];
}

/** A site role alone does not authorize reading or changing confidential cases.
 * Case owners and explicitly delegated, unexpired sensitive-access grantees can act.
 */
function casePermission(s: any, actor: Actor, permission: "read" | "write") {
  return or(
    eq(s.actions.ownerPersonId, actor.actorPersonId),
    sql`EXISTS (
      SELECT 1 FROM sensitive_access_grants AS g
      WHERE g.resource_type = 'support_referral'
        AND g.resource_id = ${s.supportReferrals.id}
        AND g.site_id = ${s.actions.siteId}
        AND g.grantee_person_id = ${actor.actorPersonId}
        AND g.classification = 'support_case'
        AND g.allowed_fields @> ${JSON.stringify([permission])}::jsonb
        AND g.revoked_at IS NULL
        AND g.valid_from <= now()
        AND g.valid_through > now()
    )`,
  );
}

async function loadReferral(tx: any, s: any, referralId: string, actor: Actor) {
  const [record] = await tx.select({ action: s.actions, referral: s.supportReferrals }).from(s.actions)
    .innerJoin(s.supportReferrals, eq(s.supportReferrals.actionId, s.actions.id))
    .where(and(eq(s.actions.id, referralId), eq(s.actions.type, "support_referral"), inArray(s.actions.siteId, actor.scope.siteIds??[]),inArray(s.actions.programId,actor.scope.programIds??[]),casePermission(s,actor,"write")))
    .for("update").limit(1);
  if (!record) throw new AuthorizationError("explicit support-case writer assignment");
  return record;
}

/** One currently active site-scoped coordinator is assigned to each new case.
 * This is routing, not proof of clinical qualification or site-wide case access.
 */
async function firstSpecialistAtSites(tx: any, s: any, sites: string[], area: string): Promise<string | null> {
  const [owner] = await tx.select({ personId: s.accountPersonGrants.personId })
    .from(s.accountPersonGrants)
    .innerJoin(s.accessAccounts,eq(s.accessAccounts.id,s.accountPersonGrants.accountId))
    .innerJoin(s.people,eq(s.people.id,s.accountPersonGrants.personId))
    .where(and(
      eq(s.accountPersonGrants.role, area === "counselor" ? "counselor" : "specialist"),
      inArray(s.accountPersonGrants.siteId, sites),
      eq(s.accountPersonGrants.active, true),
      eq(s.accessAccounts.disabled, false),
      eq(s.people.active, true),
    )).orderBy(s.accountPersonGrants.createdAt).limit(1);
  return owner?.personId ?? null;
}

/** Determine the current authenticated support workspace without a demo role toggle. */
export const getSupportViewerRole=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await requireActor(["student","teacher","specialist","counselor"]);
 return {role:actor.role as "student"|"teacher"|"specialist"|"counselor"};
});

export const getSupportReferrals = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["teacher", "specialist", "counselor"]);
  setResponseHeader("Cache-Control", "no-store");
  const sites = actorSiteIds(actor);
  const { db, s } = await context();
  let subjectIds: string[] | null = null;
  if (actor.role === "teacher") {
    subjectIds = await taughtStudentIds(db, s, actor);
    if (!subjectIds.length) throw new AuthorizationError("referral student relationship");
  }
  const rows = await db.select({
    id: s.actions.id, title: s.actions.title, description: s.actions.description, status: s.actions.status,
    priority: s.actions.priority, metadata: s.actions.metadata, ownerPersonId: s.actions.ownerPersonId, createdAt: s.actions.createdAt,
    stage: s.supportReferrals.stage, category: s.supportReferrals.category, notes: s.supportReferrals.notes,
    academicRecommendation: s.supportReferrals.academicRecommendation, nextReviewAt: s.supportReferrals.nextReviewAt,
    referralId: s.supportReferrals.id,
    studentProfileId: s.actions.subjectId, requestedArea: s.supportReferrals.requestedArea,
  })
    .from(s.actions)
    .innerJoin(s.supportReferrals, eq(s.supportReferrals.actionId, s.actions.id))
    .where(and(
      eq(s.actions.type, "support_referral"),
      inArray(s.actions.siteId, sites),
      inArray(s.actions.programId,actor.scope.programIds??[]),
      subjectIds ? inArray(s.actions.subjectId, subjectIds) : undefined,
       actor.role === "teacher"
         ? eq(s.supportReferrals.reporterPersonId, actor.actorPersonId)
         : casePermission(s, actor, "read"),
    ))
    .orderBy(desc(s.actions.createdAt)).limit(100);
  const referrals = rows;
  const referralIds = referrals.map((x: { referralId: string }) => x.referralId);
  const [plans, services, owners] = await Promise.all([
    actor.role !== "teacher" && referralIds.length
      ? db.select().from(s.supportPlans).where(inArray(s.supportPlans.referralId, referralIds)) : [],
    actor.role !== "teacher" && referralIds.length
      ? db.select().from(s.supportServices).where(inArray(s.supportServices.referralId, referralIds)) : [],
    (() => { const ids = [...new Set(referrals.map((r: { ownerPersonId: string | null }) => r.ownerPersonId).filter((x: string | null): x is string => Boolean(x)))]; return ids.length ? db.select({ id: s.people.id, firstName: s.people.legalFirstName, lastName: s.people.legalLastName }).from(s.people).where(inArray(s.people.id, ids)) : []; })(),
  ]);
  const names = new Map(owners.map((w: { id: string; firstName: string; lastName: string }) => [w.id, `${w.firstName} ${w.lastName}`]));
  return referrals.map((row: any) => {
    const plan = plans.find((p: any) => p.referralId === row.referralId);
    return {
      id: row.id, title: row.title, description: row.description ?? "", status: row.status,
      studentProfileId: row.studentProfileId, requestedArea: row.requestedArea,
      priority: row.priority, stage: row.stage, category: row.category,
      notes: row.notes, academicRecommendation: actor.role === "teacher" ? null : row.academicRecommendation,
      nextReview: actor.role === "teacher" ? "" : row.nextReviewAt ? row.nextReviewAt.toISOString() : "",
      plan: plan ? { goal: plan.goal, intervention: plan.intervention, targetDate: plan.targetDate.toISOString() } : null,
      services: services.filter((x: any) => x.referralId === row.referralId).map((x: any) => ({ id: x.id, kind: x.kind, scheduledAt: x.scheduledAt.toISOString(), status: x.status, outcome: x.outcome })),
      assignedTo: row.ownerPersonId ? names.get(row.ownerPersonId) ?? "Unassigned" : "Unassigned",
      ownerPersonId: row.ownerPersonId, createdAt: row.createdAt.toISOString(),
    };
  });
});

/** Real students in the authenticated teacher's currently assigned, authorized classes. */
export const listTeacherReferralStudents=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await requireActor(["teacher"],"referrals:create");
 const {db,s}=await context();
 const rows=await db.select({id:s.studentProfiles.id,
  firstName:s.people.legalFirstName,lastName:s.people.legalLastName,
  sectionTitle:s.sections.title
 }).from(s.enrollments)
 .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
 .innerJoin(s.sectionTeachers,and(
   eq(s.sectionTeachers.sectionId,s.sections.id),
   eq(s.sectionTeachers.personId,actor.actorPersonId)))
 .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
 .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
 .where(and(eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),
   inArray(s.sections.siteId,actor.scope.siteIds??[]),
   inArray(s.sections.programId,actor.scope.programIds??[])));
 return [...new Map(rows.map(row=>[row.id,{
  id:row.id,name:`${row.firstName} ${row.lastName}`,
  sectionTitle:row.sectionTitle
 }])).values()].sort((a,b)=>a.name.localeCompare(b.name));
});

export const createSupportReferral = createServerFn({ method: "POST" })
  .validator(z.object({
    category: z.enum(categories), priority: z.enum(["normal", "high"]),
    observations: z.string(), includeEvidence: z.boolean(),
    studentProfileId: z.string().uuid(),
  }).parse)
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher"], "referrals:create");
    const observations = safeNote(data.observations);
    const sites = actorSiteIds(actor);
    const { db, s } = await context();
    const students = await taughtStudentIds(db, s, actor);
    const subjectId = data.studentProfileId;
    if (!subjectId || !students.includes(subjectId)) throw new AuthorizationError("referral student relationship");
    const created = await db.transaction(async (tx: any) => {
      // Derive the referral's owning school and program from the student's
      // actual active enrollment in a section taught by this teacher.
      const [placement]=await tx.select({
        siteId:s.sections.siteId,programId:s.sections.programId,
        organizationId:s.programs.organizationId,
      }).from(s.enrollments)
       .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
       .innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
       .innerJoin(s.sectionTeachers,and(
         eq(s.sectionTeachers.sectionId,s.sections.id),
         eq(s.sectionTeachers.personId,actor.actorPersonId)))
       .where(and(eq(s.enrollments.studentProfileId,subjectId),
         eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),
         inArray(s.sections.siteId,actor.scope.siteIds??[]),
         inArray(s.sections.programId,actor.scope.programIds??[])))
       .limit(1);
      if(!placement)throw new AuthorizationError("student enrollment in a taught section");
       const coordinatorPersonId = await firstSpecialistAtSites(
         tx, s, [placement.siteId], destination[data.category],
       );
      const [action] = await tx.insert(s.actions).values({
        type: "support_referral", status: "open", priority: data.priority,
        title: `Student support · ${data.category}`, description: observations,
        ownerPersonId: coordinatorPersonId,
         organizationId: placement.organizationId,
        siteId: placement.siteId,
        programId: placement.programId,
        subjectType: "student_profile", subjectId,
        metadata: { source: "teacher_referral" },
      }).returning({ id: s.actions.id });
      if (!action) throw new Error("Referral not created");
      const [referral] = await tx.insert(s.supportReferrals).values({
        actionId: action.id, stage: "submitted", category: data.category,
        requestedArea: destination[data.category], source: "teacher",
        includeEvidence: data.includeEvidence, notes: observations, reporterPersonId: actor.actorPersonId,
      }).returning({ id: s.supportReferrals.id });
      await tx.insert(s.supportReferralStageEvents).values({ referralId: referral!.id, stage: "submitted", actorPersonId: actor.actorPersonId });
      await emitEvent(tx, {eventType:EventTypes.ActionCreated,aggregateType:"action",aggregateId:action.id,actorPersonId:actor.actorPersonId,payload:{subjectType:"student_profile",subjectId,referralId:referral!.id}});
      await recordAudit(tx, actor, { action: "support_referral.create", resourceType: "action", resourceId: action.id, after: { category: data.category, subjectId, stage: "submitted", coordinatorPersonId }, scope: { siteId: placement.siteId,programId:placement.programId } });
      return action;
    });
    return { referralId: created.id };
  });

export const advanceSupportReferral = createServerFn({ method: "POST" })
  .validator(z.object({
    referralId: z.string().uuid(), nextStage: z.enum(stages), note: z.string(),
    area: z.enum(areas).optional(), nextReview: z.string().optional(),
  }).parse)
  .handler(async ({ data }) => {
    const actor = await requireActor(["specialist", "counselor"], "referrals:manage");
    const note = safeNote(data.note);
    const sites = actorSiteIds(actor);
    const { db, s } = await context();
    return db.transaction(async (tx: any) => {
      const { action: record, referral } = await loadReferral(tx, s, data.referralId, actor);
      const previous = referral.stage as Stage;
      if (previous === "closed") throw new Error("This referral is already closed.");
      if (data.nextStage === "review") {
        const services = await tx.select({ status: s.supportServices.status }).from(s.supportServices).where(eq(s.supportServices.referralId, referral.id));
        if (!services.length || services.some((service: { status: string }) => service.status !== "completed")) throw new Error("Complete the scheduled support services before review");
      }
      if (data.nextStage === "closed" && previous !== "review") throw new Error("Referral must be reviewed before closure");
      if (data.nextStage !== "closed" && stagePriority(data.nextStage) !== stagePriority(previous) + 1) throw new Error("Invalid lifecycle transition");
      const area = data.area ?? referral.requestedArea;
      const owner = record.ownerPersonId && area === referral.requestedArea ? record.ownerPersonId :
        actor.role === (area === "counselor" ? "counselor" : "specialist") ? actor.actorPersonId :
        await firstSpecialistAtSites(tx, s, record.siteId?[record.siteId]:[], area);
      if (!owner) throw new Error(`No active ${area === "counselor" ? "counselor" : "specialist"} is available at this site`);
      const nextReviewAt = data.nextReview ? new Date(data.nextReview) : undefined;
      if (nextReviewAt && Number.isNaN(nextReviewAt.getTime())) throw new Error("Invalid review date");
      await tx.update(s.actions).set({
        status: data.nextStage === "closed" ? "resolved" : "in_progress",
        ownerPersonId: owner,
        resolvedAt: data.nextStage === "closed" ? new Date() : null,
        resolutionNote: data.nextStage === "closed" ? note : null,
        updatedAt: new Date(),
      }).where(eq(s.actions.id, record.id));
      await tx.update(s.supportReferrals).set({
        stage: data.nextStage,
        requestedArea: area,
        academicRecommendation: data.nextStage === "review" ? note : referral.academicRecommendation,
        nextReviewAt: nextReviewAt ?? referral.nextReviewAt,
        updatedAt: new Date(),
      }).where(eq(s.supportReferrals.id, referral.id));
      await tx.insert(s.supportReferralStageEvents).values({ referralId: referral.id, stage: data.nextStage, note, actorPersonId: actor.actorPersonId });
      if ((data.nextStage === "accepted" || data.nextStage === "review") && referral.reporterPersonId) {
        await notify(tx, {
          recipientPersonId: referral.reporterPersonId,
          type: data.nextStage === "accepted" ? "support_referral_accepted" : "support_referral_update",
          title: data.nextStage === "accepted" ? "Student support referral accepted" : "Academic support update",
          body: data.nextStage === "accepted"
            ? "A specialist has accepted your referral."
            : "Your referral has been reviewed. Contact the coordinator for information approved for sharing.",
          resourceType: "action", resourceId: record.id,
        });
      }
      if(data.nextStage==="closed")await emitEvent(tx, {eventType:EventTypes.ActionResolved,aggregateType:"action",aggregateId:record.id,actorPersonId:actor.actorPersonId,payload:{subjectType:record.subjectType,subjectId:record.subjectId,referralId:referral.id}});
      await recordAudit(tx, actor, { action: "support_referral.advance", resourceType: "action", resourceId: record.id, before: { stage: previous }, after: { stage: data.nextStage, ownerPersonId: owner }, scope: { siteId: record.siteId,programId:record.programId } });
      await emitEvent(tx,{eventType:EventTypes.SupportReferralAdvanced,aggregateType:"action",aggregateId:record.id,
        actorPersonId:actor.actorPersonId,payload:{referralId:referral.id,stage:data.nextStage,requestedArea:area}});
      return { stage: data.nextStage };
    });
  });

export const saveSupportPlan = createServerFn({ method: "POST" })
  .validator(z.object({ referralId: z.string().uuid(), goal: z.string(), intervention: z.string(), targetDate: z.string() }).parse)
  .handler(async ({ data }) => {
    const actor = await requireActor(["specialist", "counselor"], "support-plans:manage");
    const goal = safeNote(data.goal, 500), intervention = safeNote(data.intervention, 1000);
    const date = new Date(data.targetDate); if (Number.isNaN(date.getTime())) throw new Error("Invalid review date");
    const sites = actorSiteIds(actor);
    const { db, s } = await context();
    return db.transaction(async (tx: any) => {
      const { action: record, referral } = await loadReferral(tx, s, data.referralId, actor);
      if (!["accepted", "plan_created", "in_service"].includes(referral.stage)) throw new Error("Referral must be accepted before planning");
      const [existing] = await tx.select({ id: s.supportPlans.id }).from(s.supportPlans).where(eq(s.supportPlans.referralId, referral.id)).limit(1);
      if (existing) {
        await tx.update(s.supportPlans).set({ goal, intervention, targetDate: date, updatedAt: new Date() }).where(eq(s.supportPlans.id, existing.id));
      } else {
        await tx.insert(s.supportPlans).values({ referralId: referral.id, goal, intervention, targetDate: date, createdByPersonId: actor.actorPersonId });
      }
      await tx.update(s.actions).set({ status: "in_progress", updatedAt: new Date() }).where(eq(s.actions.id, record.id));
      if (referral.stage === "accepted") {
        await tx.update(s.supportReferrals).set({ stage: "plan_created", nextReviewAt: date, updatedAt: new Date() }).where(eq(s.supportReferrals.id, referral.id));
        await tx.insert(s.supportReferralStageEvents).values({ referralId: referral.id, stage: "plan_created", actorPersonId: actor.actorPersonId });
      } else {
        await tx.update(s.supportReferrals).set({ nextReviewAt: date, updatedAt: new Date() }).where(eq(s.supportReferrals.id, referral.id));
      }
      await recordAudit(tx, actor, { action: "support_plan.save", resourceType: "action", resourceId: record.id, after: { referralId: referral.id, planUpdated: true, targetDate: date.toISOString() }, scope: { siteId: record.siteId } });
      await emitEvent(tx,{eventType:EventTypes.SupportPlanSaved,aggregateType:"action",aggregateId:record.id,
        actorPersonId:actor.actorPersonId,payload:{referralId:referral.id,targetDate:date.toISOString()}});
      return { saved: true };
    });
  });

export const scheduleSupportService = createServerFn({ method: "POST" })
  .validator(z.object({ referralId: z.string().uuid(), kind: z.enum(["tutoring", "coaching", "planning", "learning_support"]), scheduledAt: z.string() }).parse)
  .handler(async ({ data }) => {
    const actor = await requireActor(["specialist", "counselor"], "support-plans:manage");
    const when = new Date(data.scheduledAt); if (Number.isNaN(when.getTime())) throw new Error("Invalid appointment date");
    const sites = actorSiteIds(actor);
    const { db, s } = await context();
    return db.transaction(async (tx: any) => {
      const { action: record, referral } = await loadReferral(tx, s, data.referralId, actor);
      if (!["plan_created", "in_service"].includes(referral.stage)) throw new Error("A support plan must be created first");
      const [service] = await tx.insert(s.supportServices).values({ referralId: referral.id, kind: data.kind, scheduledAt: when, status: "scheduled", createdByPersonId: actor.actorPersonId }).returning({ id: s.supportServices.id });
      if (!service) throw new Error("Service not scheduled");
      if (referral.stage === "plan_created") {
        await tx.update(s.supportReferrals).set({ stage: "in_service", updatedAt: new Date() }).where(eq(s.supportReferrals.id, referral.id));
        await tx.insert(s.supportReferralStageEvents).values({ referralId: referral.id, stage: "in_service", actorPersonId: actor.actorPersonId });
      }
      await recordAudit(tx, actor, { action: "support_service.schedule", resourceType: "support_service", resourceId: service.id, after: { kind: data.kind, scheduledAt: when.toISOString(), referralId: referral.id }, scope: { siteId: record.siteId } });
      await emitEvent(tx,{eventType:EventTypes.SupportServiceScheduled,aggregateType:"support_service",aggregateId:service.id,
        actorPersonId:actor.actorPersonId,payload:{referralId:referral.id,scheduledAt:when.toISOString()}});
      return { id: service.id };
    });
  });

export const completeSupportService = createServerFn({ method: "POST" })
  .validator(z.object({ referralId: z.string().uuid(), serviceId: z.string().uuid(), outcome: z.string() }).parse)
  .handler(async ({ data }) => {
    const actor = await requireActor(["specialist", "counselor"], "support-plans:manage");
    const outcome = safeNote(data.outcome, 600);
    const sites = actorSiteIds(actor);
    const { db, s } = await context();
    return db.transaction(async (tx: any) => {
      const { action: record, referral } = await loadReferral(tx, s, data.referralId, actor);
      if (referral.stage !== "in_service") throw new Error("Referral must be in service before recording completion.");
      const [updated] = await tx.update(s.supportServices).set({ status: "completed", outcome, updatedAt: new Date() })
        .where(and(eq(s.supportServices.id, data.serviceId), eq(s.supportServices.referralId, referral.id), eq(s.supportServices.status, "scheduled")))
        .returning({ id: s.supportServices.id });
      if (!updated) throw new Error("Scheduled service not found");
      await recordAudit(tx, actor, { action: "support_service.complete", resourceType: "support_service", resourceId: updated.id, after: { referralId: referral.id, serviceCompleted: true }, scope: { siteId: record.siteId } });
      await emitEvent(tx,{eventType:EventTypes.SupportServiceCompleted,aggregateType:"support_service",aggregateId:updated.id,
        actorPersonId:actor.actorPersonId,payload:{referralId:referral.id}});
      return { saved: true };
    });
  });

/** Legacy route import compatibility during shared support convergence. */
export const saveSyntheticSupportPlan=saveSupportPlan;
export const scheduleSyntheticSupportService=scheduleSupportService;
export const completeSyntheticSupportService=completeSupportService;

import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import {
  deliveryArrangements, qualificationClaims, sectionCapacityDemands, sectionTeachers,
  staffingEligibilityEvaluations,
} from "@/db/schema";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import { emitEvent, notify, writeAudit } from "@/platform/mutation";
import {
  evaluateTeachingEligibility, teachingStaffingContext, type TeachingEligibilityReader,
} from "./teaching-eligibility.server";
import { evaluateInstructionalCoverage } from "./instructional-coverage.server";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import {
  findCapacityCandidatesInTransaction, reserveInstructionalCapacityInTransaction,
} from "./educational-capacity-service";

import { EventTypes } from "@/domain/event-types";
export { teachingRolePredicate as launchTeacherRolePredicate } from "./teaching-eligibility.server";
type Reader=TeachingEligibilityReader;

export async function launchStaffingContext(sectionId:string,executor:Reader=db){
  const section=await teachingStaffingContext(sectionId,executor);
  if(!section.siteId)throw new Error("Launch staffing requires a school site");
  return {...section,siteId:section.siteId};
}
export function evaluateLaunchTeacher(sectionId:string,personId:string,executor:Reader=db){
  return evaluateTeachingEligibility(sectionId,personId,executor,{
    horizon:"instructional_window",requireAssignment:false,requireSite:true,
  });
}

export async function evaluateLaunchStaffing(sectionId: string, executor: Reader = db) {
  const section = await launchStaffingContext(sectionId, executor);
  const coverage = await evaluateInstructionalCoverage(sectionId, executor);
  const reasons: string[] = [];
  const instructors: {personId: string; policyRuleIds: string[]; verificationEventIds: string[]}[] = [];
  if (!coverage.covered) {
    reasons.push("No assigned instructor delivery arrangement covers the full instructional window.");
  }
  for (const personId of coverage.assignedTeacherIds) {
    const result = await evaluateLaunchTeacher(sectionId, personId, executor);
    if (!result.eligible) reasons.push(...result.reasons);
    instructors.push({personId,policyRuleIds:result.policyRuleIds,verificationEventIds:result.verificationEventIds});
  }
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)],
    from: section.window.from.toISOString(), through: section.window.through.toISOString(), instructors };
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function lockLaunchTeacherClaims(tx: Transaction, personIds: string[]) {
  if (!personIds.length) return;
  // Credential review locks these parent rows before appending its decision.
  await tx.select({ id: qualificationClaims.id }).from(qualificationClaims)
    .where(inArray(qualificationClaims.personId, personIds)).orderBy(qualificationClaims.id).for("share");
}

export async function assignLaunchInstructor(
  tx: Transaction, context: CommandContext,
  input: { programId: string; sectionId: string; teacherPersonId: string; capacityDemandId?: string },
) {
  assertCapability(context, "program.launch.start");
  const initial = await launchStaffingContext(input.sectionId, tx);
  await lockAttendanceConfigurationAtSite(tx, initial.siteId);
  const section = await launchStaffingContext(input.sectionId, tx);
  if (!context.actorPersonId || section.programId !== input.programId ||
    !context.scope.programIds?.includes(section.programId) ||
    !context.scope.organizationIds?.includes(section.organizationId) ||
    (context.scope.siteIds?.length && !context.scope.siteIds.includes(section.siteId))) {
    throw new AuthorizationError("launch teacher assignment scope");
  }
  if (section.siteId !== initial.siteId) throw new Error("Section site changed; reload launch setup before assigning");
  if (!section.active) throw new Error("Cannot assign an instructor to an inactive section");
  // Host launch scope permits planning, but a new academic relationship also
  // requires the live contracted instruction and curriculum services. Recheck
  // inside this transaction so expiry/revocation cannot race the assignment.
  await requireChurchHostedOperatingServices(tx, section.programId, [
    "academic_instruction", "curriculum",
  ]);
  await lockLaunchTeacherClaims(tx, [input.teacherPersonId]);
  const eligibility = await evaluateLaunchTeacher(input.sectionId, input.teacherPersonId, tx);
  if (!eligibility.eligible) throw new Error("Instructor is not eligible: " + eligibility.reasons.join(" "));
  let capacityReservationId: string | null = null;
  if (input.capacityDemandId) {
    const [demand] = await tx.select({
      id: sectionCapacityDemands.id,
      sectionId: sectionCapacityDemands.sectionId,
      status: sectionCapacityDemands.status,
    }).from(sectionCapacityDemands).where(eq(sectionCapacityDemands.id, input.capacityDemandId))
      .for("update").limit(1);
    if (!demand || demand.sectionId !== section.id || demand.status !== "open")
      throw new Error("Open instructional capacity demand does not belong to this class");
    const candidates = await findCapacityCandidatesInTransaction(tx, context, input.capacityDemandId);
    const capacity = candidates.find(candidate =>
      candidate.personId === input.teacherPersonId &&
      candidate.remainingSeats >= candidate.requiredSeats &&
      candidate.remainingDemandSeats >= candidate.requiredSeats);
    if (!capacity) throw new Error("Instructor has no available capacity for this class schedule and enrollment demand");
    const reservation = await reserveInstructionalCapacityInTransaction(tx, context, {
      demandId: input.capacityDemandId,
      offeringId: capacity.offeringId,
      seats: capacity.requiredSeats,
      status: "committed",
    });
    capacityReservationId = reservation.reservationId;
  }
  const [existing] = await tx.select({
    id: deliveryArrangements.id,
    capacityReservationId: deliveryArrangements.capacityReservationId,
  }).from(deliveryArrangements).where(and(
    eq(deliveryArrangements.sectionId, section.id),
    eq(deliveryArrangements.instructorPersonId, input.teacherPersonId),
    eq(deliveryArrangements.academicProviderOrganizationId, section.providerId),
    eq(deliveryArrangements.status, "active"),
    or(isNull(deliveryArrangements.effectiveFrom), lte(deliveryArrangements.effectiveFrom, section.window.from)),
    or(isNull(deliveryArrangements.effectiveThrough), gte(deliveryArrangements.effectiveThrough, section.window.through)),
  )).limit(1);
  if (existing && capacityReservationId && existing.capacityReservationId &&
      existing.capacityReservationId !== capacityReservationId)
    throw new Error("This class already has a different instructional capacity reservation for the selected teacher");
  if (existing && capacityReservationId && !existing.capacityReservationId) {
    await tx.update(deliveryArrangements).set({ capacityReservationId })
      .where(eq(deliveryArrangements.id, existing.id));
  }
  const [assignment] = capacityReservationId ? [undefined] : await tx.insert(sectionTeachers).values({
    sectionId: section.id, personId: input.teacherPersonId, role: "teacher", assignmentSource: "launch",
  }).onConflictDoNothing().returning({ id: sectionTeachers.id });
  if (existing && !assignment) return { created: false };
  const delivery = section.deliveryModel;
  const modality = delivery.liveOnline ? (delivery.onsite ? "hybrid" : "live_online") :
    delivery.asynchronous && !delivery.onsite ? "asynchronous" : "onsite";
  const [arrangement] = existing ? [existing] : await tx.insert(deliveryArrangements).values({
    sectionId: section.id, academicProviderOrganizationId: section.providerId,
    instructorPersonId: input.teacherPersonId, modality, status: "active",
    capacityReservationId,
    effectiveFrom: section.window.from, effectiveThrough: section.window.through,
  }).returning({ id: deliveryArrangements.id });
  if (!arrangement) throw new Error("Failed to create launch delivery arrangement");
  const roleAssignmentId=eligibility.roleAssignmentId;
  if (!roleAssignmentId) throw new Error("Eligible launch teacher must have a scoped role assignment");
  const evaluations = await tx.insert(staffingEligibilityEvaluations).values(eligibility.policyRuleIds.map(policyRuleId => ({
    roleAssignmentId, policyRuleId, result: "eligible",
    explanation: { sectionId: section.id, from: section.window.from.toISOString(),
      through: section.window.through.toISOString(), claimIds: eligibility.claimIds, evaluator: "launch-v1" },
    evidenceIds: eligibility.verificationEventIds,
  }))).returning({id:staffingEligibilityEvaluations.id});
  if (assignment || !existing) await notify(tx, {
    recipientPersonId: input.teacherPersonId, type: "teaching_assignment", status: "unread",
    title: "New teaching assignment", body: "You have been assigned to a launch class",
    resourceType: "section", resourceId: section.id,
  });
  await emitEvent(tx, {
    eventType: EventTypes.DeliveryArrangementActivated, aggregateType: "delivery_arrangement",
    aggregateId: arrangement.id, actorPersonId: context.actorPersonId,
    organizationId: section.organizationId, siteId: section.siteId, programId: section.programId,
    sectionId: section.id, payload: { instructorPersonId: input.teacherPersonId, eligibilityEvaluationIds:evaluations.map(row=>row.id) },
  });
  await writeAudit(tx, context, {
    action: "launch.teacher.assign", entityType: "delivery_arrangement", entityId: arrangement.id,
    scope: { organizationId: section.organizationId, siteId: section.siteId, programId: section.programId, sectionId: section.id },
    after: { personId: input.teacherPersonId, modality,
      from: section.window.from.toISOString(), through: section.window.through.toISOString(),
      policyRuleIds: eligibility.policyRuleIds, claimIds: eligibility.claimIds,
      verificationEventIds:eligibility.verificationEventIds,eligibilityEvaluationIds:evaluations.map(row=>row.id) },
  });
  return { created: true };
}

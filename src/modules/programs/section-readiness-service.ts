import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import {
  enrollments,
  instructionalCapacityReservations,
  qualificationClaims,
  qualificationVerificationEvents,
  sectionCapacityDemands,
  sections,
  terms,
} from "@/db/schema";
import { credentialStatusFromDecision } from "@/domain/credential-workflow";
import { getSectionMeetingPattern } from "@/modules/academic-time/section-schedule-service";
import { getSectionRegistrationPolicy } from "@/modules/learning/section-registration-policy-service";
import { getActiveDeliveryArrangement } from "@/modules/staffing/delivery-arrangement-service";
import { currentCapacityReservationFilter } from "@/modules/staffing/reservation-policy";
import { evaluateLaunchStaffing } from "@/modules/staffing/launch-staffing.server";

export type ReadinessState = "ready" | "needs_review" | "blocked";
export type SectionReadinessItem = {
  key: string;
  state: ReadinessState;
  message: string;
  evidence?: Record<string, unknown>;
};

export async function evaluateSectionReadiness(
  sectionId: string,
  executor: Pick<Database, "select" | "selectDistinctOn"> = db,
  now = new Date(),
  purpose: "operations" | "launch" = "operations",
): Promise<{
  sectionId: string;
  ready: boolean;
  items: SectionReadinessItem[];
  metrics: {
    enrollmentCapacity: number;
    activeEnrollment: number;
    expectedDemand: number | null;
    reservedInstructionalSeats: number;
  };
}> {
  const [section] = await executor
    .select({
      id: sections.id,
      active: sections.active,
      startsAt: sections.startsAt,
      endsAt: sections.endsAt,
      scheduleTemplateId: sections.scheduleTemplateId,
      termId: sections.termId,
      termStartsOn: terms.startsOn,
      termEndsOn: terms.endsOn,
    })
    .from(sections)
    .innerJoin(terms, eq(terms.id, sections.termId))
    .where(eq(sections.id, sectionId))
    .limit(1);

  if (!section) throw new Error("Section not found");

  const [policy, pattern, arrangement, demandRows, enrollmentRows] = await Promise.all([
    getSectionRegistrationPolicy(sectionId, executor),
    getSectionMeetingPattern(sectionId, executor),
    getActiveDeliveryArrangement(sectionId, executor, now),
    executor
      .select({
        id: sectionCapacityDemands.id,
        expectedSeats: sectionCapacityDemands.expectedSeats,
      })
      .from(sectionCapacityDemands)
      .where(and(
        eq(sectionCapacityDemands.sectionId, sectionId),
        eq(sectionCapacityDemands.status, "open"),
      ))
      .limit(1),
    executor
      .select({ count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(and(
        eq(enrollments.sectionId, sectionId),
        eq(enrollments.kind, "section"),
        eq(enrollments.status, "active"),
      )),
  ]);

  const demand = demandRows[0] ?? null;
  const activeEnrollment = enrollmentRows[0]?.count ?? 0;

  let reservedInstructionalSeats = 0;
  if (demand) {
    const reservations = await executor
      .select({ seats: instructionalCapacityReservations.seats })
      .from(instructionalCapacityReservations)
      .where(and(
        eq(instructionalCapacityReservations.demandId, demand.id),
        currentCapacityReservationFilter(now),
      ));
    reservedInstructionalSeats = reservations.reduce(
      (sum: number, row: { seats: number }) => sum + row.seats,
      0,
    );
  }

  const items: SectionReadinessItem[] = [];

  items.push({
    key: "academic_time",
    state: pattern.length > 0 || !section.scheduleTemplateId ? "ready" : "blocked",
    message:
      pattern.length > 0 || !section.scheduleTemplateId
        ? "Academic meeting pattern is usable."
        : "Section schedule exists but has no instructional periods.",
    evidence: { scheduleTemplateId: section.scheduleTemplateId, periods: pattern.length },
  });

  items.push({
    key: "registration_policy",
    state: policy.enrollmentCapacity > 0 ? "ready" : "blocked",
    message:
      policy.enrollmentCapacity > 0
        ? `Registration policy allows up to ${policy.enrollmentCapacity} students.`
        : "Section registration capacity is not configured.",
  });

  if (!demand) {
    items.push({
      key: "capacity_demand",
      state: "needs_review",
      message: "No instructional capacity forecast exists for this section.",
    });
  } else {
    items.push({
      key: "capacity_demand",
      state: demand.expectedSeats > 0 ? "ready" : "blocked",
      message: `Instructional demand forecasts ${demand.expectedSeats} seats.`,
      evidence: { expectedSeats: demand.expectedSeats },
    });
  }

  if (demand) {
    const needed = Math.max(activeEnrollment, demand.expectedSeats);
    items.push({
      key: "instructional_capacity",
      state: reservedInstructionalSeats >= needed ? "ready" : "blocked",
      message:
        reservedInstructionalSeats >= needed
          ? `${reservedInstructionalSeats} instructional seats are reserved for ${needed} required.`
          : `Instructional capacity shortfall: ${needed - reservedInstructionalSeats} more seats are required.`,
      evidence: { needed, reservedInstructionalSeats, activeEnrollment },
    });
  }

  if (purpose === "launch") {
    const coverage = await evaluateLaunchStaffing(sectionId, executor);
    items.push({
      key: "launch_staffing",
      state: coverage.ready ? "ready" : "blocked",
      message: coverage.ready
        ? "Assigned instructors satisfy published qualification policies and delivery covers the instructional window."
        : coverage.reasons.join(" "),
      evidence: { from: coverage.from, through: coverage.through, instructors: coverage.instructors },
    });
  } else if (!arrangement) {
    items.push({
      key: "delivery",
      state: "blocked",
      message: "No active delivery arrangement is effective at the evaluation time.",
    });
  } else {
    items.push({
      key: "delivery",
      state: "ready",
      message: `Delivery is active via ${arrangement.modality}.`,
      evidence: {
        arrangementId: arrangement.id,
        instructorPersonId: arrangement.instructorPersonId,
        facilitatorPersonId: arrangement.facilitatorPersonId,
      },
    });
  }

  if (purpose === "operations" && arrangement?.instructorPersonId) {
    const claims = await executor
      .selectDistinctOn([qualificationClaims.id], {
        claimId: qualificationClaims.id,
        issuedAt: qualificationClaims.issuedAt,
        expiresAt: qualificationClaims.expiresAt,
        decision: qualificationVerificationEvents.decision,
      })
      .from(qualificationClaims)
      .leftJoin(qualificationVerificationEvents, eq(qualificationVerificationEvents.claimId, qualificationClaims.id))
      .where(eq(qualificationClaims.personId, arrangement.instructorPersonId))
      .orderBy(qualificationClaims.id, desc(qualificationVerificationEvents.sequence));

    const reviewedClaims = claims.map(claim => ({
      ...claim, status: credentialStatusFromDecision(claim.decision),
    }));
    const verified = reviewedClaims.some(claim =>
      claim.status === "verified" &&
      (!claim.issuedAt || claim.issuedAt <= now) &&
      (!claim.expiresAt || claim.expiresAt > now),
    );

    items.push({
      key: "qualification_evidence",
      state: verified ? "ready" : "needs_review",
      message: verified
        ? "Instructor has current verified qualification evidence. Program-specific teaching eligibility still requires policy review."
        : "Instructor is assigned, but no current verified qualification evidence was found.",
    });
  }

  if (activeEnrollment > policy.enrollmentCapacity) {
    items.push({
      key: "enrollment_capacity",
      state: "blocked",
      message: `Active enrollment (${activeEnrollment}) exceeds the section limit (${policy.enrollmentCapacity}).`,
    });
  } else {
    items.push({
      key: "enrollment_capacity",
      state: "ready",
      message: `${activeEnrollment} of ${policy.enrollmentCapacity} enrollment seats are in use.`,
    });
  }

  return {
    sectionId,
    ready: items.every(item => item.state !== "blocked"),
    items,
    metrics: {
      enrollmentCapacity: policy.enrollmentCapacity,
      activeEnrollment,
      expectedDemand: demand?.expectedSeats ?? null,
      reservedInstructionalSeats,
    },
  };
}

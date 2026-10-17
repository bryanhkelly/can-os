import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  deliveryArrangements,
  enrollments,
  instructionalCapacityReservations,
  qualificationClaims,
  qualificationVerificationEvents,
  sectionCapacityDemands,
  sectionRegistrationPolicies,
  sections,
  sectionTeachers,
  terms,
} from "@/db/schema";
import { getSectionMeetingPattern } from "@/modules/academic-time/section-schedule-service";
import { getSectionRegistrationPolicy } from "@/modules/learning/section-registration-policy-service";
import { getActiveDeliveryArrangement } from "@/modules/staffing/delivery-arrangement-service";

export type ReadinessState = "ready" | "needs_review" | "blocked";
export type SectionReadinessItem = {
  key: string;
  state: ReadinessState;
  message: string;
  evidence?: Record<string, unknown>;
};

export async function evaluateSectionReadiness(
  sectionId: string,
  executor: any = db,
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
    getActiveDeliveryArrangement(sectionId, executor),
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
        inArray(instructionalCapacityReservations.status, ["held", "committed"]),
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

  if (!arrangement) {
    items.push({
      key: "delivery",
      state: "blocked",
      message: "No active delivery arrangement is assigned.",
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

  if (arrangement?.instructorPersonId) {
    const claims = await executor
      .select({
        claimId: qualificationClaims.id,
        expiresAt: qualificationClaims.expiresAt,
      })
      .from(qualificationClaims)
      .where(eq(qualificationClaims.personId, arrangement.instructorPersonId));

    let verified = false;
    for (const claim of claims) {
      if (claim.expiresAt && claim.expiresAt < new Date()) continue;
      const [latest] = await executor
        .select({ decision: qualificationVerificationEvents.decision })
        .from(qualificationVerificationEvents)
        .where(eq(qualificationVerificationEvents.claimId, claim.claimId))
        .orderBy(desc(qualificationVerificationEvents.sequence))
        .limit(1);
      if (latest?.decision === "verified" || latest?.decision === "approved") {
        verified = true;
        break;
      }
    }

    items.push({
      key: "qualification_evidence",
      state: verified ? "ready" : "needs_review",
      message: verified
        ? "Instructor has current verified qualification evidence."
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

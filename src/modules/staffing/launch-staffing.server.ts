import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import {
  complianceFrameworkVersions, compliancePolicyApplicability, compliancePolicyRules,
  deliveryArrangements, jurisdictions, people, programs, qualificationClaims, qualificationDefinitions,
  qualificationVerificationEvents, roleAssignments, schoolYears, sections, sectionTeachers, terms,
  staffingEligibilityEvaluations,
} from "@/db/schema";
import { credentialStatusFromDecision } from "@/domain/credential-workflow";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import { emitEvent, notify, writeAudit } from "@/platform/mutation";
import { dateTimeInputInTimezone } from "@/modules/calendar/timezone";
import { coverageGaps, evaluateQualificationCoverage, instructionalWindow, type CoveragePolicy, type CoverageWindow } from "./qualification-coverage";

type Reader = Pick<Database, "select" | "selectDistinctOn">;

export async function launchStaffingContext(sectionId: string, executor: Reader = db) {
  const [section] = await executor.select({
    id: sections.id, programId: sections.programId, siteId: sections.siteId, active: sections.active,
    organizationId: programs.organizationId, providerId: programs.academicProviderOrganizationId,
    programSiteId: programs.siteId, yearOrganizationId: schoolYears.organizationId,
    yearSiteId: schoolYears.siteId, yearProgramId: schoolYears.programId,
    jurisdictionId: programs.jurisdictionId, deliveryModel: programs.deliveryModel,
    startsAt: sections.startsAt, endsAt: sections.endsAt,
    startsOn: terms.startsOn, endsOn: terms.endsOn, timezone: schoolYears.timezone,
  }).from(sections).innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
    .where(eq(sections.id, sectionId)).limit(1);
  if (!section) throw new Error("Launch section not found");
  if (!section.siteId) throw new Error("Launch staffing requires a school site");
  if (section.siteId !== section.programSiteId || section.yearSiteId !== section.siteId ||
    section.yearOrganizationId !== section.organizationId ||
    (section.yearProgramId && section.yearProgramId !== section.programId)) {
    throw new Error("Section, program and school-year scope must match for launch staffing");
  }
  return { ...section, siteId: section.siteId, window: instructionalWindow(section) };
}

export async function evaluateLaunchTeacher(
  sectionId: string,
  personId: string,
  executor: Reader = db,
  requestedWindow?: CoverageWindow,
) {
  const section = await launchStaffingContext(sectionId, executor);
  const window = requestedWindow ?? section.window;
  if (!Number.isFinite(window.from.getTime()) || !Number.isFinite(window.through.getTime()) ||
    window.from >= window.through || window.from < section.window.from || window.through > section.window.through) {
    throw new Error("Teacher qualification window must fit within the section instructional window");
  }
  const [role] = await executor.select({ id: roleAssignments.id }).from(roleAssignments)
    .innerJoin(people,eq(people.id,roleAssignments.personId)).where(and(
    eq(roleAssignments.personId, personId), eq(roleAssignments.roleKey, "teacher"),
    eq(people.active,true),
    inArray(roleAssignments.organizationId, [section.organizationId, section.providerId]),
    or(isNull(roleAssignments.siteId), eq(roleAssignments.siteId, section.siteId)),
    or(isNull(roleAssignments.programId), eq(roleAssignments.programId, section.programId)),
  )).orderBy(roleAssignments.id).limit(1);
  if (!role) return { eligible: false, reasons: ["Teacher role is not granted for this program and site."],
    policyRuleIds: [], claimIds: [], verificationEventIds: [], roleAssignmentId: null, window };

  const policies = await executor.select({
    id: compliancePolicyRules.id, code: compliancePolicyRules.code,
    expression: compliancePolicyRules.expression, evidencePolicy: compliancePolicyRules.evidencePolicy,
    versionFrom: complianceFrameworkVersions.effectiveFrom, versionThrough: complianceFrameworkVersions.effectiveThrough,
    appliesFrom: compliancePolicyApplicability.effectiveFrom, appliesThrough: compliancePolicyApplicability.effectiveThrough,
  }).from(compliancePolicyApplicability)
    .innerJoin(complianceFrameworkVersions, eq(complianceFrameworkVersions.id, compliancePolicyApplicability.frameworkVersionId))
    .leftJoin(compliancePolicyRules, eq(compliancePolicyRules.frameworkVersionId, complianceFrameworkVersions.id))
    .where(and(eq(complianceFrameworkVersions.status, "published"),
      or(isNull(compliancePolicyApplicability.organizationId), eq(compliancePolicyApplicability.organizationId, section.organizationId)),
      or(isNull(compliancePolicyApplicability.siteId), eq(compliancePolicyApplicability.siteId, section.siteId)),
      or(isNull(compliancePolicyApplicability.programId), eq(compliancePolicyApplicability.programId, section.programId)),
      or(isNull(compliancePolicyApplicability.jurisdictionId), eq(compliancePolicyApplicability.jurisdictionId, section.jurisdictionId)),
      or(isNull(compliancePolicyApplicability.roleKey), eq(compliancePolicyApplicability.roleKey, "teacher")),
    ));
  for (const policy of policies) {
    if ((policy.versionFrom && policy.versionThrough && policy.versionFrom >= policy.versionThrough) ||
      (policy.appliesFrom && policy.appliesThrough && policy.appliesFrom >= policy.appliesThrough)) {
      throw new Error(`Qualification policy ${policy.code ?? "empty-framework"} has an invalid effective window`);
    }
  }
  const bounded: CoveragePolicy[] = policies.map(policy => ({
    ...policy,
    id: policy.id ?? "missing-rule", code: policy.code ?? "empty-framework",
    expression: policy.expression ?? {}, evidencePolicy: policy.evidencePolicy ?? {},
    from: new Date(Math.max(window.from.getTime(), policy.versionFrom?.getTime() ?? -Infinity, policy.appliesFrom?.getTime() ?? -Infinity)),
    through: new Date(Math.min(window.through.getTime(), policy.versionThrough?.getTime() ?? Infinity, policy.appliesThrough?.getTime() ?? Infinity)),
  })).filter(policy => policy.from < policy.through);
  const claims = await executor.selectDistinctOn([qualificationClaims.id], {
    id: qualificationClaims.id, type: qualificationDefinitions.key, issuer: qualificationClaims.issuerName,
    jurisdiction: jurisdictions.code, issuedAt: qualificationClaims.issuedAt, expiresAt: qualificationClaims.expiresAt,
    decision: qualificationVerificationEvents.decision,
    verificationEventId: qualificationVerificationEvents.id,
  }).from(qualificationClaims)
    .innerJoin(qualificationDefinitions, eq(qualificationDefinitions.id, qualificationClaims.definitionId))
    .leftJoin(jurisdictions, eq(jurisdictions.id, qualificationClaims.jurisdictionId))
    .leftJoin(qualificationVerificationEvents, eq(qualificationVerificationEvents.claimId, qualificationClaims.id))
    .where(eq(qualificationClaims.personId, personId))
    .orderBy(qualificationClaims.id, desc(qualificationVerificationEvents.sequence));
  const evidence = claims.map(claim => ({
    type: claim.type, issuer: claim.issuer ?? undefined, jurisdiction: claim.jurisdiction ?? undefined,
    verified: credentialStatusFromDecision(claim.decision) === "verified",
    validFrom: claim.issuedAt, expiresAt: claim.expiresAt,
  }));
  return { ...evaluateQualificationCoverage(window, bounded, evidence),
    claimIds: claims.map(claim => claim.id),
    verificationEventIds: claims.map(claim => claim.verificationEventId).filter((id): id is string => id !== null),
    roleAssignmentId: role.id, window };
}

export async function evaluateLaunchStaffing(sectionId: string, executor: Reader = db) {
  const section = await launchStaffingContext(sectionId, executor);
  const arrangements = await executor.select({
    id: deliveryArrangements.id, instructorId: deliveryArrangements.instructorPersonId,
    from: deliveryArrangements.effectiveFrom, through: deliveryArrangements.effectiveThrough,
  }).from(deliveryArrangements).where(and(eq(deliveryArrangements.sectionId, sectionId), eq(deliveryArrangements.status, "active")));
  const teachers = await executor.select({ personId: sectionTeachers.personId }).from(sectionTeachers)
    .where(eq(sectionTeachers.sectionId, sectionId));
  const reasons: string[] = [];
  const instructors: {personId: string; policyRuleIds: string[]; verificationEventIds: string[]}[] = [];
  const assignedPeople = new Set(teachers.map(teacher => teacher.personId));
  const windowsByInstructor = new Map<string, CoverageWindow[]>();
  for (const arrangement of arrangements) {
    if (!arrangement.instructorId || !assignedPeople.has(arrangement.instructorId)) continue;
    const from = arrangement.from ?? section.window.from;
    const through = arrangement.through ?? section.window.through;
    if (from >= through) {
      reasons.push("An instructor delivery arrangement has an invalid effective window.");
      continue;
    }
    const bounded = {
      from: new Date(Math.max(from.getTime(), section.window.from.getTime())),
      through: new Date(Math.min(through.getTime(), section.window.through.getTime())),
    };
    if (bounded.from >= bounded.through) continue;
    windowsByInstructor.set(arrangement.instructorId, [
      ...(windowsByInstructor.get(arrangement.instructorId) ?? []), bounded,
    ]);
  }
  const coverageWindows = [...windowsByInstructor.values()].flat();
  if (!coverageWindows.length) {
    reasons.push("No assigned instructor delivery arrangement covers the full instructional window.");
  } else if (coverageGaps(section.window, coverageWindows).length) {
    reasons.push("Active instructor delivery arrangements do not cover the full instructional window without gaps.");
  }
  for (const personId of new Set(teachers.map(teacher => teacher.personId))) {
    const teacherWindows = windowsByInstructor.get(personId) ?? [];
    if (!teacherWindows.length) {
      reasons.push("An assigned teacher has no active delivery arrangement.");
      continue;
    }
    const policyRuleIds = new Set<string>();
    const verificationEventIds = new Set<string>();
    for (const window of teacherWindows) {
      const result = await evaluateLaunchTeacher(sectionId, personId, executor, window);
      if (!result.eligible) reasons.push(...result.reasons);
      result.policyRuleIds.forEach(id => policyRuleIds.add(id));
      result.verificationEventIds.forEach(id => verificationEventIds.add(id));
    }
    instructors.push({personId,policyRuleIds:[...policyRuleIds],verificationEventIds:[...verificationEventIds]});
  }
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)],
    from: section.window.from.toISOString(), through: section.window.through.toISOString(), instructors };
}

function inclusiveDateWindow(fromDate: string, throughDate: string, section: Awaited<ReturnType<typeof launchStaffingContext>>) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(throughDate) || fromDate > throughDate) {
    throw new Error("Choose a valid instructor assignment date range");
  }
  const nextDate = new Date(`${throughDate}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const start = new Date(dateTimeInputInTimezone(`${fromDate}T00:00`, section.timezone));
  const end = new Date(dateTimeInputInTimezone(`${nextDate.toISOString().slice(0, 10)}T00:00`, section.timezone));
  const window = {
    from: new Date(Math.max(start.getTime(), section.window.from.getTime())),
    through: new Date(Math.min(end.getTime(), section.window.through.getTime())),
  };
  if (window.from >= window.through) throw new Error("Instructor assignment dates do not overlap the section instructional window");
  return window;
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
  input: { programId: string; sectionId: string; teacherPersonId: string; effectiveFromDate?: string; effectiveThroughDate?: string },
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
  if (Boolean(input.effectiveFromDate) !== Boolean(input.effectiveThroughDate)) {
    throw new Error("Both instructor assignment dates are required");
  }
  const assignmentWindow = input.effectiveFromDate && input.effectiveThroughDate
    ? inclusiveDateWindow(input.effectiveFromDate, input.effectiveThroughDate, section)
    : section.window;
  await lockLaunchTeacherClaims(tx, [input.teacherPersonId]);
  const eligibility = await evaluateLaunchTeacher(input.sectionId, input.teacherPersonId, tx, assignmentWindow);
  if (!eligibility.eligible) throw new Error("Instructor is not eligible: " + eligibility.reasons.join(" "));
  const [existing] = await tx.select({ id: deliveryArrangements.id }).from(deliveryArrangements).where(and(
    eq(deliveryArrangements.sectionId, section.id),
    eq(deliveryArrangements.instructorPersonId, input.teacherPersonId),
    eq(deliveryArrangements.status, "active"),
    or(isNull(deliveryArrangements.effectiveFrom), lte(deliveryArrangements.effectiveFrom, assignmentWindow.from)),
    or(isNull(deliveryArrangements.effectiveThrough), gte(deliveryArrangements.effectiveThrough, assignmentWindow.through)),
  )).limit(1);
  const [assignment] = await tx.insert(sectionTeachers).values({
    sectionId: section.id, personId: input.teacherPersonId, role: "teacher", assignmentSource: "launch",
  }).onConflictDoNothing().returning({ id: sectionTeachers.id });
  if (existing && !assignment) return { created: false };
  const delivery = section.deliveryModel;
  const modality = delivery.liveOnline ? (delivery.onsite ? "hybrid" : "live_online") :
    delivery.asynchronous && !delivery.onsite ? "asynchronous" : "onsite";
  const [arrangement] = existing ? [existing] : await tx.insert(deliveryArrangements).values({
    sectionId: section.id, academicProviderOrganizationId: section.providerId,
    instructorPersonId: input.teacherPersonId, modality, status: "active",
    effectiveFrom: assignmentWindow.from, effectiveThrough: assignmentWindow.through,
  }).returning({ id: deliveryArrangements.id });
  if (!arrangement) throw new Error("Failed to create launch delivery arrangement");
  const roleAssignmentId=eligibility.roleAssignmentId;
  if (!roleAssignmentId) throw new Error("Eligible launch teacher must have a scoped role assignment");
  const evaluations = await tx.insert(staffingEligibilityEvaluations).values(eligibility.policyRuleIds.map(policyRuleId => ({
    roleAssignmentId, policyRuleId, result: "eligible",
    explanation: { sectionId: section.id, from: assignmentWindow.from.toISOString(),
      through: assignmentWindow.through.toISOString(), claimIds: eligibility.claimIds, evaluator: "launch-v1" },
    evidenceIds: eligibility.verificationEventIds,
  }))).returning({id:staffingEligibilityEvaluations.id});
  if (assignment) await notify(tx, {
    recipientPersonId: input.teacherPersonId, type: "teaching_assignment", status: "unread",
    title: "New teaching assignment", body: "You have been assigned to a launch class",
    resourceType: "section", resourceId: section.id,
  });
  await emitEvent(tx, {
    eventType: "DeliveryArrangementActivated", aggregateType: "delivery_arrangement",
    aggregateId: arrangement.id, actorPersonId: context.actorPersonId,
    organizationId: section.organizationId, siteId: section.siteId, programId: section.programId,
    sectionId: section.id, payload: { instructorPersonId: input.teacherPersonId,
      effectiveFrom: assignmentWindow.from.toISOString(), effectiveThrough: assignmentWindow.through.toISOString(),
      eligibilityEvaluationIds:evaluations.map(row=>row.id) },
  });
  await writeAudit(tx, context, {
    action: "launch.teacher.assign", entityType: "delivery_arrangement", entityId: arrangement.id,
    scope: { organizationId: section.organizationId, siteId: section.siteId, programId: section.programId, sectionId: section.id },
    after: { personId: input.teacherPersonId, modality,
      from: assignmentWindow.from.toISOString(), through: assignmentWindow.through.toISOString(),
      policyRuleIds: eligibility.policyRuleIds, claimIds: eligibility.claimIds,
      verificationEventIds:eligibility.verificationEventIds,eligibilityEvaluationIds:evaluations.map(row=>row.id) },
  });
  return { created: true };
}

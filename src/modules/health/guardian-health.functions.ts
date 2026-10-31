import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  enrollments, guardianRelationships, healthComplianceItems, healthOfficeVisits,
  healthProfiles, medicationAuthorizations, people, programs,
  returnToSchoolClearances, studentProfiles,
} from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { getCommandContext } from "@/modules/identity/command-context.server";

const input = z.object({ studentPersonId: z.string().uuid().optional() }).strict();

/** Family-facing read projection, not the staff medical chart or a second health record.
 * Independent guardian verification, live Program enrollment and school scope
 * must all agree before any medical summary is read.
 */
export const getGuardianHealthWorkspace = createServerFn({ method: "GET" })
  .validator((value: unknown) => input.parse(value ?? {}))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    assertCapability(actor, "student:related-read");
    if (actor.role !== "guardian" || !actor.actorPersonId ||
        !actor.scope.organizationIds?.length || !actor.scope.siteIds?.length ||
        !actor.scope.programIds?.length)
      throw new AuthorizationError("verified guardian health workspace");
    const enrolled = await db.select({
      studentProfileId: studentProfiles.id,
      studentPersonId: studentProfiles.personId,
      firstName: people.legalFirstName,
      lastName: people.legalLastName,
      siteId: programs.siteId,
      programId: programs.id,
    }).from(guardianRelationships)
      .innerJoin(studentProfiles, eq(studentProfiles.personId, guardianRelationships.studentPersonId))
      .innerJoin(people, eq(people.id, studentProfiles.personId))
      .innerJoin(enrollments, and(
        eq(enrollments.studentProfileId, studentProfiles.id),
        eq(enrollments.kind, "program"), eq(enrollments.status, "active"),
      ))
      .innerJoin(programs, and(
        eq(programs.id, enrollments.programId), eq(programs.status, "active"),
      ))
      .where(and(
        guardianRelationshipPredicate({
          guardianPersonId: actor.actorPersonId, access: "enrollment",
        }),
        inArray(programs.id, actor.scope.programIds),
        inArray(programs.siteId, actor.scope.siteIds),
        inArray(programs.organizationId, actor.scope.organizationIds),
        ...(data.studentPersonId ? [eq(studentProfiles.personId, data.studentPersonId)] : []),
      )).limit(100);
    const children = [...new Map(enrolled.map(row => [row.studentProfileId, row])).values()];
    if (!children.length) return { children: [] };
    const profileIds = children.map(child => child.studentProfileId);
    const sites = [...new Set(enrolled.map(child => child.siteId).filter((id): id is string => !!id))];
    const [profiles, compliance, medications, clearances, visits] = await Promise.all([
      db.select({
        studentProfileId: healthProfiles.studentProfileId,
        allergySummary: healthProfiles.allergySummary,
        emergencySummary: healthProfiles.emergencySummary,
        accommodationSummary: healthProfiles.accommodationSummary,
        metadata: healthProfiles.metadata,
      }).from(healthProfiles).where(inArray(healthProfiles.studentProfileId, profileIds)),
      db.select({
        studentProfileId: healthComplianceItems.studentProfileId,
        type: healthComplianceItems.type, status: healthComplianceItems.status,
        dueOn: healthComplianceItems.dueOn, expiresOn: healthComplianceItems.expiresOn,
      }).from(healthComplianceItems).where(inArray(healthComplianceItems.studentProfileId, profileIds)),
      db.select({
        studentProfileId: medicationAuthorizations.studentProfileId,
        medicationName: medicationAuthorizations.medicationName,
        status: medicationAuthorizations.status, emergencyOnly: medicationAuthorizations.emergencyOnly,
        startsOn: medicationAuthorizations.startsOn, expiresOn: medicationAuthorizations.expiresOn,
      }).from(medicationAuthorizations).where(inArray(medicationAuthorizations.studentProfileId, profileIds)),
      db.select({
        studentProfileId: returnToSchoolClearances.studentProfileId,
        status: returnToSchoolClearances.status,
        createdAt: returnToSchoolClearances.createdAt, clearedAt: returnToSchoolClearances.clearedAt,
      }).from(returnToSchoolClearances).where(inArray(returnToSchoolClearances.studentProfileId, profileIds))
        .orderBy(desc(returnToSchoolClearances.createdAt)),
      sites.length ? db.select({
        studentProfileId: healthOfficeVisits.studentProfileId,
        reason: healthOfficeVisits.reason, sentHome: healthOfficeVisits.sentHome,
        checkedInAt: healthOfficeVisits.checkedInAt,
      }).from(healthOfficeVisits).where(and(
        inArray(healthOfficeVisits.studentProfileId, profileIds),
        inArray(healthOfficeVisits.siteId, sites),
      )).orderBy(desc(healthOfficeVisits.checkedInAt)).limit(50) : Promise.resolve([]),
    ]);
    return { children: children.map(child => {
      const profile = profiles.find(row => row.studentProfileId === child.studentProfileId);
      const review = profile?.metadata.lastGuardianHealthReview as
        { status?: string; reviewedAt?: string } | undefined;
      // Never serialize restricted medical metadata (including another guardian's
      // pending proposal or the registrar's identity) to the family browser.
      const lastSchoolReview = review &&
        (review.status === "approved" || review.status === "rejected") &&
        typeof review.reviewedAt === "string"
        ? { status: review.status, reviewedAt: review.reviewedAt }
        : null;
      return {
      studentPersonId: child.studentPersonId,
      programId: child.programId,
      awaitingSchoolHealthReview: !!profile?.metadata.pendingGuardianUpdate,
      lastSchoolReview,
      approvedEmergencyContact: profile?.metadata.approvedEmergencyContact as
        { name: string; phone: string; relationship: string } | undefined,
      studentName: [child.firstName, child.lastName].filter(Boolean).join(" "),
      profile: profile ? {
        allergySummary: profile.allergySummary,
        emergencySummary: profile.emergencySummary,
        accommodationSummary: profile.accommodationSummary,
      } : null,
      compliance: compliance.filter(row => row.studentProfileId === child.studentProfileId),
      medications: medications.filter(row => row.studentProfileId === child.studentProfileId),
      clearances: clearances.filter(row => row.studentProfileId === child.studentProfileId)
        .map(row => ({ status: row.status, date: row.createdAt.toISOString(),
          clearedAt: row.clearedAt?.toISOString() ?? null })),
      visits: visits.filter(row => row.studentProfileId === child.studentProfileId)
        .map(row => ({ reason: row.reason, sentHome: row.sentHome, date: row.checkedInAt.toISOString() })),
    }; }) };
  });

import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { roleCapabilities } from "@/domain/access-context";
import type { Actor } from "@/modules/identity/actors.server";
import { authorizeClass } from "@/modules/learning/class-access.server";
import { evaluateLaunchTeacher } from "@/modules/staffing/launch-staffing.server";
import { verifiedTeacherSectionIds } from "@/modules/enrollment/verified-section-teachers.server";

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Missing teaching eligibility fixture");
  return row;
}

describe("canonical teaching eligibility consumers", () => {
  it("revokes launch, placement and classroom access from the same canonical facts", async () => {
    const rollback = new Error("rollback-teaching-eligibility-consistency");
    let checked = false;
    try {
      await db.transaction(async tx => {
        const suffix = crypto.randomUUID();
        const org = first(await tx.insert(s.organizations).values({
          type: "christian_school", name: "Teaching Eligibility School", slug: suffix,
        }).returning());
        const site = first(await tx.insert(s.sites).values({
          organizationId: org.id, name: "Teaching Eligibility Site", slug: suffix,
        }).returning());
        const jurisdiction = first(await tx.insert(s.jurisdictions).values({
          code: suffix, name: "Teaching eligibility test jurisdiction",
        }).returning());
        const program = first(await tx.insert(s.programs).values({
          organizationId: org.id, siteId: site.id, jurisdictionId: jurisdiction.id,
          type: "full_school", status: "active", name: "Teaching Eligibility Program",
          slug: suffix, gradeRange: { min: "9", max: "12" },
          academicProviderOrganizationId: org.id, creditIssuingOrganizationId: org.id,
        }).returning());
        const gradeScale = first(await tx.insert(s.gradeScales).values({
          owningOrganizationId: org.id, name: "Eligibility grades", version: 1,
          configuration: { entries: [
            { label: "A", minPercent: 90, maxPercent: 100, gpaPoints: 4, passing: true },
            { label: "F", minPercent: 0, maxPercent: 89.99, gpaPoints: 0, passing: false },
          ] },
          effectiveFrom: "2027-08-16",
        }).returning());
        const schoolYear = first(await tx.insert(s.schoolYears).values({
          organizationId: org.id, programId: program.id, siteId: site.id,
          key: `2027-2028-${suffix}`, name: "2027–2028", status: "active",
          startsOn: "2027-08-16", endsOn: "2028-06-02",
          gradeScaleId: gradeScale.id, timezone: "America/Los_Angeles",
        }).returning());
        const term = first(await tx.insert(s.terms).values({
          schoolYearId: schoolYear.id, key: `fall-${suffix}`, name: "Fall",
          sequence: 1, startsOn: "2027-08-16", endsOn: "2027-12-19",
        }).returning());
        const course = first(await tx.insert(s.courseTemplates).values({
          owningOrganizationId: org.id, code: `SCI-${suffix}`,
          title: "Eligibility Science", subject: "Science",
        }).returning());
        const version = first(await tx.insert(s.courseTemplateVersions).values({
          courseTemplateId: course.id, version: 1, status: "published",
        }).returning());
        const section = first(await tx.insert(s.sections).values({
          programId: program.id, siteId: site.id, termId: term.id,
          courseTemplateVersionId: version.id, code: `SCI-1-${suffix}`,
          title: "Eligibility Science",
        }).returning());
        const teacher = first(await tx.insert(s.people).values({
          legalFirstName: "Canonical", legalLastName: "Teacher",
        }).returning());
        const account = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `teacher-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
        }).returning());
        const grant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: account.id, personId: teacher.id, role: "teacher",
          organizationId: org.id, siteId: site.id,
        }).returning());
        const role = first(await tx.insert(s.roleAssignments).values({
          personId: teacher.id, organizationId: org.id, siteId: site.id,
          programId: program.id, roleKey: "teacher",
        }).returning());
        await tx.insert(s.sectionTeachers).values({
          sectionId: section.id, personId: teacher.id, role: "teacher",
        });
        const qualification = first(await tx.insert(s.qualificationDefinitions).values({
          key: `teacher-license-${suffix}`, kind: "license",
          title: "Canonical teaching license",
        }).returning());
        const framework = first(await tx.insert(s.complianceFrameworks).values({
          key: `launch-teacher:${program.id}`, name: "Teacher qualifications",
          authority: "Program registrar",
        }).returning());
        const policyVersion = first(await tx.insert(s.complianceFrameworkVersions).values({
          frameworkId: framework.id, version: "1", status: "published",
        }).returning());
        await tx.insert(s.compliancePolicyRules).values({
          frameworkVersionId: policyVersion.id, code: "teacher-qualifications",
          expression: { op: "credential", type: qualification.key },
        });
        await tx.insert(s.compliancePolicyApplicability).values({
          frameworkVersionId: policyVersion.id, organizationId: org.id,
          siteId: site.id, programId: program.id, roleKey: "teacher",
        });
        const claim = first(await tx.insert(s.qualificationClaims).values({
          personId: teacher.id, definitionId: qualification.id,
          issuedAt: new Date("2026-01-01"), expiresAt: new Date("2029-01-01"),
        }).returning());
        await tx.insert(s.qualificationVerificationEvents).values({
          claimId: claim.id, sequence: 1, decision: "approve", actorPersonId: teacher.id,
        });
        const actor: Actor = {
          role: "teacher", actorPersonId: teacher.id,
          accountId: account.id, grantId: grant.id, sessionId: crypto.randomUUID(),
          capabilities: new Set(roleCapabilities.teacher),
          scope: {
            organizationIds: [org.id], siteIds: [site.id], programIds: [program.id],
          },
        };
        const expectEligible = async () => {
          expect((await evaluateLaunchTeacher(section.id, teacher.id, tx)).eligible).toBe(true);
          expect(await verifiedTeacherSectionIds([section.id], tx)).toEqual(new Set([section.id]));
          expect((await authorizeClass(actor, section.id, undefined, tx)).section.id).toBe(section.id);
        };
        const expectRevoked = async (message: string) => {
          expect((await evaluateLaunchTeacher(section.id, teacher.id, tx)).eligible).toBe(false);
          expect(await verifiedTeacherSectionIds([section.id], tx)).toEqual(new Set());
          await expect(authorizeClass(actor, section.id, undefined, tx)).rejects.toThrow(message);
        };

        await expectEligible();

        await tx.update(s.accountPersonGrants).set({ active: false })
          .where(eq(s.accountPersonGrants.id, grant.id));
        await expectRevoked("academic provider teacher access");
        await tx.update(s.accountPersonGrants).set({ active: true })
          .where(eq(s.accountPersonGrants.id, grant.id));
        await expectEligible();

        await tx.delete(s.roleAssignments).where(eq(s.roleAssignments.id, role.id));
        await expectRevoked("Teacher role");
        await tx.insert(s.roleAssignments).values(role);
        await expectEligible();

        const revocation = first(await tx.insert(s.qualificationVerificationEvents).values({
          claimId: claim.id, sequence: 2, decision: "revoke", actorPersonId: teacher.id,
          reason: "Synthetic credential revocation consistency check",
        }).returning());
        await expectRevoked("teacher-qualifications");
        await tx.delete(s.qualificationVerificationEvents)
          .where(eq(s.qualificationVerificationEvents.id, revocation.id));
        await expectEligible();

        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(checked).toBe(true);
  });
});

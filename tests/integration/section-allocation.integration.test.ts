import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { activateSectionEnrollment } from "@/modules/enrollment/section-allocation.service";
import { replaceSectionRegistrationPolicy } from "@/modules/learning/section-registration-policy-service";
import { createAcademicTimeFixture } from "./helpers/academic-time";
import { evaluateLaunchTeacher, evaluateLaunchStaffing } from "@/modules/staffing/launch-staffing.server";
import { verifiedTeacherSectionIds } from "@/modules/enrollment/verified-section-teachers.server";

describe("section allocation prerequisites", () => {
  it("rejects an explicitly failing D and accepts a custom passing label from the linked scale", async () => {
    const suffix = crypto.randomUUID();
    const [org] = await db.insert(s.organizations).values({
      type: "christian_school", name: "Prerequisite School", slug: suffix,
    }).returning();
    const [jurisdiction] = await db.insert(s.jurisdictions).values({ code: suffix, name: "Prerequisites" }).returning();
    const [site] = await db.insert(s.sites).values({
      organizationId: org!.id, name: "Prerequisite Site", slug: suffix,
    }).returning();
    const [program] = await db.insert(s.programs).values({
      organizationId: org!.id, siteId: site!.id, jurisdictionId: jurisdiction!.id,
      type: "full_school", status: "active", name: "Prerequisite Program", slug: suffix,
      gradeRange: { min: "9", max: "12" },
      academicProviderOrganizationId: org!.id, creditIssuingOrganizationId: org!.id,
    }).returning();
    const time = await createAcademicTimeFixture({
      organizationId: org!.id, siteId: site!.id, programId: program!.id, suffix,
    });
    await db.update(s.gradeScales).set({ configuration: { entries: [
      { label: "Credit", minPercent: 70, maxPercent: 100, gpaPoints: 4, passing: true },
      { label: "D", minPercent: 0, maxPercent: 69.99, gpaPoints: 0, passing: false },
    ] } }).where(eq(s.gradeScales.id, time.gradeScale.id));
    const [person] = await db.insert(s.people).values({
      legalFirstName: "Student", legalLastName: suffix,
    }).returning();
    const [profile] = await db.insert(s.studentProfiles).values({ personId: person!.id, gradeLevel: "9" }).returning();
    await db.insert(s.enrollments).values({
      studentProfileId: profile!.id, organizationId: org!.id, programId: program!.id,
      schoolYearId: time.schoolYear.id, kind: "program", status: "active",
    });
    const courses = await db.insert(s.courseTemplates).values(["Intro", "Advanced"].map(title => ({
      owningOrganizationId: org!.id, code: `${title}-${suffix}`, title, subject: "Science",
    }))).returning();
    const versions = await db.insert(s.courseTemplateVersions).values(courses.map(course => ({
      courseTemplateId: course.id, version: 1, status:"published" as const,
      curriculum:{learning:{version:1,modules:[{id:"intro",title:"Introduction",lessons:[{id:"first",title:"Welcome to science",body:"Read the introduction and compare examples.",resources:[]}]}]}},
    }))).returning();
    const sections = await db.insert(s.sections).values(versions.map((version, index) => ({
      programId: program!.id, siteId: site!.id, termId: time.term.id,
      courseTemplateVersionId: version.id, code: `${index}-${suffix}`, title: courses[index]!.title,
    }))).returning();
    const introductory = sections[0]!;
    const advanced = sections[1]!;
    // Classroom placement needs a real active teaching assignment and an
    // independently verified school role, not just a Section shell.
    const [instructor]=await db.insert(s.people).values({
      legalFirstName:"Verified",legalLastName:"Instructor",
    }).returning();
    const [account]=await db.insert(s.accessAccounts).values({
      emailNormalized:`teacher-${suffix}@example.invalid`,
      emailVerifiedAt:new Date(),
    }).returning();
    await db.insert(s.accountPersonGrants).values({
      accountId:account!.id,personId:instructor!.id,role:"teacher",
      organizationId:org!.id,siteId:site!.id,
    });
    await db.insert(s.sectionTeachers).values({
      sectionId:advanced.id,personId:instructor!.id,
    });
    await db.insert(s.roleAssignments).values({
      personId:instructor!.id,organizationId:org!.id,siteId:site!.id,
      programId:program!.id,roleKey:"teacher",
    });
    const [delivery]=await db.insert(s.deliveryArrangements).values({
      sectionId:advanced.id,academicProviderOrganizationId:org!.id,
      instructorPersonId:instructor!.id,modality:"onsite",status:"active",
    }).returning();
    const {createTeachingQualificationFixture}=await import("./helpers/teaching-qualification");
    await createTeachingQualificationFixture(db,{
      sectionId:advanced.id,personId:instructor!.id,verifierPersonId:person!.id,
    });
    await replaceSectionRegistrationPolicy(db, {
      sectionId: advanced.id, enrollmentCapacity: 10, prerequisites: [courses[0]!.code],
      addDropEndsOn: time.term.endsOn, withdrawalEndsOn: time.term.endsOn,
      credits: 1, maxCreditsPerTerm: 7,
    });
    const [grade] = await db.insert(s.sectionGrades).values({
      sectionId: introductory.id, studentProfileId: profile!.id,
      gradingPeriodId: time.gradingPeriod.id, termId: time.term.id,
      status: "finalized", letterGrade: "D", gradeScaleId: time.gradeScale.id,
    }).returning();
    const input = {
      studentProfileId: profile!.id, sectionId: advanced.id, source: "prerequisite-test",
      actor: {
        actorPersonId: person!.id, capabilities: new Set<string>(),
        scope: { organizationIds: [org!.id], siteIds: [site!.id], programIds: [program!.id] },
      },
    };
    // Cross-consumer regression: launch and placement must revoke the same
    // teacher when verified account authority changes, without cached readiness.
    expect((await evaluateLaunchTeacher(advanced.id, instructor!.id)).eligible).toBe(true);
    expect((await evaluateLaunchStaffing(advanced.id)).ready).toBe(true);
    expect(await verifiedTeacherSectionIds([advanced.id])).toEqual(new Set([advanced.id]));
        // A Section teacher link cannot turn disabled, unverified or synthetic
    // accounts into a "staffed" class for a newly admitted student.
    await db.update(s.accessAccounts).set({disabled:true}).where(eq(s.accessAccounts.id,account!.id));
    expect((await evaluateLaunchTeacher(advanced.id, instructor!.id)).eligible).toBe(false);
    expect((await evaluateLaunchStaffing(advanced.id)).ready).toBe(false);
    expect(await verifiedTeacherSectionIds([advanced.id])).toEqual(new Set());
    await expect(db.transaction(tx => activateSectionEnrollment(tx, input)))
      .rejects.toThrow("Assign an active teacher");
    await db.update(s.accessAccounts).set({disabled:false,emailVerifiedAt:null})
      .where(eq(s.accessAccounts.id,account!.id));
    await expect(db.transaction(tx => activateSectionEnrollment(tx, input)))
      .rejects.toThrow("Assign an active teacher");
    await db.update(s.accessAccounts).set({emailVerifiedAt:new Date()})
      .where(eq(s.accessAccounts.id,account!.id));
    await db.update(s.accountPersonGrants).set({isSynthetic:true})
      .where(eq(s.accountPersonGrants.accountId,account!.id));
    await expect(db.transaction(tx => activateSectionEnrollment(tx, input)))
      .rejects.toThrow("Assign an active teacher");
    await db.update(s.accountPersonGrants).set({isSynthetic:false})
      .where(eq(s.accountPersonGrants.accountId,account!.id));
    // Qualification and assignment alone are insufficient when instructional
    // delivery has been withdrawn. Restore the same arrangement afterward.
    await db.update(s.deliveryArrangements).set({status:"completed"})
      .where(eq(s.deliveryArrangements.id,delivery!.id));
    await expect(db.transaction(tx => activateSectionEnrollment(tx, input)))
      .rejects.toThrow("delivery coverage");
    await db.update(s.deliveryArrangements).set({status:"active"})
      .where(eq(s.deliveryArrangements.id,delivery!.id));
    await expect(db.transaction(tx => activateSectionEnrollment(tx, input)))
      .rejects.toThrow("Unmet prerequisites");
    expect(await db.select().from(s.enrollments).where(and(
      eq(s.enrollments.sectionId, advanced.id), eq(s.enrollments.studentProfileId, profile!.id),
    ))).toHaveLength(0);
    await db.update(s.sectionGrades).set({ letterGrade: "Credit" }).where(eq(s.sectionGrades.id, grade!.id));
    expect(await db.transaction(tx => activateSectionEnrollment(tx, input))).toMatchObject({ created: true });
    expect(await db.transaction(tx => activateSectionEnrollment(tx, input))).toMatchObject({ created: false });
  });
});

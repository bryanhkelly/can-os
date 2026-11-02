import { describe, expect, it } from "vitest";
import { planOneRosterReconciliation } from "./oneroster-reconciliation";
import { previewOneRosterBundle } from "./oneroster-csv";

const users = [
  "sourcedId,enabledUser,givenName,familyName,role,status",
  "user-1,true,Student,One,student,active",
].join("\n");
const classes = [
  "sourcedId,title,courseSourcedId,classCode,schoolSourcedId,schoolYear,termSourcedIds",
  "class-1,Algebra I,course-1,ALG-1,school-1,2026,term-1",
].join("\n");
const enrollments = [
  "sourcedId,classSourcedId,schoolSourcedId,userSourcedId,role",
  "enrollment-1,class-1,school-1,user-1,student",
].join("\n");

describe("OneRoster reconciliation is identity-untrusted", () => {
  it("never treats an external student as an approved CAN identity", () => {
    const bundle = previewOneRosterBundle({ users, classes, enrollments });
    const plan = planOneRosterReconciliation(bundle.previews, new Map([["class-1", "section-1"]]));
    expect(plan.counts).toEqual({ users: 1, classes: 1, enrollments: 1, blocked: 2, review: 1, approved: 0, applied: 0 });
    const enrollment = plan.rows.find(r => r.kind === "enrollment");
    expect(enrollment?.state).toBe("blocked");
    expect(enrollment?.reasons).toContain("EXTERNAL_IDENTITY_UNVERIFIED");
    expect(enrollment?.reasons).toContain("CANONICAL_ENROLLMENT_APPROVAL_REQUIRED");
    expect(plan.policy).toBe("dry_run_only_no_identity_or_enrollment_mutation");
  });

  it("blocks missing class mappings and cross-school roster references", () => {
    const changed = enrollments.replace("school-1,user-1", "school-2,user-1");
    const bundle = previewOneRosterBundle({ users, classes, enrollments: changed });
    const plan = planOneRosterReconciliation(bundle.previews, new Map());
    const enrollment = plan.rows.find(r => r.kind === "enrollment");
    expect(enrollment?.reasons).toContain("EXTERNAL_CLASS_UNMAPPED");
    expect(enrollment?.reasons).toContain("EXTERNAL_SCHOOL_MISMATCH");
  });

  it("flags withdrawn external users and enrollment rows", () => {
    const withdrawnUsers = users.replace("student,active", "student,tobedeleted");
    const bundle = previewOneRosterBundle({ users: withdrawnUsers, classes, enrollments });
    const plan = planOneRosterReconciliation(bundle.previews, new Map([["class-1", "section-1"]]));
    expect(plan.rows.find(r => r.kind === "user")?.reasons).toContain("EXTERNAL_ROW_WITHDRAWN");
    expect(plan.rows.find(r => r.kind === "enrollment")?.reasons).toContain("EXTERNAL_ROW_WITHDRAWN");
  });

  it("blocks class rows without verified year or academic session", () => {
    const withoutYear = classes.replace("school-1,2026,term-1", "school-1,,");
    const bundle = previewOneRosterBundle({ classes: withoutYear });
    const plan = planOneRosterReconciliation(bundle.previews, new Map([["class-1", "section-1"]]));
    const cls = plan.rows.find(r => r.kind === "class");
    expect(cls?.reasons).toContain("SCHOOL_YEAR_UNVERIFIED");
    expect(cls?.reasons).toContain("ACADEMIC_SESSION_UNVERIFIED");
  });

  it("rejects cross-school user substitution even when external user ID exists", () => {
    const schoolUsers = users.replace("sourcedId,enabledUser", "sourcedId,orgSourcedIds,enabledUser")
      .replace("user-1,true", "user-1,school-2,true");
    const bundle = previewOneRosterBundle({ users: schoolUsers, classes, enrollments });
    const plan = planOneRosterReconciliation(bundle.previews, new Map([["class-1", "section-1"]]));
    expect(plan.rows.find(r => r.kind === "enrollment")?.reasons)
      .toContain("EXTERNAL_USER_SCHOOL_MISMATCH");
  });

  it("flags repeated enrollment relations rather than silently applying duplicates", () => {
    const duplicate = enrollments + "\nenrollment-2,class-1,school-1,user-1,student";
    const bundle = previewOneRosterBundle({ users, classes, enrollments: duplicate });
    const plan = planOneRosterReconciliation(bundle.previews, new Map([["class-1", "section-1"]]));
    expect(plan.rows.find(r => r.sourcedId === "enrollment-2")?.reasons)
      .toContain("DUPLICATE_ENROLLMENT_RELATION");
  });

  it("flags missing external academic sessions", () => {
    const sessions = "sourcedId,title,type,startDate,endDate\nterm-2,Fall,term,2026-08-01,2026-12-20";
    const bundle = previewOneRosterBundle({ classes, academicSessions: sessions });
    const plan = planOneRosterReconciliation(bundle.previews, new Map([["class-1", "section-1"]]));
    expect(plan.rows.find(r => r.kind === "class")?.reasons)
      .toContain("EXTERNAL_SESSION_MISSING");
  });
  it("never treats teacher or administrator rows as student enrollments", () => {
    const teacherEnrollment = enrollments.replace(",student", ",teacher");
    const bundle = previewOneRosterBundle({ users, classes, enrollments: teacherEnrollment });
    const plan = planOneRosterReconciliation(bundle.previews, new Map([["class-1", "section-1"]]));
    expect(plan.rows.find(row => row.kind === "enrollment")?.reasons)
      .toContain("EXTERNAL_ENROLLMENT_ROLE_NOT_STUDENT");
  });

  it("flags inactive external identities and linked enrollments", () => {
    const suspended = users.replace("student,active", "student,inactive");
    const bundle = previewOneRosterBundle({ users: suspended, classes, enrollments });
    const plan = planOneRosterReconciliation(bundle.previews, new Map([["class-1", "section-1"]]));
    expect(plan.rows.find(r => r.kind === "user")?.reasons).toContain("EXTERNAL_ROW_INACTIVE");
    expect(plan.rows.find(r => r.kind === "enrollment")?.reasons).toContain("EXTERNAL_ROW_INACTIVE");
  });

  it("rejects reused sourcedIds across different OneRoster entity kinds", () => {
    const colliding = enrollments.replace("enrollment-1,class-1", "user-1,class-1");
    const bundle = previewOneRosterBundle({ users, classes, enrollments: colliding });
    const plan = planOneRosterReconciliation(bundle.previews, new Map([["class-1", "section-1"]]));
    expect(plan.rows.find(r => r.kind === "enrollment")?.reasons).toContain("EXTERNAL_SOURCED_ID_COLLISION");
  });

});

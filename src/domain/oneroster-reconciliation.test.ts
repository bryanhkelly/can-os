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
    expect(plan.counts).toEqual({ users: 1, classes: 1, enrollments: 1, blocked: 2 });
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
});

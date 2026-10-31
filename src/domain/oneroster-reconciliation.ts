import type { OneRosterPreview, OneRosterRow } from "./oneroster-csv";

/**
 * Conservative, identity-untrusted OneRoster reconciliation plan.
 * External user identifiers are references, not CAN Person/Student identities.
 * This module never provisions accounts, creates enrollments or modifies Sections.
 */
export type ReconciliationReason =
  | "EXTERNAL_IDENTITY_UNVERIFIED"
  | "CANONICAL_ENROLLMENT_APPROVAL_REQUIRED"
  | "EXTERNAL_CLASS_UNMAPPED"
  | "EXTERNAL_USER_MISSING"
  | "EXTERNAL_CLASS_MISSING"
  | "EXTERNAL_SCHOOL_MISMATCH"
  | "EXTERNAL_USER_NOT_STUDENT"
  | "EXTERNAL_ROW_WITHDRAWN"
  | "SCHOOL_YEAR_UNVERIFIED"
  | "ACADEMIC_SESSION_UNVERIFIED"
  | "EXTERNAL_REFERENCE_MISSING"
  | "EXTERNAL_USER_SCHOOL_MISMATCH"
  | "EXTERNAL_ENROLLMENT_ROLE_MISMATCH"
  | "EXTERNAL_SESSION_MISSING"
  | "EXTERNAL_SCHOOL_NOT_FOUND"
  | "DUPLICATE_ENROLLMENT_RELATION";

export type ReconciliationRow = {
  kind: "user" | "class" | "enrollment";
  sourcedId: string;
  externalClassSourcedId?: string;
  externalUserSourcedId?: string;
  proposedSectionId?: string;
  state: "review" | "blocked";
  reasons: ReconciliationReason[];
};

export type ReconciliationPlan = {
  policy: "dry_run_only_no_identity_or_enrollment_mutation";
  rows: ReconciliationRow[];
  counts: { users: number; classes: number; enrollments: number; blocked: number };
};

/** All class mappings must be selected explicitly by an authorized registrar. */
export function planOneRosterReconciliation(
  previews: readonly OneRosterPreview[],
  classMappings: ReadonlyMap<string, string>,
): ReconciliationPlan {
  const get = (kind: string): OneRosterRow[] => previews.find(p => p.kind === kind)?.rows ?? [];
  const users = get("users"), classes = get("classes"), enrollments = get("enrollments");
  const orgs = new Set(get("orgs").map(r => r.sourcedId));
  const userById = new Map(users.map(r => [r.sourcedId, r]));
  const classById = new Map(classes.map(r => [r.sourcedId, r]));
  const sessions = new Set(get("academicSessions").map(r => r.sourcedId));
  const seenEnrollmentRelations = new Set<string>();
  const rows: ReconciliationRow[] = [];
  const withdrawn = (r: OneRosterRow) =>
    r.status?.toLowerCase() === "tobedeleted" || r.enabledUser?.toLowerCase() === "false";

  for (const user of users) {
    rows.push({
      kind: "user", sourcedId: user.sourcedId!,
      state: "blocked",
      reasons: withdrawn(user)
        ? ["EXTERNAL_ROW_WITHDRAWN", "EXTERNAL_IDENTITY_UNVERIFIED"]
        : ["EXTERNAL_IDENTITY_UNVERIFIED"],
    });
  }

  for (const cls of classes) {
    const sectionId = classMappings.get(cls.sourcedId!);
    const reasons: ReconciliationReason[] = [];
    if (!sectionId) reasons.push("EXTERNAL_CLASS_UNMAPPED");
    if (withdrawn(cls)) reasons.push("EXTERNAL_ROW_WITHDRAWN");
    if (orgs.size && !orgs.has(cls.schoolSourcedId!)) reasons.push("EXTERNAL_SCHOOL_NOT_FOUND");
    if (sessions.size && cls.termSourcedIds?.split(",").some(id => !sessions.has(id.trim())))
      reasons.push("EXTERNAL_SESSION_MISSING");
    if (!cls.schoolYear) reasons.push("SCHOOL_YEAR_UNVERIFIED");
    if (!cls.termSourcedIds) reasons.push("ACADEMIC_SESSION_UNVERIFIED");
    rows.push({
      kind: "class", sourcedId: cls.sourcedId!,
      proposedSectionId: sectionId,
      state: reasons.length ? "blocked" : "review",
      reasons,
    });
  }

  for (const enrollment of enrollments) {
    const cls = classById.get(enrollment.classSourcedId!);
    const user = userById.get(enrollment.userSourcedId!);
    const reasons: ReconciliationReason[] = [];
    if (!cls) reasons.push("EXTERNAL_CLASS_MISSING");
    if (!user) reasons.push("EXTERNAL_USER_MISSING");
    if (!classMappings.has(enrollment.classSourcedId!)) reasons.push("EXTERNAL_CLASS_UNMAPPED");
    if (cls && cls.schoolSourcedId !== enrollment.schoolSourcedId)
      reasons.push("EXTERNAL_SCHOOL_MISMATCH");
    if (user && user.role?.toLowerCase() !== "student" && enrollment.role?.toLowerCase() === "student")
      reasons.push("EXTERNAL_USER_NOT_STUDENT");
    if (user && enrollment.role && user.role?.toLowerCase() !== enrollment.role.toLowerCase())
      reasons.push("EXTERNAL_ENROLLMENT_ROLE_MISMATCH");
    if (user?.orgSourcedIds && !user.orgSourcedIds.split(",").map(id => id.trim()).includes(enrollment.schoolSourcedId!))
      reasons.push("EXTERNAL_USER_SCHOOL_MISMATCH");
    if (orgs.size && !orgs.has(enrollment.schoolSourcedId!))
      reasons.push("EXTERNAL_SCHOOL_NOT_FOUND");
    const relationKey = JSON.stringify([enrollment.classSourcedId, enrollment.userSourcedId, enrollment.role]);
    if (seenEnrollmentRelations.has(relationKey)) reasons.push("DUPLICATE_ENROLLMENT_RELATION");
    seenEnrollmentRelations.add(relationKey);
    if (withdrawn(enrollment) || (user && withdrawn(user)) || (cls && withdrawn(cls)))
      reasons.push("EXTERNAL_ROW_WITHDRAWN");
    if (!cls?.schoolYear) reasons.push("SCHOOL_YEAR_UNVERIFIED");
    if (!cls?.termSourcedIds) reasons.push("ACADEMIC_SESSION_UNVERIFIED");
    reasons.push("EXTERNAL_IDENTITY_UNVERIFIED", "CANONICAL_ENROLLMENT_APPROVAL_REQUIRED");
    rows.push({
      kind: "enrollment", sourcedId: enrollment.sourcedId!,
      externalClassSourcedId: enrollment.classSourcedId,
      externalUserSourcedId: enrollment.userSourcedId,
      proposedSectionId: classMappings.get(enrollment.classSourcedId!),
      state: "blocked",
      reasons,
    });
  }

  return {
    policy: "dry_run_only_no_identity_or_enrollment_mutation",
    rows,
    counts: {
      users: users.length, classes: classes.length, enrollments: enrollments.length,
      blocked: rows.filter(r => r.state === "blocked").length,
    },
  };
}

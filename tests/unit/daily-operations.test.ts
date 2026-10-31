import { describe, expect, it } from "vitest";
import {
  buildDailyOperationsAttention,
  buildGuardianAttention,
  buildTeacherAttention,
  type DailyOperationsAction,
  type DailyProgramProjection,
} from "@/domain/daily-operations";
import {
  activeProgramOperationsHref,
  postLaunchOperationsDestination,
} from "@/domain/launch-operations-handoff";

function action(id: string, overrides: Partial<DailyOperationsAction> = {}): DailyOperationsAction {
  return {
    id,
    type: "office_follow_up",
    title: `Action ${id}`,
    description: "Review the operational follow-up.",
    siteId: "site-1",
    programId: "program-1",
    ownerPersonId: "operator-1",
    ownerName: "Alex Operator",
    status: "open",
    priority: "normal",
    dueAt: null,
    createdAt: "2026-10-28T09:00:00.000Z",
    ...overrides,
  };
}

const program: DailyProgramProjection = {
  id: "program-1",
  name: "Grace Academy",
  siteId: "site-1",
  counts: {
    incomingApplications: 2,
    outstandingEnrollmentRequirements: 3,
    activeProgramStudents: 4,
    placedStudents: 3,
    submittedWork: 5,
    unresolvedGuardianResponses: 1,
  },
};

describe("launch to daily operations", () => {
  it("sends a successful site-based activation directly to Site Today", () => {
    expect(postLaunchOperationsDestination({ programId: "program 1", siteId: "site/1" }))
      .toBe("/sites/site%2F1");
  });

  it("keeps site-less programs on their canonical launch record", () => {
    expect(postLaunchOperationsDestination({ programId: "program 1", siteId: null }))
      .toBe("/operations/launch?programId=program%201");
  });

  it("uses Site Today for an active site program without changing launch history elsewhere", () => {
    expect(activeProgramOperationsHref({ programId: "program-1", siteId: "site-1", status: "active" }))
      .toBe("/sites/site-1");
    expect(activeProgramOperationsHref({ programId: "program-1", siteId: "site-1", status: "launching" }))
      .toBe("/operations/launch/program-1");
    expect(activeProgramOperationsHref({ programId: "program-1", siteId: null, status: "active" }))
      .toBe("/operations/launch/program-1");
  });
});

describe("daily operations attention", () => {
  it("composes canonical opening, staffing, admissions, document, family and academic work", () => {
    const items = buildDailyOperationsAttention({
      role: "registrar",
      actorPersonId: "operator-1",
      actions: [
        action("opening", {
          type: "program_opening_handoff",
          title: "Grace Academy - opening handoff",
          priority: "high",
          dueAt: "2026-10-29T12:00:00.000Z",
        }),
        action("family", { type: "guardian_grade_follow_up", title: "Family grade question" }),
        action("academic", { type: "academic_intervention", title: "Academic follow-up" }),
      ],
      staffingIssues: [{
        kind: "unstaffed",
        sectionId: "section-1",
        programId: "program-1",
        title: "Algebra needs an instructor",
        description: "Assign a qualified teacher.",
      }],
      programs: [program],
    });

    expect(new Set(items.map(item => item.category))).toEqual(new Set([
      "opening", "staffing", "admissions", "documents", "family", "academic",
    ]));
    expect(items.map(item => item.id)).toEqual(expect.arrayContaining([
      "action:opening", "action:family", "action:academic", "staffing:unstaffed:section-1",
      "admissions:program-1", "documents:program-1", "placement:program-1", "academic:program-1",
    ]));
    const opening = items.find(item => item.id === "action:opening");
    expect(opening).toMatchObject({
      ownerName: "Alex Operator",
      dueAt: "2026-10-29T12:00:00.000Z",
      nextStep: "Review the named handoff",
      href: "/operations?siteId=site-1&programId=program-1&action=opening",
    });
    expect(items.find(item => item.id === "documents:program-1")?.nextStep)
      .toBe("Review enrollment requirements");
  });

  it("does not give site leaders broad aggregates or another person's assigned private Action", () => {
    const items = buildDailyOperationsAttention({
      role: "site_leader",
      actorPersonId: "leader-1",
      actions: [
        action("assigned", { ownerPersonId: "leader-1", ownerName: "Site Leader" }),
        action("private", {
          type: "academic_intervention",
          ownerPersonId: "teacher-1",
          title: "Private student intervention",
          description: "Restricted student detail",
        }),
        action("opening", {
          type: "program_opening_handoff",
          ownerPersonId: "operator-1",
        }),
      ],
      staffingIssues: [{
        kind: "unstaffed",
        sectionId: "section-1",
        programId: "program-1",
        title: "Broad staffing projection",
        description: "Registrar projection",
      }],
      programs: [program],
    });

    expect(items.map(item => item.id)).toEqual(["action:assigned", "action:opening"]);
    expect(items.some(item => item.title.includes("Private student"))).toBe(false);
    expect(items.some(item => ["admissions", "documents", "academic", "staffing"].includes(item.category))).toBe(false);
  });

  it("shows unassigned coverage escalations to local leaders without exposing unrelated unowned work", () => {
    const items = buildDailyOperationsAttention({role:"site_leader",actorPersonId:"leader-1",actions:[
      action("gap",{type:"onsite_coverage_gap",ownerPersonId:null,ownerName:null,priority:"critical"}),
      action("ordinary",{ownerPersonId:null}),
      action("case",{type:"safeguarding_concern",ownerPersonId:null}),
    ]});
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({id:"action:gap",category:"staffing",priority:"critical",
      ownerName:null,href:"/sites/site-1",
      nextStep:"Ask the host registrar to appoint an eligible director and assign this gap"});
  });

  it("keeps support and safeguarding details out of the broad attention projection", () => {
    const restricted = [
      "support_referral",
      "student_support_request",
      "safeguarding_concern",
      "safeguarding_response_required",
      "coach_outreach",
    ].map((type, index) => action(`restricted-${index}`, {
      type,
      title: "Restricted private title",
      description: "Restricted private observations",
    }));
    for (const role of ["registrar", "site_leader"] as const) {
      const items = buildDailyOperationsAttention({
        role,
        actorPersonId: "operator-1",
        actions: restricted,
        programs: [program],
      });
      expect(items.some(item => item.id.startsWith("action:restricted-"))).toBe(false);
      expect(items.some(item => item.title.includes("Restricted") || item.detail.includes("Restricted"))).toBe(false);
    }
  });
});

describe("role-scoped attention adapters", () => {
  it("retains teacher gradebook and notice destinations", () => {
    const items = buildTeacherAttention({
      ungraded: [{
        sectionId: "section 1",
        assessmentId: "assessment/1",
        studentProfileId: "student-1",
        studentName: "Jordan Sample",
        assessmentTitle: "Essay",
        sectionTitle: "English",
        submittedAt: "2026-10-28T10:00:00.000Z",
      }],
      missingWork: [{
        sectionId: "section-2",
        assessmentId: "assessment-2",
        studentProfileId: "student-2",
        studentName: "Riley Sample",
        assessmentTitle: "Problem set",
        sectionTitle: "Algebra",
        dueAt: "2026-10-29T10:00:00.000Z",
      }],
      notices: [{ id: "notice-1", title: "Staff briefing", body: null, createdAt: "2026-10-28T08:00:00.000Z" }],
    });
    expect(items[0]?.href).toBe("/teacher/gradebook?section=section%201&assessment=assessment%2F1&student=student-1");
    expect(items[1]).toMatchObject({
      href: "/teacher/gradebook?section=section-2&assessment=assessment-2&student=student-2",
      dueAt: "2026-10-29T10:00:00.000Z",
      priority: "high",
    });
    expect(items[2]?.href).toBe("/notifications?notification=notice-1");
  });

  it("preserves guardian destinations and the Action's owning workspace", () => {
    const items = buildGuardianAttention([{
      id: "consent-1",
      kind: "action",
      type: "study_group_consent",
      title: "Study group permission",
      detail: "Review the request.",
      href: "/guardian?action=consent-1",
      priority: "urgent",
      dueAt: "2026-10-29T10:00:00.000Z",
    }, {
      id: "absence-1",
      kind: "excuse",
      title: "Explain an absence",
      href: "/guardian/attendance?absence=absence-1",
    }]);
    expect(items[0]).toMatchObject({
      href: "/guardian/group-permissions?action=consent-1",
      nextStep: "Review permission",
      priority: "critical",
      dueAt: "2026-10-29T10:00:00.000Z",
    });
    expect(items[1]).toMatchObject({
      href: "/guardian/attendance?absence=absence-1",
      nextStep: "Submit excuse",
      ownerName: "You",
    });
  });
});

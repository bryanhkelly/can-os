import { describe, expect, it } from "vitest";
import { filterCalendarItems } from "@/domain/calendar-view";
import { prioritizeFamilyNeeds, familyActionWorkspaceLink } from "@/domain/family-needs";
import { launchReadiness } from "@/domain/launch-readiness";

describe("calendar view filters", () => {
  const items = [
    { id: "lesson", source: "section" as const, sectionId: "english" },
    { id: "essay", source: "assessment" as const, sectionId: "english" },
    { id: "math", source: "assessment" as const, sectionId: "math" },
    { id: "personal", source: "personal" as const, sectionId: null },
    { id: "school", source: "site" as const },
  ];
  it("leaves the unfiltered authorized feed intact", () => {
    expect(filterCalendarItems(items, {})).toEqual(items);
  });
  it("composes exact class and source filters without including school or personal events", () => {
    expect(filterCalendarItems(items, { section: "english" }).map(item => item.id)).toEqual(["lesson", "essay"]);
    expect(filterCalendarItems(items, { section: "english", source: "assessment" }).map(item => item.id)).toEqual(["essay"]);
    expect(filterCalendarItems(items, { section: "unknown" })).toEqual([]);
  });
});

describe("family needs priority", () => {
  const now = Date.parse("2030-05-01");
  it("ranks overdue work, urgent actions, excuses, other work, then notifications without mutating input", () => {
    const items = [
      { id: "notice", kind: "notification" },
      { id: "action", kind: "action" },
      { id: "excuse", kind: "excuse" },
      { id: "urgent", kind: "action", priority: "urgent" },
      { id: "overdue", kind: "action", dueAt: "2030-04-30" },
    ];
    expect(prioritizeFamilyNeeds(items, now).map(item => item.id)).toEqual(["overdue", "urgent", "excuse", "action", "notice"]);
    expect(items[0]?.id).toBe("notice");
  });
  it("orders equal-priority deadlines before undated work and keeps undated ties stable", () => {
    const items = [
      { id: "undated", kind: "action" }, { id: "later", kind: "action", dueAt: "2030-05-04" },
      { id: "earlier", kind: "action", dueAt: "2030-05-02" }, { id: "another", kind: "action" },
    ];
    expect(prioritizeFamilyNeeds(items, now).map(item => item.id)).toEqual(["earlier", "later", "undated", "another"]);
  });
});

describe("family action workspace links", () => {
  it("maps a known action type to its owning workspace with the action preserved", () => {
    expect(familyActionWorkspaceLink({ kind: "action", id: "consent-1", type: "study_group_consent" }))
      .toBe("/guardian/group-permissions?action=consent-1");
    expect(familyActionWorkspaceLink({ kind: "action", id: "request-1", type: "course_registration_request" }))
      .toBe("/guardian/course-approvals");
  });
  it("falls back to the generic action detail page for unknown action types", () => {
    expect(familyActionWorkspaceLink({ kind: "action", id: "other 1", type: "support_referral" }))
      .toBe("/actions/other%201");
  });
  it("renders no link for non-action needs or actions without an id", () => {
    expect(familyActionWorkspaceLink({ kind: "excuse", id: "absence-1", type: "attendance_excuse" })).toBeNull();
    expect(familyActionWorkspaceLink({ kind: "notification", id: "notice-1", type: "update" })).toBeNull();
    expect(familyActionWorkspaceLink({ kind: "action", type: "study_group_consent" })).toBeNull();
  });
});

describe("recorded launch readiness", () => {
  it("does not report 100% when requirements are not configured", () => {
    expect(launchReadiness([])).toEqual({ complete: 0, total: 0, blockers: [], percentage: null });
  });
  it("counts actual completions, distinguishes optional work and names every blocker", () => {
    const requirements = [
      { title: "Host agreement", status: "complete", blocking: true },
      { title: "Staffing", status: "in_progress", blocking: true },
      { title: "Orientation", status: "pending", blocking: false },
    ];
    expect(launchReadiness(requirements)).toEqual({
      complete: 1, total: 3, percentage: 33, blockers: [requirements[1]],
    });
    expect(launchReadiness(requirements.map(item => ({ ...item, status: "complete" })))).toMatchObject({ percentage: 100, blockers: [] });
  });
});

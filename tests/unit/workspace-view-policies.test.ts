import { describe, expect, it } from "vitest";
import { calendarEventDetailsDestination, calendarItemDestination, calendarRecordDestination, filterCalendarItems } from "@/domain/calendar-view";
import { prioritizeFamilyNeeds, familyActionWorkspaceLink } from "@/domain/family-needs";
import { launchReadiness } from "@/domain/launch-readiness";

describe("calendar view filters", () => {
  it("opens every activity in calendar details while preserving the current view", () => {
    expect(calendarEventDetailsDestination("study-session", "2026-11-02", { view: "week", q: "study" })).toEqual({
      to: "/calendar", search: { view: "week", q: "study", date: "2026-11-02", event: "study-session" },
    });
    expect(calendarEventDetailsDestination("assessment:essay", "2026-11-02", { section: "english" })).toEqual({
      to: "/calendar", search: { section: "english", date: "2026-11-02", event: "assessment:essay" },
    });
  });
  it("binds guardian assignment links to an authorized child without guessing between siblings", () => {
    const first = { studentPersonId: "jordan", studentName: "Jordan Student" };
    const second = { studentPersonId: "casey", studentName: "Casey Student" };
    const item = { id: "assessment:essay", source: "assessment" as const,
      sectionId: "english", guardianStudents: [first] };
    expect(calendarItemDestination(item, "guardian")).toEqual({
      to: "/guardian/students", search: { student: "jordan", section: "english", assessment: "essay" },
    });
    const siblings = { ...item, guardianStudents: [first, second] };
    expect(calendarItemDestination(siblings, "guardian")).toBeNull();
    expect(calendarItemDestination(siblings, "guardian", "casey")).toEqual({
      to: "/guardian/students", search: { student: "casey", section: "english", assessment: "essay" },
    });
    expect(calendarItemDestination(siblings, "guardian", "unrelated")).toBeNull();
    expect(calendarItemDestination({ ...item, guardianStudents: [] }, "guardian")).toBeNull();
  });
  it("opens deadlines in the exact role-specific assignment workspace", () => {
    const item = { id: "assessment:essay", source: "assessment" as const, sectionId: "english" };
    expect(calendarItemDestination(item, "student")).toEqual({
      to: "/student/assignments", search: { section: "english", assessment: "essay" },
    });
    expect(calendarItemDestination(item, "teacher")).toEqual({
      to: "/teacher/gradebook", search: { section: "english", assessment: "essay" },
    });
    expect(calendarItemDestination(item, "guardian")).toBeNull();
    expect(calendarItemDestination({ ...item, sectionId: null }, "teacher")).toBeNull();
    expect(calendarItemDestination({ ...item, id: "assessment:" }, "student")).toBeNull();
    expect(calendarItemDestination({ ...item, id: "essay" }, "student")).toBeNull();
    expect(calendarItemDestination({ ...item, source: "section" }, "student")).toBeNull();
  });
  it("links section events and class times to the class workspace for authorized classroom roles only", () => {
    const classTime = { type: "class_time", source: "section" as const, sectionId: "english" };
    expect(calendarRecordDestination(classTime, "student")).toEqual({
      to: "/classes", search: { section: "english" },
    });
    expect(calendarRecordDestination({ ...classTime, type: "class_session" }, "teacher")).toEqual({
      to: "/classes", search: { section: "english" },
    });
    expect(calendarRecordDestination({ ...classTime,
      guardianStudents: [{ studentPersonId: "jordan", studentName: "Jordan Student" }] }, "guardian")).toEqual({
      to: "/classes", search: { section: "english", student: "jordan" },
    });
    expect(calendarRecordDestination({ ...classTime, guardianStudents: [
      { studentPersonId: "jordan", studentName: "Jordan Student" },
      { studentPersonId: "casey", studentName: "Casey Student" },
    ] }, "guardian")).toBeNull();
    expect(calendarRecordDestination(classTime, "registrar")).toBeNull();
    expect(calendarRecordDestination(classTime, "room_facilitator")).toBeNull();
    expect(calendarRecordDestination({ ...classTime, sectionId: null }, "student")).toBeNull();
  });
  it("links field trip events to the viewer's field trip workspace", () => {
    const trip = { type: "field_trip", source: "site" as const,
      sourceType: "field_trip", sourceId: "museum-trip" };
    expect(calendarRecordDestination(trip, "registrar")).toEqual({
      to: "/operations/field-trips/$tripId", params: { tripId: "museum-trip" },
    });
    expect(calendarRecordDestination(trip, "guardian")).toEqual({ to: "/guardian/field-trips" });
    expect(calendarRecordDestination(trip, "student")).toEqual({
      to: "/student/field-trips", search: { trip: "museum-trip" },
    });
    expect(calendarRecordDestination(trip, "teacher")).toBeNull();
    expect(calendarRecordDestination({ ...trip, sourceId: null }, "registrar")).toBeNull();
    expect(calendarRecordDestination({ ...trip, sourceType: "site" }, "registrar")).toBeNull();
  });
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
  it("composes exact class, source, and text filters without including unrelated events", () => {
    expect(filterCalendarItems(items, { section: "english" }).map(item => item.id)).toEqual(["lesson", "essay"]);
    expect(filterCalendarItems(items, { section: "english", source: "assessment" }).map(item => item.id)).toEqual(["essay"]);
    expect(filterCalendarItems([
      { id: "study", source: "study_group" as const, title: "Evening study group", description: "Chemistry" },
      { id: "school", source: "site" as const, title: "School assembly", description: null },
    ], { q: "CHEM" }).map(item => item.id)).toEqual(["study"]);
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

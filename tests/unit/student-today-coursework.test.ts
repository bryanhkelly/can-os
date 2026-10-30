import { describe, expect, it } from "vitest";
import { isCurrentCoursework } from "@/domain/student-today-coursework";

const dayStart = new Date("2026-10-30T00:00:00Z");
const yesterday = new Date("2026-10-29T10:00:00Z");
const lastWeek = new Date("2026-10-23T10:00:00Z");
const tomorrow = new Date("2026-10-31T10:00:00Z");

describe("Student Today coursework currency", () => {
  it("keeps work returned for revision even after its due date has passed", () => {
    expect(isCurrentCoursework({
      submissionId: "sub-1", status: "returned", timeliness: "on_time",
      dueAt: lastWeek, submittedAt: lastWeek,
    }, dayStart)).toBe(true);
    expect(isCurrentCoursework({
      submissionId: "sub-2", status: "returned", timeliness: "late",
      dueAt: null, submittedAt: lastWeek,
    }, dayStart)).toBe(true);
  });
  it("keeps unstarted, missing, due-soon and freshly submitted work", () => {
    expect(isCurrentCoursework({
      submissionId: null, status: null, timeliness: null, dueAt: lastWeek, submittedAt: null,
    }, dayStart)).toBe(true);
    expect(isCurrentCoursework({
      submissionId: "sub-3", status: "assigned", timeliness: "missing", dueAt: lastWeek, submittedAt: null,
    }, dayStart)).toBe(true);
    expect(isCurrentCoursework({
      submissionId: "sub-4", status: "assigned", timeliness: "on_time", dueAt: tomorrow, submittedAt: null,
    }, dayStart)).toBe(true);
    expect(isCurrentCoursework({
      submissionId: "sub-5", status: "submitted", timeliness: "on_time", dueAt: tomorrow, submittedAt: yesterday,
    }, dayStart)).toBe(true);
  });
  it("keeps an overdue revision draft after the returned attempt becomes assigned", () => {
    expect(isCurrentCoursework({
      submissionId: "revision-draft", status: "assigned", timeliness: "on_time",
      dueAt: lastWeek, submittedAt: null,
    }, dayStart)).toBe(true);
  });
  it("keeps an undated draft until the student submits it", () => {
    expect(isCurrentCoursework({
      submissionId: "draft", status: "assigned", timeliness: "on_time",
      dueAt: null, submittedAt: null,
    }, dayStart)).toBe(true);
  });
  it("drops stale submitted or graded work that needs nothing from the student", () => {
    expect(isCurrentCoursework({
      submissionId: "sub-6", status: "submitted", timeliness: "on_time", dueAt: lastWeek, submittedAt: lastWeek,
    }, dayStart)).toBe(false);
    expect(isCurrentCoursework({
      submissionId: "sub-7", status: "graded", timeliness: "on_time", dueAt: lastWeek, submittedAt: lastWeek,
    }, dayStart)).toBe(false);
  });
  it("does not resurrect an older returned attempt once a newer revision is submitted", () => {
    // The server selects the latest attempt before filtering, so this
    // predicate only ever sees that newest row.
    expect(isCurrentCoursework({
      submissionId: "sub-8", status: "submitted", timeliness: "late", dueAt: lastWeek, submittedAt: lastWeek,
    }, dayStart)).toBe(false);
  });
});

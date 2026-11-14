import { describe, expect, it, vi } from "vitest";
import { ClassroomMediaStage } from "@/components/learning/ClassroomMediaStage";

const sectionA = "10000000-0000-4000-8000-000000000001";
const sectionB = "10000000-0000-4000-8000-000000000002";
const studentA = "20000000-0000-4000-8000-000000000001";
const studentB = "20000000-0000-4000-8000-000000000002";

function media(sectionId: string, role = "student", studentPersonId?: string) {
  return ClassroomMediaStage({
    recorded: null,
    meetings: { ok: true, data: [] },
    sectionId,
    role,
    studentPersonId,
    timezone: "America/Los_Angeles",
    commands: { get: vi.fn(), schedule: vi.fn(), saveLink: vi.fn() } as never,
  });
}

describe("classroom media audience isolation", () => {
  it("clears refreshed calendar, meeting URLs, and unsaved drafts when the Section changes", () => {
    expect(media(sectionA).key).not.toBe(media(sectionB).key);
    expect(media(sectionA).key).toBe(media(sectionA).key);
  });

  it("does not reuse meeting state between a guardian's different students", () => {
    expect(media(sectionA, "guardian", studentA).key)
      .not.toBe(media(sectionA, "guardian", studentB).key);
  });

  it("does not carry teacher meeting drafts into another persona", () => {
    expect(media(sectionA, "teacher").key)
      .not.toBe(media(sectionA, "student").key);
  });
});

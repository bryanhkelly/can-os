import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SectionLifecycleManager } from "@/components/operations/SectionLifecycleManager";
import type { getSectionLifecycle } from "@/modules/programs/section-lifecycle.functions";
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }));
vi.mock("@/modules/programs/section-lifecycle.functions", () => ({ searchLifecycleWaitlistStudents: vi.fn() }));
vi.mock("@/modules/staffing/educational-capacity.functions", () => ({ getCapacityCandidates: vi.fn(), swapCommittedInstructor: vi.fn() }));
const section: Awaited<ReturnType<typeof getSectionLifecycle>>[number] = {
  id: "section", title: "English", code: "ENG", active: true, programId: "program", termId: "term",
  startsAt: null, endsAt: null, scheduleTemplateId: null, scheduleOptions: [], teachers: [],
  students: [{ id: "enrollment", sectionId: "section", studentProfileId: "profile-enrolled", status: "active",
    name: "Jordan Fixture", gradeLevel: "9", studentNumber: "S001" }],
  waitlist: [{ id: "action", sectionId: "section", subjectId: "profile-waiting", status: "waiting",
    name: "Avery Fixture", gradeLevel: "10", studentNumber: "S002" }],
  allocations: [], demandId: null,
};
describe("registrar lifecycle student choices", () => {
  it("shows human identity labels for enrollment and waitlist with a bounded search entry point", () => {
    const html = renderToStaticMarkup(<SectionLifecycleManager sections={[section]} staff={[]} onChanged={async () => {}}/>);
    expect(html).toContain("Jordan Fixture · Grade 9 · Student #S001</option>");
    expect(html).toContain("Avery Fixture · Grade 10 · Student #S002");
    expect(html).not.toContain(">profile-enrolled<");
    expect(html).not.toContain("profile-waiting");
    expect(html).not.toContain("Student UUID");
    expect(html).toContain("Find students");
    expect(html).toContain("at least 2 characters");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add to waitlist/);
  });
});

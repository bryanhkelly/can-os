import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ data: null as unknown, search: {} as Record<string, unknown>, checklist: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useLoaderData: () => state.data, useSearch: () => state.search }),
  useRouter: () => ({ navigate: vi.fn(), invalidate: vi.fn() }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/modules/programs/launch-drafts.functions", () => ({
  getLaunchStudioDraft: vi.fn(), saveLaunchStudioDraft: vi.fn(), getStaffLaunchWorkspace: vi.fn(),
}));
vi.mock("@/modules/enrollment/guardian-family-applications.functions", () => ({
  getGuardianFamilyApplicationWorkspace: vi.fn(), startGuardianFamilyApplication: vi.fn(),
}));
vi.mock("@/modules/profiles/student-self-profile.functions", () => ({
  getStudentSelfProfile: vi.fn(), saveStudentSelfProfile: vi.fn(),
}));
vi.mock("@/modules/learning/course-registration.functions", () => ({
  getCourseRegistration: vi.fn(), requestCourseChange: vi.fn(),
}));
vi.mock("@/components/profiles/Qualifications", () => ({ Qualifications: () => <p>Canonical qualification workspace</p> }));
vi.mock("@/components/enrollment/GuardianEnrollmentChecklist", () => ({
  GuardianEnrollmentChecklist: ({ applicationId }: { applicationId: string }) => {
    state.checklist(applicationId); return <p>School-requested checklist: {applicationId}</p>;
  },
}));
import { Route as Family } from "@/routes/launch.family";
import { Route as Student } from "@/routes/launch.student";
import { Route as Staff } from "@/routes/launch.staff";

const application = { applicationId: "application", programId: "school", programName: "Isolated school",
  studentFirstName: "Fixture", studentLastName: "Learner", stage: "application", guardianVerified: false,
  updatedAt: "2027-01-01", schoolYearName: null, source: "family_account", originTransferActionId: null };
function render(route: typeof Family | typeof Student | typeof Staff) {
  const Page = route.options.component;
  if (typeof Page !== "function") throw new Error("Missing journey component");
  return renderToStaticMarkup(<Page />);
}
beforeEach(() => {
  state.search = {};
  state.checklist.mockClear();
});
describe("family Studio resource boundaries", () => {
  function family(verified = false) {
    state.data = { ok: true, data: { workspace: { programs: [], households: [], students: [],
      transferRequests: [], applications: [{ ...application, guardianVerified: verified }] }, draft: null, draftContext: ":" } };
  }
  it("does not fetch or mount private checklists before independent guardian verification", () => {
    family(); state.search = { application: "application", step: "documents" };
    expect(render(Family)).toContain("Guardian verification is pending.");
    expect(state.checklist).not.toHaveBeenCalled();
  });
  it("uses the exact verified application", () => {
    family(true); state.search = { programId: "school", application: "application", step: "documents" };
    expect(render(Family)).toContain("School-requested checklist: application");
    expect(state.checklist).toHaveBeenCalledExactlyOnceWith("application");
  });
  it.each([{ application: "unavailable" }, { application: "application", programId: "wrong-school" }])("never substitutes a different child or school: %j", search => {
    family(true); state.search = { ...search, step: "documents" };
    expect(render(Family)).toContain("No other child");
    expect(state.checklist).not.toHaveBeenCalled();
  });
  it("makes unconfigured documents explicit instead of listing fabricated requirements", () => {
    family(); state.search = { step: "documents" };
    const html = render(Family);
    expect(html).toContain("Required documents come from that school");
    expect(html).not.toContain("Birth certificate");
  });
});
describe("student and staff Studio drafts", () => {
  it("restores student profile draft fields without submitting them or claiming completion", () => {
    state.search = { step: "profile" };
    state.data = { ok: true, data: { profile: { preferredName: "Saved", preferredPronouns: "", interests: [] },
      registration: { sections: [], requests: [] }, draft: { revision: 1, savedAt: "2027-01-01",
        value: { audience: "student", fields: { preferredName: "Draft name", pronouns: "", interests: "Art", courseIds: [] } } } } };
    const html = render(Student);
    expect(html).toContain('value="Draft name"');
    expect(html).toContain("Save draft");
    expect(html).toContain("Save student profile");
    expect(html).not.toContain("100%");
  });
  it("shows a real empty course catalog, not example electives", () => {
    state.search = { step: "courses" };
    state.data = { ok: true, data: { profile: { preferredName: "", preferredPronouns: "", interests: [] },
      registration: { sections: [], requests: [] }, draft: null } };
    expect(render(Student)).toContain("no available courses here yet");
  });
  it("saves staff notes separately from independently verified evidence", () => {
    state.search = { step: "qualifications" };
    state.data = { ok: true, data: { workspace: { name: "Fixture staff", role: "teacher", canSubmitQualifications: true },
      draft: { revision: 1, savedAt: "2027-01-01", value: { audience: "staff", fields: { notes: "Ask about orientation" } } } } };
    const html = render(Staff);
    expect(html).toContain("Canonical qualification workspace");
    expect(html).toContain("Ask about orientation");
    expect(html).toContain("Save draft");
    expect(html).not.toContain("I acknowledge");
    expect(html).not.toContain("100%");
  });
  it("does not mount an evidence workflow for unsupported staff roles", () => {
    state.search = { step: "qualifications" };
    state.data = { ok: true, data: { workspace: { name: "Fixture staff", role: "counselor", canSubmitQualifications: false }, draft: null } };
    const html = render(Staff);
    expect(html).toContain("does not use the staff qualification submission workspace");
    expect(html).not.toContain("Canonical qualification workspace");
  });
});

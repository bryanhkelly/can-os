import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSessionResult } from "@/modules/identity/workspace-session.functions";
import { Route } from "@/routes/apply.index";

const state = vi.hoisted(() => ({
  data: null as unknown, search: {} as { program?: string },
  session: null as WorkspaceSessionResult["session"],
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    options, useLoaderData: () => state.data, useSearch: () => state.search,
  }),
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/components/shell/WorkspaceSession", () => ({
  useWorkspaceSession: () => ({ session: state.session, error: null }),
}));
vi.mock("@/modules/enrollment/family-application.functions", () => ({
  applicationGrades: ["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
  joinApplicationSchool: vi.fn(), listApplicationPrograms: vi.fn(), listMyApplications: vi.fn(),
  saveFamilyApplication: vi.fn(), submitFamilyApplication: vi.fn(),
}));
const program = {
  id: "program", name: "High School", school: "Example School", schoolSlug: "example",
  gradeRange: { min: "9", max: "12" },
};
function render() {
  const Page = Route.options.component;
  if (typeof Page !== "function") throw new Error("Application page component missing");
  return renderToStaticMarkup(<Page/>);
}
function signIn(role: "applicant" | "guardian" | "registrar", programIds = ["program"]) {
  state.session = {
    authenticated: true, activeGrantId: "grant", role, sites: [], programs: [], grants: [],
    activeContext: { organizationIds: ["org"], siteIds: ["site"], programIds },
  };
}
describe("family application page", () => {
  beforeEach(() => {
    state.data = { ok: true, data: [program] };
    state.search = {}; state.session = { authenticated: false };
  });
  it("publishes a program and verified-email registration, not a pre-authorized guardian form", () => {
    const html = render();
    expect(html).toContain("Example School");
    expect(html).toContain("Create applicant access");
    expect(html).toContain("Email verification link");
    expect(html).toContain('href="/access"');
    expect(html).not.toContain("Start an application");
    expect(html).not.toContain("Student first name");
  });
  it("shows an honest empty public catalog and disables registration", () => {
    state.data = { ok: true, data: [] };
    const html = render();
    expect(html).toContain("No programs are currently accepting online applications");
    expect(html).toMatch(/<button disabled=""[^>]*>Email verification link/);
  });
  it("does not substitute another program when a requested school is unavailable", () => {
    state.search = { program: "closed-program" };
    expect(render()).toContain("The requested program is unavailable");
    expect(render()).toMatch(/<button disabled=""[^>]*>Email verification link/);
  });
  it.each(["applicant", "guardian"] as const)("opens the application dashboard for an authorized %s", role => {
    signIn(role);
    const html = render();
    expect(html).toContain("Start an application");
    expect(html).toContain("My applications");
    expect(html).not.toContain("Student first name");
    expect(html).not.toContain("Create applicant access");
    expect(html).not.toContain("Submit application");
  });
  it("requires a server-authorized school membership before displaying the draft form", () => {
    signIn("applicant", []);
    const html = render();
    expect(html).toContain("Continue application at this school");
    expect(html).not.toContain("Student first name");
  });
  it("does not present registrar permissions as applicant access", () => {
    signIn("registrar");
    const html = render();
    expect(html).toContain("You are signed in as registrar");
    expect(html).toContain("Continue application at this school");
    expect(html).not.toContain("Student first name");
  });
  it("defaults a returning applicant to their own open program rather than another school's", () => {
    signIn("applicant");
    state.data = { ok: true, data: [{ ...program, id: "other-school" }, program] };
    const html = render();
    expect(html).toContain('<option value="program" selected=""');
    expect(html).toContain("Start an application");
  });
  it("reports catalog load failure instead of showing a successful empty state", () => {
    state.data = { ok: false, authError: null, message: "Catalog unavailable" };
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("No programs are currently accepting");
  });
});

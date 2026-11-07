import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { isLaunchStudioPath, launchRequirementProgress, schoolLaunchSearch, familyLaunchSearch } from "@/domain/launch-studio";
import { LaunchStudioChrome, LaunchStudioShell } from "@/components/launch-studio/LaunchStudioShell";
import { launchDraftValueSchema, saveLaunchDraftSchema, assertLaunchDraftAudience } from "@/domain/launch-draft";
import { resolveAccessContext } from "@/domain/access-context";
import { GuardianApplicationForm } from "@/components/enrollment/GuardianApplicationForm";

vi.mock("@tanstack/react-router", () => ({
  useBlocker: vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/modules/programs/launch-drafts.functions", () => ({ saveLaunchStudioDraft: vi.fn() }));
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("canonical standalone Launch Studio", () => {
  it.each(["/launch", "/launch/", "/launch/school", "/launch/school/program", "/launch/family"])("recognizes %s", path => {
    expect(isLaunchStudioPath(path)).toBe(true);
  });
  it.each(["/launchpad", "/operations/launch", "/operations/launch/program", "/home"])("does not recognize %s", path => {
    expect(isLaunchStudioPath(path)).toBe(false);
  });
  it("removes old route modules rather than redirecting to them", () => {
    for (const file of ["operations.launch.tsx", "operations.launch.index.tsx", "operations.launch.$programId.tsx", "guardian.apply.tsx"])
      expect(existsSync(new URL(`../../src/routes/${file}`, import.meta.url))).toBe(false);
    expect(source("src/routes/launch.school.tsx")).not.toContain("redirect(");
    expect(source("src/routes/__root.tsx")).toContain("? <LaunchStudioChrome>");
  });
  it("preserves exact school and application scope while bounding steps", () => {
    expect(schoolLaunchSearch.parse({ siteId: "site", programId: "program", step: "academics" }))
      .toEqual({ siteId: "site", programId: "program", step: "academics" });
    expect(schoolLaunchSearch.parse({ step: "approve" }).step).toBe("welcome");
    expect(familyLaunchSearch.parse({ programId: "program", application: "child", familyStart: "invite", step: "documents" }))
      .toEqual({ programId: "program", application: "child", familyStart: "invite", step: "documents" });
    const school = source("src/routes/launch.school.tsx");
    expect(school).toContain("staleTime: Infinity");
    expect(school).toContain("loaderDeps: ({ search }) => ({ siteId: search.siteId, programId: search.programId })");
  });
  it("never treats unconfigured requirements or a visited step as completion", () => {
    expect(launchRequirementProgress([])).toBeUndefined();
    expect(launchRequirementProgress([{ status: "complete" }, { status: "received" }, { status: "needs_can" }]))
      .toEqual({ complete: 1, total: 3 });
    const html = renderToStaticMarkup(<LaunchStudioShell role="School" subject="Test school" title="Welcome"
      steps={[{ id: "welcome", title: "Welcome" }, { id: "school", title: "School details" }]}
      currentId="school" onStepChange={vi.fn()}><p>Canonical task</p></LaunchStudioShell>);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Visiting a step does not complete it.");
    expect(html).not.toContain("100%");
    expect(html).not.toContain("Recorded complete");
  });
  it("renders compact chrome without workspace controls", () => {
    const html = renderToStaticMarkup(<LaunchStudioChrome><p>Journey</p></LaunchStudioChrome>);
    expect(html).toContain("Launch Studio");
    expect(html).toContain('href="#launch-help"');
    expect(html).not.toContain("Workspace sidebar");
    expect(html).not.toContain("Switch workspace");
    expect(html).not.toContain("Search CAN");
  });
});

describe("private launch drafts", () => {
  it("allows incomplete bounded form input but no submitted evidence or approval state", () => {
    expect(launchDraftValueSchema.parse({ audience: "staff", fields: { notes: "" } })).toBeDefined();
    expect(launchDraftValueSchema.safeParse({ audience: "staff", fields: { notes: "", approved: true } }).success).toBe(false);
    expect(launchDraftValueSchema.safeParse({ audience: "student", fields: {
      preferredName: "", pronouns: "", interests: "", courseIds: ["not-a-course"],
    } }).success).toBe(false);
    expect(launchDraftValueSchema.safeParse({ audience: "staff", fields: { notes: "a".repeat(4001) } }).success).toBe(false);
  });
  it("rejects caller-supplied ownership and mismatched audience", () => {
    const input = { audience: "staff", context: "", expectedRevision: 0,
      value: { audience: "staff", fields: { notes: "Prepare questions" } } };
    expect(saveLaunchDraftSchema.safeParse(input).success).toBe(true);
    expect(saveLaunchDraftSchema.safeParse({ ...input, accountId: "somebody-else" }).success).toBe(false);
    expect(saveLaunchDraftSchema.safeParse({ ...input, audience: "school" }).success).toBe(false);
  });
  it("requires a verified capability and appropriate audience without broadening membership", () => {
    const grant = { id: "grant", accountId: "account", personId: "person", role: "student",
      organizationId: "org", siteId: "site", active: true };
    const actor = resolveAccessContext({ accountId: "account", sessionId: "session", activeGrantId: "grant" }, [grant]);
    expect(() => assertLaunchDraftAudience(actor, "student")).not.toThrow();
    expect(() => assertLaunchDraftAudience(actor, "school")).toThrow();
    expect(() => assertLaunchDraftAudience(actor, "family")).toThrow();
    expect(() => assertLaunchDraftAudience({ ...actor, capabilities: new Set() }, "student")).toThrow();
    expect(actor.scope.siteIds).toEqual(["site"]);
  });
  it("restores a partial family draft and offers Save draft without submitting", () => {
    const html = renderToStaticMarkup(<GuardianApplicationForm embedded draftContext="program:invite"
      programs={[{ id: "program", name: "School", schoolYears: [{ id: "year", name: "2027" }] }]}
      households={[]} draft={{ revision: 3, savedAt: "2027-01-01T00:00:00Z",
        value: { audience: "family", fields: { requestId: "00000000-0000-4000-8000-000000000001",
          programId: "program", schoolYearId: "year", studentOptionId: "", householdId: "",
          firstName: "Draft", lastName: "", grade: "" } } }}
      onSubmit={vi.fn()} />);
    expect(html).toContain('value="Draft"');
    expect(html).toContain("Save draft");
    expect(html).toContain("Submit application");
    expect(html).not.toContain('aria-label="Setup progress"');
  });
  it("keeps the school website step a status handoff and leaves private previews to Website Studio", () => {
    const launchWebsite = source("src/components/operations/LaunchWebsiteStep.tsx");
    const websiteEditor = source("src/routes/site-website.tsx");
    expect(launchWebsite).toContain("LaunchWebsiteEditorHandoff");
    expect(launchWebsite).not.toContain("<iframe");
    expect(launchWebsite).not.toContain("previewPages");
    expect(websiteEditor).toContain("<WebsitePreviewPanel");
    expect(websiteEditor).toContain('device === "mobile" ? 390 : undefined');
  });
  it("renders staff preparation notes only with the staff details step", () => {
    const staff = source("src/routes/launch.staff.tsx");
    const details = staff.indexOf('{step === "details" && <>');
    const notes = staff.indexOf('id="staff-launch-notes"');
    const qualifications = staff.indexOf('<LaunchStudioStepContent active={step === "qualifications"}');
    expect(details).toBeGreaterThan(-1);
    expect(notes).toBeGreaterThan(details);
    expect(qualifications).toBeGreaterThan(notes);
    expect(staff.match(/id="staff-launch-notes"/g)).toHaveLength(1);
  });
  it("keeps recorded instruction distinct from scheduled live teaching and Section staffing", () => {
    const delivery = source("src/components/operations/LaunchDeliveryModelFields.tsx");
    const academics = source("src/components/operations/LaunchAcademicSetupWorkspace.tsx");
    expect(delivery).toContain("Scheduled live teaching (optional)");
    expect(delivery).toContain("Recorded or self-paced learning");
    expect(delivery).toContain("live help for questions");
    expect(academics).toContain("Instruction and support readiness");
    expect(academics).toContain("administrative assignment does not select the presenter");
    expect(academics).toContain("Responsible Section instructor");
    expect(academics).not.toContain("Next: choose your teachers");
  });

  it("does not turn a no-longer-accessible saved student into a new student", () => {
    const html = renderToStaticMarkup(<GuardianApplicationForm embedded draftContext="program:invite"
      programs={[{ id: "program", name: "School", schoolYears: [{ id: "year", name: "2027" }] }]}
      households={[]} draft={{ revision: 3, savedAt: "2027-01-01T00:00:00Z",
        value: { audience: "family", fields: { requestId: "00000000-0000-4000-8000-000000000001",
          programId: "program", schoolYearId: "year", studentOptionId: "revoked:household", householdId: "",
          firstName: "Draft", lastName: "Learner", grade: "9" } } }}
      onSubmit={vi.fn()} />);
    expect(html).toContain("No new student identity will be created");
    expect(html).toContain("Start a different student");
    expect(html).toMatch(/disabled=""[^>]*>Submit application/);
  });
});

it("renders a focused module without school wizard navigation or nested main landmarks",()=>{
  const html=renderToStaticMarkup(<LaunchStudioShell focused role="Academic Program" subject="School" title="Configure academics" steps={[{id:"school",title:"School details"}]} currentId="school" onStepChange={vi.fn()}><p>Canonical Program controls</p></LaunchStudioShell>);
  expect(html).toContain("Canonical Program controls");
  expect(html).not.toContain('aria-label="Launch steps"');
  expect(html).not.toContain('aria-label="Journey navigation"');
  expect(html).not.toContain("<main");
});

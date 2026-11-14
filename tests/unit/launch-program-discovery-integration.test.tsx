import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/launch-studio/SchoolConfigurationContext", () => ({
  SchoolConfigurationContextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSchoolConfigurationNavigation: () => ({ modulePath: "/launch/hub/school/$module", context: "launch" }),
}));
vi.mock("@/components/launch-studio/ProgramDiscoveryPanel", () => ({
  ProgramDiscoveryPanel: ({ siteId }: { siteId: string }) =>
    <div data-testid="canonical-discovery" data-site-id={siteId}>Published Offering discovery</div>,
}));
vi.mock("@/components/operations/LaunchWizardPage", () => ({
  LaunchWizardPage: () => <div>Launch academic wizard</div>,
}));
vi.mock("@/components/operations/LaunchAcademicSetupWorkspace", () => ({
  LaunchAcademicSetupWorkspace: () => <div>Existing Program academics</div>,
}));
vi.mock("@/routes/admin", () => ({ ScopedAdminConsole: () => null }));
vi.mock("@/components/operations/SchoolOpeningEvidencePanel", () => ({
  SchoolOpeningEvidencePanel: () => null,
}));
vi.mock("@/components/operations/LaunchPreparationWorkspace", () => ({
  LaunchPreparationWorkspace: () => null,
}));
vi.mock("@/components/launch-studio/SchoolProfileConfiguration", () => ({
  SchoolProfileConfiguration: () => null,
}));
vi.mock("@/components/launch-studio/SiteInformationConfiguration", () => ({
  SiteInformationConfiguration: () => null,
}));

import { SchoolHubWorkflow } from "@/components/launch-studio/SchoolHubWorkflow";

const siteId = "00000000-0000-4000-8000-000000000001";
const programId = "00000000-0000-4000-8000-000000000002";
const base = {
  options: {
    sites: [{ id: siteId, name: "Authorized school", organizationId: "org", updatedAt: new Date() }],
    organizations: [{ id: "org" }],
    canCreateSite: false,
  },
  selectionError: null,
  launches: [],
  selectedProgramId: null,
  statuses: {},
  canonicalCatalogEnabled: true,
};

describe("canonical discovery in Launch Studio academics", () => {
  it("offers scoped discovery alongside initial academic preparation without creating a Program", () => {
    const html = renderToStaticMarkup(
      <SchoolHubWorkflow module="academics" selection={{ siteId }} data={base as never} />,
    );
    expect(html).toContain(`data-site-id="${siteId}"`);
    expect(html).toContain("Launch academic wizard");
    expect(html).not.toContain("Existing Program academics");
  });

  it("keeps published Offering discovery scoped to the selected Site alongside an existing Program", () => {
    const html = renderToStaticMarkup(
      <SchoolHubWorkflow module="academics" selection={{ siteId, programId }}
        data={{ ...base, launches: [{ id: programId, name: "School Program" }],
          selectedProgramId: programId, academic: {} } as never} />,
    );
    expect(html).toContain(`data-site-id="${siteId}"`);
    expect(html).toContain("Existing Program academics");
    expect(html).not.toContain("Launch academic wizard");
  });

  it("does not expose an unprovisioned catalog in legacy School Hub", () => {
    const html = renderToStaticMarkup(
      <SchoolHubWorkflow module="academics" selection={{ siteId }}
        data={{ ...base, canonicalCatalogEnabled: false } as never}/>,
    );
    expect(html).toContain("Published program discovery is not enabled");
    expect(html).toContain("Launch academic wizard");
    expect(html).not.toContain("canonical-discovery");
  });

  it("does not mount discovery or a configuration workflow for an unauthorized Site selection", () => {
    const html = renderToStaticMarkup(
      <SchoolHubWorkflow module="academics" selection={{ siteId }} data={{
        ...base, selectionError: "Site unavailable", launches: [{ id: programId, name: "Program" }],
      } as never} />,
    );
    expect(html).toContain("Site unavailable");
    expect(html).not.toContain("canonical-discovery");
  });
});

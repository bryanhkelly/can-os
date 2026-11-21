import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Launch Studio copy guard. These checks target customer-facing prose, not
 * domain constants or operational services. New active Launch Studio screens
 * should be added to the list as they are introduced.
 */
const source = (file: string) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

const activeScreens = [
  "src/domain/launch-introduce-v61.ts",
  "src/domain/launch-prepare-v61.ts",
  "src/components/launch-studio/EstablishExperiencesV61.tsx",
  "src/components/launch-studio/EstablishProgramsAudiencesV61.tsx",
  "src/components/launch-studio/EstablishSiteInformationV61.tsx",
  "src/components/launch-studio/WebsiteSiteContentStep.tsx",
  "src/components/launch-studio/WebsiteContentConsentStep.tsx",
  "src/components/launch-studio/MarketingPackageWizardV61.tsx",
  "src/components/launch-studio/MarketingPackageReleaseControlsV61.tsx",
  "src/components/launch-studio/MarketingPackagesV61.tsx",
  "src/components/launch-studio/SolutionCatalogV61.tsx",
  "src/components/launch-studio/LaunchReadinessPanelV61.tsx",
  "src/components/launch-studio/LaunchSitePublicationPanel.tsx",
  "src/components/launch-studio/LaunchStudioShell.tsx",
] as const;

// These phrases explain implementation details rather than guiding a person.
const staleCopy = [
  "Site-scoped records",
  "Published Solution model",
  "Created does not mean sent",
  "Primary Who ·",
  "Secondary Who ·",
  "Twelve groups, all expanded",
  "Your verified Site administrator grant",
  "Every topic is visible. Choose up to five",
  "Bring people into the right scoped roles",
  "No approval or absence is inferred",
  "Homepage hero H1",
  "Collect evidence and request independent opening decisions",
] as const;

describe("Launch Studio V6.1 editorial contract", () => {
  it.each(activeScreens)("%s keeps internal implementation language out of instructions", file => {
    const text = source(file);
    for (const phrase of staleCopy) expect(text, `${file}: ${phrase}`).not.toContain(phrase);
  });

  it("guides operators through experiences rather than describing the UI structure", () => {
    const text = source("src/components/launch-studio/EstablishExperiencesV61.tsx");
    expect(text).toContain("What would you love to bring to your community?");
    expect(text).toContain("up to five experiences");
    expect(text).toContain("Make these Experiences yours");
  });

  it("shows faith questions based on saved Site identity without losing prior copy", () => {
    const text = source("src/components/launch-studio/WebsiteSiteContentStep.tsx");
    expect(text).toContain("const faithFields=fields.filter");
    expect(text).toContain("const showFaithFields=faithBased||hasSavedFaithContent");
    expect(text).toContain("Faith and values (optional)");
    expect(text).toContain("Previously saved faith information");
    expect(text).toContain("{faithFields.map(renderField)}");
    expect(text).toContain("canReuse&&churchSite&&");
    expect(text).toContain("Tell your story");
  });

  it("keeps Solution planning approachable without changing review authority", () => {
    const editor = source("src/components/launch-studio/CanonicalBlueprintWorkspace.tsx");
    const picker = source("src/components/launch-studio/BlueprintComponentPicker.tsx");
    const prepare = source("src/components/launch-studio/LaunchPrepareV61.tsx");
    expect(editor).toContain("Make this solution work for your community");
    expect(editor).toContain("Name your plan");
    expect(editor).toContain("Connect your approved plan");
    expect(editor).not.toContain(">Create planning Deployment<");
    expect(picker).toContain("What this solution includes");
    expect(prepare).toContain("Programs you want to explore");
    expect(prepare).not.toContain("existing governed commands");
  });

  it("keeps outreach messages accurate when materials have not been created", () => {
    const editor = source("src/components/launch-studio/MarketingPackagesV61.tsx");
    const wizard = source("src/components/launch-studio/MarketingPackageWizardV61.tsx");
    expect(editor).toContain("const hasDownloadableMaterials=downloadablePackageReleases.length>0");
    expect(editor).toContain("const materialAvailabilityMessage=releasesUnavailable");
    expect(editor).toContain("These links open site-wide records");
    expect(editor).not.toContain("Only replies and interest recorded for this outreach will appear in its results");
    expect(wizard).toContain("Review & save");
    expect(wizard).toContain("Save this outreach plan first");
    expect(wizard).not.toContain("create coordinated materials. Nothing is sent");
  });

  it("uses one four-stage language framework without changing canonical module routes", () => {
    const navigation = source("src/domain/launch-site-navigation-v61.ts");
    const overview = source("src/components/launch-studio/LaunchStudioOverviewV61.tsx");
    const route = source("src/routes/launch.site.tsx");
    const outreach = source("src/domain/launch-introduce-v61.ts");
    const website = source("src/routes/site-website.tsx");
    expect(navigation).toContain('["Shape", "Share", "Prepare", "Launch"]');
    expect(navigation).toContain('stage: "Shape", id: "site-profile"');
    expect(navigation).toContain('stage: "Share", id: "create-outreach"');
    expect(navigation).toContain('stage: "Launch", id: "open", title: "Opening Checklist"');
    expect(overview).toContain("Your path to launch");
    expect(overview).toContain("Shape your vision. Share your story. Prepare to deliver. Launch when ready.");
    expect(route).toContain('eyebrow="Shape / Site Profile"');
    expect(route).toContain('eyebrow="Shape / Programs & Audiences"');
    expect(outreach).toContain('eyebrow:"Share / Create Outreach"');
    expect(website).toContain('eyebrow="Shape / Website & Brand"');
    expect(route).toContain('module: z.enum(siteLaunchModules.map(item=>item.id)');
  });

  it("keeps publication and registration decisions separate", () => {
    const copy = source("src/components/launch-studio/LaunchSitePublicationPanel.tsx");
    const readiness = source("src/components/launch-studio/LaunchReadinessPanelV61.tsx");
    expect(copy).toContain("Publishing your website is separate from opening registration.");
    expect(readiness).toContain("Registration opens separately for each approved offering.");
  });

  it("states clearly that outreach plans do not automatically send anything", () => {
    const copy = source("src/components/launch-studio/MarketingPackageReleaseControlsV61.tsx");
    expect(copy).toContain("Nothing is sent or published automatically");
  });
});

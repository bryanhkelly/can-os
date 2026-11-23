import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/** V6.1 Launch Studio design contract: inspect rendered-feature source, not a
 * list of incidental JSX strings. Browser/axe checks remain a separate gate. */
const sources = [
  "src/components/workflow/guided-setup-shell.tsx",
  "src/components/launch-studio/LaunchSiteFrameV61.tsx",
  "src/components/launch-studio/LaunchStudioOverviewV61.tsx",
  "src/components/launch-studio/EstablishSiteProfileUnified.tsx",
  "src/components/launch-studio/EstablishSiteInformationV61.tsx",
  "src/components/launch-studio/EstablishProgramsAudiencesV61.tsx",
  "src/components/launch-studio/MarketingPackagesV61.tsx",
  "src/components/launch-studio/MarketingMaterialPreviewV61.tsx",
  "src/components/launch-studio/LaunchPreviewSharing.tsx",
  "src/components/launch-studio/LaunchPrepareV61.tsx",
  "src/components/launch-studio/LaunchReadinessPanelV61.tsx",
  "src/components/launch-studio/LaunchNavigationGuardProvider.tsx",
  "src/components/launch-studio/LaunchSitePublicationPanel.tsx",
  "src/components/launch-studio/CanonicalBlueprintWorkspace.tsx",
  "src/components/launch-studio/BlueprintOfferingAdoptionPicker.tsx",
  "src/components/launch-studio/BlueprintReferenceCatalogPanel.tsx",
  "src/components/launch-studio/BlueprintReviewHistoryPanel.tsx",
  "src/components/launch-studio/NativeAdoptionEvidenceChecklist.tsx",
  "src/components/launch-studio/NativeOfferingAdoptionReviewPanel.tsx",
  "src/components/launch-studio/SiteContentChannelEditor.tsx",
  "src/components/launch-studio/SchoolBrandPreview.tsx",
  "src/components/launch-studio/LaunchModuleDestinationV61.tsx",
  "src/components/launch-studio/SolutionCatalogV61.tsx",
  "src/components/launch-studio/ProgramDiscoveryPanel.tsx",
  "src/components/launch-studio/WebsiteTemplateGallery.tsx",
  "src/components/launch-studio/WebsiteVisualIdentityStep.tsx",
  "src/components/launch-studio/WebsiteArtworkField.tsx",
  "src/components/launch-studio/WebsiteCopyField.tsx",
  "src/routes/site-website.tsx",
  "src/routes/launch.site.tsx",
] as const;

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
type ParsedFile = ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] };
const nativeFormControls = new Set(["button", "input", "select", "textarea"]);

function diagnostics(path: string) {
  const source = read(path);
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) as ParsedFile;
  const rawControls: string[] = [];
  const scan = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(parsed);
      if (nativeFormControls.has(name)) rawControls.push(name);
    }
    ts.forEachChild(node, scan);
  };
  scan(parsed);
  return { parseErrors: parsed.parseDiagnostics ?? [], rawControls };
}

describe("V6.1 current Launch Studio presentation contract", () => {
  it.each(sources)("%s parses and composes shared form controls", path => {
    const check = diagnostics(path);
    expect(check.parseErrors, `Syntax errors in ${path}`).toEqual([]);
    expect(check.rawControls, `Raw controls in ${path}`).toEqual([]);
  });

  it.each(sources)("%s uses rectangular, semantic application styling", path => {
    const content = read(path);
    expect(content, `Rounded geometry in ${path}`).not.toMatch(
      /\brounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/,
    );
    expect(content, `Hardcoded UI alert colors in ${path}`).not.toMatch(
      /\b(?:bg|text|border)-(?:amber|yellow|red|green|blue|rose)-[1-9]00\b/,
    );
  });

  it("routes mobile navigation through shared modal and keeps a readable tablet canvas", () => {
    const frame = read("src/components/launch-studio/LaunchSiteFrameV61.tsx");
    expect(frame).toContain('import { Modal } from "@/components/ui/modal"');
    expect(frame).toContain('var(--sidebar-width)');
    expect(frame).toContain('className="xl:hidden"');
    expect(frame).toContain('min-h-11 items-center border-l-2');
    expect(frame).not.toContain('href="#launch-help"');
  });

  it("uses the shared internal-step and choice-card controls throughout Launch Studio", () => {
    const website = read("src/routes/site-website.tsx");
    const workflow = read("src/components/workflow/index.ts");
    expect(website).toContain("<GuidedSetupShell");
    expect(website).not.toContain('<nav aria-label="Website & Brand steps"');
    expect(workflow).toContain("GuidedSetupProgress");
    for (const path of [
      "src/components/launch-studio/EstablishSiteInformationV61.tsx",
      "src/components/launch-studio/EstablishProgramsAudiencesV61.tsx",
      "src/components/launch-studio/WebsiteBrandIdentityStep.tsx",
      "src/components/launch-studio/WebsiteTemplateGallery.tsx",
      "src/components/launch-studio/WebsiteVisualIdentityStep.tsx",
      "src/components/launch-studio/SolutionCatalogV61.tsx",
      "src/components/operations/LaunchSchoolModelPicker.tsx",
      "src/components/operations/OnsitePickupPanel.tsx",
      "src/routes/canonical.lab.enrollment.tsx",
    ]) {
      expect(read(path), path).toContain("<SelectionCard");
    }
    expect(read("src/components/workspace/selection-card.tsx")).not.toContain('layout?: "horizontal" | "vertical"');
  });

  it("does not repeat Launch Studio page headers inside guided workflow cards", () => {
    const siteInfo = read("src/components/launch-studio/EstablishSiteInformationV61.tsx");
    const launchRoute = read("src/routes/launch.site.tsx");
    const website = read("src/routes/site-website.tsx");
    expect(siteInfo).toContain('<GuidedSetupShell title="Site Information" showHeader={false}');
    expect(launchRoute).toContain('WorkspaceShell title="Programs & Audiences"');
    expect(website).toContain('title="Website & Brand" showHeader={false}');
    expect(website.match(/title="Website & Brand" showHeader=\{false\}/g)).toHaveLength(2);
  });

  it("keeps outreach page and content-card titles distinct", () => {
    const outreach = read("src/components/launch-studio/MarketingPackagesV61.tsx");
    expect(outreach).toContain('<WorkspacePanel title="Audience & highlights">');
    expect(outreach).toContain('<WorkspacePanel title="Message & materials">');
    expect(outreach).toContain('<WorkspacePanel title="Available materials"');
    expect(outreach).toContain('<WorkspacePanel title="Responses & events"');
    expect(outreach).not.toContain('<WorkspacePanel title={record.title}>');
    expect(outreach).not.toContain('<WorkspacePanel title="Use & Share"');
    expect(outreach).not.toContain('<WorkspacePanel title="Follow Up"');
  });

  it("applies one-purpose headings across Shape, Prepare and the Launch frame", () => {
    const siteProfile = read("src/components/launch-studio/EstablishSiteProfileUnified.tsx");
    const siteInfo = read("src/components/launch-studio/EstablishSiteInformationV61.tsx");
    const programs = read("src/components/launch-studio/EstablishProgramsAudiencesV61.tsx");
    const experiences = read("src/components/launch-studio/EstablishExperiencesV61.tsx");
    const prepare = read("src/components/launch-studio/LaunchPrepareV61.tsx");
    const frame = read("src/components/launch-studio/LaunchSiteFrameV61.tsx");

    expect(siteProfile).toContain('<WorkspacePanel title="Site essentials">');
    expect(siteInfo).toContain('title="Describe your Site and its host"');
    expect(siteInfo).toContain('title="Where and how will people take part?"');
    expect(siteInfo).toContain('title="Would you like to connect with a network?"');
    expect(siteInfo).toContain("Tell your Site's story");
    expect(programs).toContain('showHeader={step !== 2}');
    expect(programs).toContain('<legend className="sr-only">Programs you want to explore</legend>');
    expect(programs).toContain('<legend className="sr-only">Audiences you hope to serve (optional)</legend>');
    expect(experiences).toContain('<h2 className="font-serif text-2xl">');
    expect(experiences).toContain('<h4 id={"experience-group-"+group.id}');
    expect(experiences).not.toContain("<h5");
    expect(prepare).toContain('title={module === "funding-enrollment" ? "Before people register" : "Opening decisions and requirements"}');
    expect(frame).toContain("Shape · Share · Prepare · Launch");
  });

  it("keeps Publish Website and Opening Checklist card headings distinct from H1", () => {
    const publication = read("src/components/launch-studio/LaunchSitePublicationPanel.tsx");
    const readiness = read("src/components/launch-studio/LaunchReadinessPanelV61.tsx");
    const opening = read("src/components/launch-studio/LaunchModuleDestinationV61.tsx");

    expect(publication).toContain('<WorkspacePanel title="Final website checks"');
    expect(publication).not.toContain('<WorkspacePanel title="Publish your website"');
    expect(readiness).toContain('context==="open" ? "Readiness status"');
    expect(readiness).not.toContain('"Your opening checklist"');
    expect(opening).toContain('"Next steps to open"');
    expect(opening).not.toContain('"Welcome participants"');
  });

  it("reuses internal-step visuals and exposes selectable preview states", () => {
    const wizard = read("src/components/launch-studio/MarketingPackageWizardV61.tsx");
    const gallery = read("src/components/launch-studio/WebsiteTemplateGallery.tsx");
    expect(wizard).toContain("<GuidedSetupProgress");
    expect(wizard).toContain('label="Share outreach steps"');
    expect(gallery).toContain("aria-pressed={viewport===size}");
    expect(gallery).toContain('kind="radio" name="site-wireframe"');
    expect(gallery).toContain("<SelectionCard");
  });

  it("keeps the Launch Studio navigation drawer accessible and aligned", () => {
    const frame = read("src/components/launch-studio/LaunchSiteFrameV61.tsx");
    expect(frame).toContain("aria-expanded={drawer} aria-controls={navigationDrawerId}");
    expect(frame).toContain("<Modal id={navigationDrawerId} open={drawer}");
    expect(frame).toContain("can-shell-bar");
    expect(frame).toContain("px-[var(--page-gutter)]");
  });

  it("uses the same V6.1 actions and confirmation pattern for saved work", () => {
    const guided = read("src/components/workflow/guided-setup-shell.tsx");
    const packages = read("src/components/launch-studio/MarketingPackagesV61.tsx");
    const website = read("src/routes/site-website.tsx");
    const programs = read("src/components/launch-studio/EstablishProgramsAudiencesV61.tsx");
    expect(guided).toContain('variant="ghost"');
    expect(packages).toContain("discardDialogOpen");
    expect(packages).toContain('title="Discard unsaved package changes?"');
    expect(website).toContain("setConfirmation");
    expect(website).toContain("<ActionDialog");
    expect(packages).not.toContain("window.confirm");
    expect(website).not.toContain("window.confirm");
    expect(programs).toContain("<ActionFooter");
    expect(programs).toContain("Reload Site and review saved choices");
  });

  it("validates Prepare module syntax, including Funding & Admissions Setup", () => {
    const prepare = read("src/components/launch-studio/LaunchPrepareV61.tsx");
    expect(diagnostics("src/components/launch-studio/LaunchPrepareV61.tsx").parseErrors).toEqual([]);
    expect(prepare).toContain('"funding-enrollment": {');
    expect(prepare).toContain('question: "How will you fund your programs and help people join?",');
  });
});

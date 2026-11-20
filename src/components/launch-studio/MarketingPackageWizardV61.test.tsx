import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { initialMarketingContent, marketingPurposeOptions } from "@/domain/marketing-package-v61";
import { MarketingPackageWizardV61 } from "./MarketingPackageWizardV61";

const content = initialMarketingContent("Test Learning Site", "site-announcement");
const props = {
  siteId: "00000000-0000-4000-8000-000000000121",
  step: 0, title: "Community introduction", content,
  busy: false, brandVersionId: null, currentSuggestion: null,
  purposeOptions: marketingPurposeOptions,
  activePreviewFormat: null,
  starter: (purpose: typeof content.purpose) => initialMarketingContent("Test Learning Site", purpose),
  onTitleChange: vi.fn(), onPatch: vi.fn(), onPreviewFormatChange: vi.fn(),
  onBack: vi.fn(), onSaveExit: vi.fn(), onNext: vi.fn(), hasSavedPackage: false,
};

describe("V6.1 Marketing Package shared controls", () => {
  it("uses labelled selection-card radio inputs for package purpose", () => {
    const html = renderToStaticMarkup(<MarketingPackageWizardV61 {...props} />);
    expect(html).toContain("Introduce our Site");
    expect(html).toContain('name="package-purpose"');
    expect(html.match(/type="radio"/g)).toHaveLength(marketingPurposeOptions.length);
    expect(html).toContain("Package name");
  });

  it("uses shared checkbox options for audiences and never implies contact permission", () => {
    const html = renderToStaticMarkup(<MarketingPackageWizardV61 {...props} step={1}/>);
    expect(html).toContain("Parents and families");
    expect(html).toContain("Older adults");
    expect(html).toContain("This does not add contacts or authorize emails.");
    expect(html).toContain('type="checkbox"');
  });

  it("keeps material format choice separate from the preview action", () => {
    const html = renderToStaticMarkup(<MarketingPackageWizardV61 {...props} step={3}/>);
    expect(html).toContain("Available formats");
    expect(html).toContain("QR card");
    expect(html.match(/type="checkbox"/g)).toHaveLength(5);
    expect(html.match(/>Preview<\/button>/g)).toHaveLength(5);
    expect(html).toContain("This is a private working preview");
  });
});
